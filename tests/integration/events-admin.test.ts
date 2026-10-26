import type { GenericId } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  awardEventPointsRef,
  createEventRef,
  setEventActiveRef,
  setEventPointsRef,
  updateEventRef,
} from "../../src/convex/adminApi";
import { expectAdminErrorCode } from "../helpers/adminErrors";
import { createConvexTest, type ConvexTestInstance } from "../helpers/convexTestContext";
import { seedApplicant, seedStaff } from "../helpers/reviewTestKit";

const QR_TOKEN = "ab".repeat(32);
const NOW = Date.UTC(2026, 10, 14, 15);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

async function seedParticipant(t: ConvexTestInstance, fields: Record<string, unknown> = {}) {
  const { applicationId, userId } = await seedApplicant(t, {
    review: { status: "accepted" },
  });
  const admin = await seedStaff(t, { role: "admin" });
  const participantId = await t.run((ctx) =>
    ctx.db.insert("participants", {
      applicationId,
      authUserId: userId,
      acceptedAt: 1,
      acceptedBy: admin.adminId,
      qrCodeToken: QR_TOKEN,
      points: 0,
      createdAt: 1,
      updatedAt: 1,
      ...fields,
    }),
  );
  return { participantId, grantedBy: admin.adminId };
}

async function assign(
  t: ConvexTestInstance,
  volunteerAdminId: GenericId<"admins">,
  eventId: GenericId<"events">,
  grantedBy: GenericId<"admins">,
) {
  await t.run((ctx) =>
    ctx.db.insert("volunteerEventAccess", { volunteerAdminId, eventId, grantedBy, createdAt: 1 }),
  );
}

function staffConfigLogs(t: ConvexTestInstance) {
  return t.run((ctx) => ctx.db.query("staffConfigLogs").collect());
}

function awards(t: ConvexTestInstance) {
  return t.run((ctx) => ctx.db.query("participantEventAwards").collect());
}

function participant(t: ConvexTestInstance, participantId: GenericId<"participants">) {
  return t.run((ctx) => ctx.db.get(participantId));
}

describe("admin event lifecycle", () => {
  it("rejects invalid time ranges and invalid point values", async () => {
    const t = createConvexTest();
    const admin = await seedStaff(t, { role: "admin" });

    await expectAdminErrorCode(
      t.mutation(createEventRef, {
        sessionToken: admin.sessionToken,
        name: "",
        description: null,
        startsAt: NOW,
        endsAt: NOW + 1,
        pointsAwarded: 10,
      }),
      "INVALID_EVENT",
    );

    await expectAdminErrorCode(
      t.mutation(createEventRef, {
        sessionToken: admin.sessionToken,
        name: "Valid Name",
        description: null,
        startsAt: NOW + 1,
        endsAt: NOW,
        pointsAwarded: 10,
      }),
      "INVALID_EVENT",
    );

    await expectAdminErrorCode(
      t.mutation(createEventRef, {
        sessionToken: admin.sessionToken,
        name: "Valid Name",
        description: null,
        startsAt: NOW,
        endsAt: NOW + 1,
        pointsAwarded: 0,
      }),
      "INVALID_EVENT",
    );

    await expectAdminErrorCode(
      t.mutation(createEventRef, {
        sessionToken: admin.sessionToken,
        name: "Valid Name",
        description: null,
        startsAt: NOW,
        endsAt: NOW + 1,
        pointsAwarded: 1.5,
      }),
      "INVALID_EVENT",
    );
  });

  it("locks points after the first award and preserves historical award amounts", async () => {
    const t = createConvexTest();
    const admin = await seedStaff(t, { role: "admin" });
    const volunteer = await seedStaff(t, { role: "volunteer" });
    const { participantId, grantedBy } = await seedParticipant(t, { checkedInAt: NOW - 1 });

    const { eventId } = await t.mutation(createEventRef, {
      sessionToken: admin.sessionToken,
      name: "Event",
      description: null,
      startsAt: NOW - 60_000,
      endsAt: NOW + 60_000,
      pointsAwarded: 10,
    });

    await t.mutation(setEventPointsRef, { sessionToken: admin.sessionToken, eventId, pointsAwarded: 15 });
    await t.mutation(setEventActiveRef, { sessionToken: admin.sessionToken, eventId, active: true });
    await assign(t, volunteer.adminId, eventId, grantedBy);

    expect(await t.mutation(awardEventPointsRef, {
      sessionToken: volunteer.sessionToken,
      qrCodeToken: QR_TOKEN,
      eventId,
    })).toEqual({ status: "success", pointsAwarded: 15 });

    await expectAdminErrorCode(
      t.mutation(setEventPointsRef, { sessionToken: admin.sessionToken, eventId, pointsAwarded: 20 }),
      "EVENT_POINTS_LOCKED",
    );

    expect(await awards(t)).toEqual([
      expect.objectContaining({ participantId, eventId, pointsAwarded: 15 }),
    ]);
  });

  it("does not delete or modify existing awards when event metadata changes, and audits changes", async () => {
    const t = createConvexTest();
    const admin = await seedStaff(t, { role: "admin" });
    const volunteer = await seedStaff(t, { role: "volunteer" });
    const { participantId, grantedBy } = await seedParticipant(t, { checkedInAt: NOW - 1 });

    const { eventId } = await t.mutation(createEventRef, {
      sessionToken: admin.sessionToken,
      name: "Original",
      description: null,
      startsAt: NOW - 60_000,
      endsAt: NOW + 60_000,
      pointsAwarded: 10,
    });

    await t.mutation(setEventActiveRef, { sessionToken: admin.sessionToken, eventId, active: true });
    await assign(t, volunteer.adminId, eventId, grantedBy);

    expect(await t.mutation(awardEventPointsRef, {
      sessionToken: volunteer.sessionToken,
      qrCodeToken: QR_TOKEN,
      eventId,
    })).toEqual({ status: "success", pointsAwarded: 10 });

    const beforeAwards = await awards(t);
    const beforeParticipant = await participant(t, participantId);
    const beforeLogs = await staffConfigLogs(t);

    await t.mutation(updateEventRef, {
      sessionToken: admin.sessionToken,
      eventId,
      name: "Updated",
      description: "New description",
      startsAt: NOW - 120_000,
      endsAt: NOW + 120_000,
    });

    expect(await awards(t)).toEqual(beforeAwards);
    expect(await participant(t, participantId)).toMatchObject({ points: beforeParticipant?.points });

    const afterLogs = await staffConfigLogs(t);
    expect(afterLogs.length).toBeGreaterThan(beforeLogs.length);
    expect(afterLogs.some((row) => row.action === "event_created" && row.targetEventId === eventId)).toBe(true);
    expect(afterLogs.some((row) => row.action === "event_active_changed" && row.targetEventId === eventId)).toBe(true);
    expect(afterLogs.some((row) => row.action === "event_updated" && row.targetEventId === eventId)).toBe(true);
  });
});

