import type { GenericId } from "convex/values";
import { describe, expect, it } from "vitest";
import {
  adjustPoints,
  awardEventPoints,
  computeLedgerPoints,
  eventHasAwards,
  requireEligibleParticipant,
} from "../../convex/admin/pointsLedger";
import { expectAdminErrorCode } from "../helpers/adminErrors";
import { createConvexTest, type ConvexTestInstance } from "../helpers/convexTestContext";

const START = 1_000;
const END = 2_000;
const NOW = START;
const QR = "ab".repeat(32);
const FOOD = "sesame allergy";

const SENSITIVE_KEYS = ["qrCodeToken", "foodRestriction", "password", "sessionToken"];

async function insertAdmin(
  t: ConvexTestInstance,
  role: "admin" | "reviewer" = "admin",
  active = true,
) {
  return t.run((ctx) =>
    ctx.db.insert("admins", {
      email: `${role}-${active ? "on" : "off"}-${Math.random()}@hackuta.org`,
      name: role,
      role,
      active,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
}

async function insertParticipant(
  t: ConvexTestInstance,
  adminId: GenericId<"admins">,
  status: "accepted" | "under_review" | "none",
  points?: number,
) {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { email: `person-${Math.random()}@example.com`, name: "Person" }),
  );
  const applicationId = await t.run((ctx) =>
    ctx.db.insert("applications", {
      authUserId: userId,
      email: "person@example.com",
      createdAt: 1,
      formSubmitted: true,
      submittedAt: 2,
    }),
  );
  if (status !== "none") {
    await t.run((ctx) =>
      ctx.db.insert("applicationReviews", {
        applicationId,
        status,
        createdAt: 1,
        updatedAt: 1,
      }),
    );
  }
  return t.run((ctx) =>
    ctx.db.insert("participants", {
      applicationId,
      authUserId: userId,
      acceptedAt: 3,
      acceptedBy: adminId,
      qrCodeToken: QR,
      foodRestriction: FOOD,
      ...(points !== undefined ? { points } : {}),
      createdAt: 3,
      updatedAt: 3,
    }),
  );
}

async function insertEvent(
  t: ConvexTestInstance,
  fields: { pointsAwarded?: number; active?: boolean; startsAt?: number; endsAt?: number } = {},
) {
  return t.run((ctx) =>
    ctx.db.insert("events", {
      name: "Workshop",
      pointsAwarded: fields.pointsAwarded ?? 10,
      startsAt: fields.startsAt ?? START,
      endsAt: fields.endsAt ?? END,
      active: fields.active ?? true,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
}

async function logsFor(t: ConvexTestInstance, participantId: GenericId<"participants">) {
  return t.run((ctx) =>
    ctx.db
      .query("volunteerActionLogs")
      .withIndex("by_participant", (q) => q.eq("participantId", participantId))
      .collect(),
  );
}

function expectNoSensitiveLogFields(rows: Array<Record<string, unknown>>) {
  for (const row of rows) {
    for (const key of SENSITIVE_KEYS) {
      expect(row).not.toHaveProperty(key);
    }
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain(QR);
    expect(serialized).not.toContain(FOOD);
  }
}

describe("event point awards", () => {
  it("awards the event amount once and matches the ledger", async () => {
    const t = createConvexTest();
    const adminId = await insertAdmin(t);
    const participantId = await insertParticipant(t, adminId, "accepted");
    const eventId = await insertEvent(t);
    const otherEventId = await insertEvent(t, { pointsAwarded: 5 });

    const first = await t.run((ctx) =>
      awardEventPoints(ctx, { actorAdminId: adminId, participantId, eventId, now: NOW }),
    );
    expect(first).toEqual({ previousPoints: 0, newPoints: 10, pointsAwarded: 10 });

    await t.run((ctx) =>
      awardEventPoints(ctx, { actorAdminId: adminId, participantId, eventId: otherEventId, now: NOW }),
    );
    const adjusted = await t.run((ctx) =>
      adjustPoints(ctx, {
        actorAdminId: adminId,
        participantId,
        delta: -3,
        reason: "  duplicate scan  ",
      }),
    );
    expect(adjusted).toMatchObject({ previousPoints: 15, newPoints: 12, pointsDelta: -3 });

    const stored = await t.run(async (ctx) => {
      const participant = await ctx.db.get(participantId);
      const ledger = await computeLedgerPoints(ctx, participantId);
      return { points: participant?.points, ledger };
    });
    expect(stored.points).toBe(12);
    expect(stored.ledger).toBe(stored.points);

    const logs = await logsFor(t, participantId);
    expect(logs.map((log) => log.action)).toEqual(["point_scan", "point_scan", "admin_adjust"]);
    expect(logs[2]?.reason).toBe("duplicate scan");
    expectNoSensitiveLogFields(logs);

    await expectAdminErrorCode(
      t.run((ctx) => awardEventPoints(ctx, { actorAdminId: adminId, participantId, eventId, now: NOW })),
      "POINTS_ALREADY_AWARDED",
    );
    const afterDuplicate = await t.run(async (ctx) => (await ctx.db.get(participantId))?.points);
    expect(afterDuplicate).toBe(12);
    expect(await logsFor(t, participantId)).toHaveLength(3);
  });

  it("awards points regardless of the event's startsAt and endsAt", async () => {
    const t = createConvexTest();
    const adminId = await insertAdmin(t);
    const eventId = await insertEvent(t, { pointsAwarded: 3 });

    for (const now of [START - 1, END, END + 1]) {
      const participantId = await insertParticipant(t, adminId, "accepted", 0);
      const result = await t.run((ctx) =>
        awardEventPoints(ctx, { actorAdminId: adminId, participantId, eventId, now }),
      );
      expect(result.newPoints).toBe(3);
    }
  });

  it("rejects an inactive, missing, or invalid event", async () => {
    const t = createConvexTest();
    const adminId = await insertAdmin(t);
    const participantId = await insertParticipant(t, adminId, "accepted", 4);
    const inactiveId = await insertEvent(t, { active: false });

    await expectAdminErrorCode(
      t.run((ctx) =>
        awardEventPoints(ctx, { actorAdminId: adminId, participantId, eventId: inactiveId, now: NOW }),
      ),
      "EVENT_INACTIVE",
    );

    const eventIdToDelete = await insertEvent(t);
    await t.run((ctx) => ctx.db.delete(eventIdToDelete));
    await expectAdminErrorCode(
      t.run((ctx) =>
        awardEventPoints(ctx, {
          actorAdminId: adminId,
          participantId,
          eventId: eventIdToDelete,
          now: NOW,
        }),
      ),
      "EVENT_NOT_FOUND",
    );

    const zeroPointEvent = await insertEvent(t, { pointsAwarded: 0 });
    await expectAdminErrorCode(
      t.run((ctx) =>
        awardEventPoints(ctx, { actorAdminId: adminId, participantId, eventId: zeroPointEvent, now: NOW }),
      ),
      "INVALID_EVENT",
    );
    const fractionalEvent = await insertEvent(t, { pointsAwarded: 1.5 });
    await expectAdminErrorCode(
      t.run((ctx) =>
        awardEventPoints(ctx, { actorAdminId: adminId, participantId, eventId: fractionalEvent, now: NOW }),
      ),
      "INVALID_EVENT",
    );

    expect(await t.run(async (ctx) => (await ctx.db.get(participantId))?.points)).toBe(4);
    expect(await logsFor(t, participantId)).toHaveLength(0);
  });

  it("rejects a participant who is missing or not accepted", async () => {
    const t = createConvexTest();
    const adminId = await insertAdmin(t);
    const eventId = await insertEvent(t);
    const pendingId = await insertParticipant(t, adminId, "under_review");
    const unreviewedId = await insertParticipant(t, adminId, "none");
    const removedId = await insertParticipant(t, adminId, "accepted");
    await t.run((ctx) => ctx.db.delete(removedId));

    await expectAdminErrorCode(
      t.run((ctx) => requireEligibleParticipant(ctx, removedId)),
      "PARTICIPANT_NOT_FOUND",
    );
    await expectAdminErrorCode(
      t.run((ctx) => awardEventPoints(ctx, { actorAdminId: adminId, participantId: pendingId, eventId, now: NOW })),
      "PARTICIPANT_NOT_ELIGIBLE",
    );
    await expectAdminErrorCode(
      t.run((ctx) =>
        awardEventPoints(ctx, { actorAdminId: adminId, participantId: unreviewedId, eventId, now: NOW }),
      ),
      "PARTICIPANT_NOT_ELIGIBLE",
    );
  });

  it("rejects an award that would leave the safe integer range", async () => {
    const t = createConvexTest();
    const adminId = await insertAdmin(t);
    const participantId = await insertParticipant(t, adminId, "accepted", Number.MAX_SAFE_INTEGER);
    const eventId = await insertEvent(t, { pointsAwarded: 1 });

    await expectAdminErrorCode(
      t.run((ctx) => awardEventPoints(ctx, { actorAdminId: adminId, participantId, eventId, now: NOW })),
      "INVALID_POINTS",
    );
    expect(await t.run(async (ctx) => (await ctx.db.get(participantId))?.points)).toBe(Number.MAX_SAFE_INTEGER);
    expect(await logsFor(t, participantId)).toHaveLength(0);
  });
});

describe("admin point adjustments", () => {
  it("rejects a negative balance, a bad delta, and a non-admin actor", async () => {
    const t = createConvexTest();
    const adminId = await insertAdmin(t);
    const reviewerId = await insertAdmin(t, "reviewer");
    const inactiveId = await insertAdmin(t, "admin", false);
    const removedAdminId = await insertAdmin(t);
    await t.run((ctx) => ctx.db.delete(removedAdminId));
    const participantId = await insertParticipant(t, adminId, "accepted", 10);
    const removedParticipantId = await insertParticipant(t, adminId, "accepted", 10);
    await t.run((ctx) => ctx.db.delete(removedParticipantId));

    await expectAdminErrorCode(
      t.run((ctx) =>
        adjustPoints(ctx, { actorAdminId: adminId, participantId, delta: -11, reason: "too much" }),
      ),
      "INVALID_POINTS",
    );
    await expectAdminErrorCode(
      t.run((ctx) => adjustPoints(ctx, { actorAdminId: adminId, participantId, delta: 0, reason: "noop" })),
      "INVALID_POINTS",
    );
    await expectAdminErrorCode(
      t.run((ctx) => adjustPoints(ctx, { actorAdminId: adminId, participantId, delta: -1, reason: "   " })),
      "INVALID_ADJUSTMENT_REASON",
    );
    await expectAdminErrorCode(
      t.run((ctx) =>
        adjustPoints(ctx, { actorAdminId: reviewerId, participantId, delta: -1, reason: "reviewer" }),
      ),
      "ADMIN_ONLY",
    );
    await expectAdminErrorCode(
      t.run((ctx) =>
        adjustPoints(ctx, { actorAdminId: inactiveId, participantId, delta: -1, reason: "inactive" }),
      ),
      "ADMIN_ONLY",
    );
    await expectAdminErrorCode(
      t.run((ctx) =>
        adjustPoints(ctx, { actorAdminId: removedAdminId, participantId, delta: -1, reason: "missing" }),
      ),
      "ADMIN_ONLY",
    );
    await expectAdminErrorCode(
      t.run((ctx) =>
        adjustPoints(ctx, {
          actorAdminId: adminId,
          participantId: removedParticipantId,
          delta: -1,
          reason: "missing participant",
        }),
      ),
      "PARTICIPANT_NOT_FOUND",
    );

    expect(await t.run(async (ctx) => (await ctx.db.get(participantId))?.points)).toBe(10);
    expect(await logsFor(t, participantId)).toHaveLength(0);

    const cleared = await t.run((ctx) =>
      adjustPoints(ctx, { actorAdminId: adminId, participantId, delta: -10, reason: "reset" }),
    );
    expect(cleared.newPoints).toBe(0);
  });
});

describe("ledger totals", () => {
  it("ignores scan logs and rejects a corrupt award or adjustment", async () => {
    const t = createConvexTest();
    const adminId = await insertAdmin(t);
    const participantId = await insertParticipant(t, adminId, "accepted");
    const eventId = await insertEvent(t, { pointsAwarded: 8 });

    await t.run((ctx) =>
      awardEventPoints(ctx, { actorAdminId: adminId, participantId, eventId, now: NOW }),
    );
    await t.run((ctx) =>
      ctx.db.insert("volunteerActionLogs", {
        actorAdminId: adminId,
        participantId,
        action: "check_in",
        createdAt: NOW,
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert("volunteerActionLogs", {
        actorAdminId: adminId,
        participantId,
        action: "admin_adjust",
        reason: "blank delta",
        createdAt: NOW,
      }),
    );

    const total = await t.run((ctx) => computeLedgerPoints(ctx, participantId));
    expect(total).toBe(8);

    const corruptId = await insertParticipant(t, adminId, "accepted");
    await t.run((ctx) =>
      ctx.db.insert("participantEventAwards", {
        participantId: corruptId,
        eventId,
        pointsAwarded: 1.5,
        awardedBy: adminId,
        awardedAt: NOW,
      }),
    );
    await expectAdminErrorCode(
      t.run((ctx) => computeLedgerPoints(ctx, corruptId)),
      "INVALID_POINTS",
    );

    const negativeId = await insertParticipant(t, adminId, "accepted");
    await t.run(async (ctx) => {
      await ctx.db.insert("participantEventAwards", {
        participantId: negativeId,
        eventId,
        pointsAwarded: 5,
        awardedBy: adminId,
        awardedAt: NOW,
      });
      await ctx.db.insert("volunteerActionLogs", {
        actorAdminId: adminId,
        participantId: negativeId,
        action: "admin_adjust",
        pointsDelta: -10,
        createdAt: NOW,
      });
    });
    await expectAdminErrorCode(
      t.run((ctx) => computeLedgerPoints(ctx, negativeId)),
      "INVALID_POINTS",
    );

    const fractionalAdjustId = await insertParticipant(t, adminId, "accepted");
    await t.run((ctx) =>
      ctx.db.insert("volunteerActionLogs", {
        actorAdminId: adminId,
        participantId: fractionalAdjustId,
        action: "admin_adjust",
        pointsDelta: 1.5,
        createdAt: NOW,
      }),
    );
    await expectAdminErrorCode(
      t.run((ctx) => computeLedgerPoints(ctx, fractionalAdjustId)),
      "INVALID_POINTS",
    );
  });
});

describe("event awards lookup", () => {
  it("reports awards only after the first one is recorded", async () => {
    const t = createConvexTest();
    const adminId = await insertAdmin(t);
    const participantId = await insertParticipant(t, adminId, "accepted", 0);
    const eventId = await insertEvent(t, { pointsAwarded: 10 });
    const hasAwards = () => t.run((ctx) => eventHasAwards(ctx, eventId));

    expect(await hasAwards()).toBe(false);
    await t.run((ctx) =>
      awardEventPoints(ctx, { actorAdminId: adminId, participantId, eventId, now: NOW }),
    );
    expect(await hasAwards()).toBe(true);
  });
});
