import { anyApi, type ApiFromModules } from "convex/server";
import type { GenericId } from "convex/values";
import { describe, expect, it } from "vitest";
import type * as participantsAdminModule from "../../convex/admin/participantsAdmin";
import {
  MAX_PARTICIPANT_PAGE_SIZE,
  MAX_PARTICIPANT_SEARCH_LENGTH,
} from "../../convex/admin/participantsAdmin";
import { awardEventPoints, computeLedgerPoints } from "../../convex/admin/pointsLedger";
import { ADJUSTMENT_REASON_MAX_LENGTH } from "../../shared/admin/volunteerRules";
import { expectAdminErrorCode } from "../helpers/adminErrors";
import { createConvexTest, type ConvexTestInstance } from "../helpers/convexTestContext";
import { seedApplicant, seedStaff } from "../helpers/reviewTestKit";
import { ORGANIZER_TEST_PASSWORD, signInOrganizer } from "../helpers/staffTestFixtures";

const { participantsAdmin: api } = (anyApi as ApiFromModules<{
  "admin/participantsAdmin": typeof participantsAdminModule;
}>).admin;

const page = { numItems: 20, cursor: null };
let tokenCounter = 0;

type ParticipantSeed = {
  firstName?: string;
  lastName?: string;
  email?: string;
  status?: string;
  fields?: Record<string, unknown>;
};

async function seedParticipant(t: ConvexTestInstance, acceptedBy: GenericId<"admins">, seed: ParticipantSeed = {}) {
  tokenCounter += 1;
  const { applicationId, userId } = await seedApplicant(t, {
    email: seed.email,
    fields: { firstName: seed.firstName ?? "Taylor", lastName: seed.lastName ?? "Student" },
    review: { status: seed.status ?? "accepted" },
  });
  const participantId = await t.run((ctx) => ctx.db.insert("participants", {
    applicationId, authUserId: userId, acceptedBy, acceptedAt: 1,
    qrCodeToken: tokenCounter.toString(16).padStart(64, "a"),
    points: 0, foodRestriction: "Vegan", createdAt: 1, updatedAt: 1,
    ...seed.fields,
  }));
  return { participantId, applicationId, userId };
}

function seedEvent(t: ConvexTestInstance, name: string, pointsAwarded: number) {
  return t.run((ctx) => ctx.db.insert("events", {
    name, pointsAwarded, active: true, startsAt: 1, endsAt: 2, createdAt: 1, updatedAt: 1,
  }));
}

async function fixture() {
  const t = createConvexTest();
  const admin = await seedStaff(t, { role: "admin", name: "Admin Ada" });
  return { t, admin, sessionToken: admin.sessionToken };
}

function getParticipant(t: ConvexTestInstance, participantId: GenericId<"participants">) {
  return t.run((ctx) => ctx.db.get(participantId));
}

describe("listParticipants", () => {
  it("returns only accepted participants with identity, balance, check-in, and volunteer link", async () => {
    const { t, admin, sessionToken } = await fixture();
    const accepted = await seedParticipant(t, admin.adminId, {
      email: "taylor@example.com", fields: { points: 30, checkedInAt: 100, foodCheckedInAt: 200 },
    });
    await seedParticipant(t, admin.adminId, { firstName: "Rejected", status: "rejected" });
    await seedParticipant(t, admin.adminId, { firstName: "Withdrawn", status: "withdrawn" });
    const volunteerId = await t.mutation(api.promoteParticipantToVolunteer, {
      sessionToken, participantId: accepted.participantId, password: ORGANIZER_TEST_PASSWORD,
    });

    const result = await t.query(api.listParticipants, { sessionToken, paginationOpts: page });
    expect(result.page).toEqual([{
      participantId: accepted.participantId, name: "Taylor Student", email: "taylor@example.com",
      points: 30, checkedInAt: 100, foodCheckedInAt: 200, badgeAssigned: false,
      volunteer: { adminId: volunteerId.adminId, active: true },
    }]);
    expect(result).toMatchObject({ isDone: true, scanned: 3 });
    expect(JSON.stringify(result)).not.toMatch(/qrCodeToken|Vegan/);
  });

  it("searches name and email case-insensitively", async () => {
    const { t, admin, sessionToken } = await fixture();
    await seedParticipant(t, admin.adminId, { firstName: "Jordan", lastName: "Lee", email: "jlee@uta.edu" });
    await seedParticipant(t, admin.adminId, { firstName: "Sam", lastName: "Rivera", email: "sam@example.com" });
    const names = async (search: string) => (await t.query(api.listParticipants, { sessionToken, paginationOpts: page, search }))
      .page.map((row) => row.name);
    expect(await names("  JORDAN ")).toEqual(["Jordan Lee"]);
    expect(await names("lee j")).toEqual([]);
    expect(await names("RIVERA")).toEqual(["Sam Rivera"]);
    expect(await names("uta.edu")).toEqual(["Jordan Lee"]);
    expect(await names("")).toEqual(["Jordan Lee", "Sam Rivera"]);
    await expectAdminErrorCode(t.query(api.listParticipants, {
      sessionToken, paginationOpts: page, search: "x".repeat(MAX_PARTICIPANT_SEARCH_LENGTH + 1),
    }), "INVALID_PARTICIPANT_FILTER");
  });

  it("filters by check-in, food redemption, and volunteer status", async () => {
    const { t, admin, sessionToken } = await fixture();
    const none = await seedParticipant(t, admin.adminId, { firstName: "None" });
    const checked = await seedParticipant(t, admin.adminId, { firstName: "Checked", fields: { checkedInAt: 5 } });
    const fed = await seedParticipant(t, admin.adminId, { firstName: "Fed", fields: { checkedInAt: 5, foodCheckedInAt: 6 } });
    const active = await t.mutation(api.promoteParticipantToVolunteer, {
      sessionToken, participantId: checked.participantId, password: ORGANIZER_TEST_PASSWORD,
    });
    await t.mutation(api.promoteParticipantToVolunteer, {
      sessionToken, participantId: fed.participantId, password: ORGANIZER_TEST_PASSWORD, email: "fed-staff@hackuta.org",
    }).then(({ adminId }) => t.run((ctx) => ctx.db.patch(adminId, { active: false })));
    const names = async (filters: Record<string, unknown>) =>
      (await t.query(api.listParticipants, { sessionToken, paginationOpts: page, ...filters } as never))
        .page.map((row: { name: string }) => row.name);

    expect(await names({ checkedIn: true })).toEqual(["Checked Student", "Fed Student"]);
    expect(await names({ checkedIn: false })).toEqual(["None Student"]);
    expect(await names({ foodRedeemed: true })).toEqual(["Fed Student"]);
    expect(await names({ foodRedeemed: false })).toEqual(["None Student", "Checked Student"]);
    expect(await names({ volunteerStatus: "none" })).toEqual(["None Student"]);
    expect(await names({ volunteerStatus: "linked" })).toEqual(["Checked Student", "Fed Student"]);
    expect(await names({ volunteerStatus: "active" })).toEqual(["Checked Student"]);
    expect(await names({ volunteerStatus: "inactive" })).toEqual(["Fed Student"]);
    expect(await names({ checkedIn: true, volunteerStatus: "active", search: "check" })).toEqual(["Checked Student"]);
    expect(active.adminId).toBeDefined();
    expect(none.participantId).toBeDefined();
  });

  it("pages in stable creation order and never scans more than the page cap", async () => {
    const { t, admin, sessionToken } = await fixture();
    const ids = [];
    for (const name of ["A", "B", "C", "D", "E"]) ids.push((await seedParticipant(t, admin.adminId, { firstName: name })).participantId);
    const seen = [];
    let cursor: string | null = null;
    for (;;) {
      const result = await t.query(api.listParticipants, { sessionToken, paginationOpts: { numItems: 2, cursor } });
      expect(result.scanned).toBeLessThanOrEqual(2);
      seen.push(...result.page.map((row) => row.participantId));
      if (result.isDone) break;
      cursor = result.continueCursor;
    }
    expect(seen).toEqual(ids);
    const capped = await t.query(api.listParticipants, { sessionToken, paginationOpts: { numItems: 10_000, cursor: null } });
    expect(capped.scanned).toBeLessThanOrEqual(MAX_PARTICIPANT_PAGE_SIZE);
  });

  it("returns a short page when filters exclude part of the scanned slice", async () => {
    const { t, admin, sessionToken } = await fixture();
    await seedParticipant(t, admin.adminId, { firstName: "Skip" });
    await seedParticipant(t, admin.adminId, { firstName: "Keep", fields: { checkedInAt: 1 } });
    const first = await t.query(api.listParticipants, { sessionToken, paginationOpts: { numItems: 1, cursor: null }, checkedIn: true });
    expect(first).toMatchObject({ page: [], isDone: false, scanned: 1 });
    const second = await t.query(api.listParticipants, {
      sessionToken, paginationOpts: { numItems: 1, cursor: first.continueCursor }, checkedIn: true,
    });
    expect(second.page.map((row) => row.name)).toEqual(["Keep Student"]);
  });
});

describe("getParticipantDetails", () => {
  it("returns awards, the ledger cross-check, and volunteer details without the QR token", async () => {
    const { t, admin, sessionToken } = await fixture();
    const { participantId } = await seedParticipant(t, admin.adminId, { email: "taylor@example.com" });
    const eventId = await seedEvent(t, "Workshop", 15);
    await t.run((ctx) => awardEventPoints(ctx, { actorAdminId: admin.adminId, participantId, eventId, now: 50 }));
    await t.mutation(api.setParticipantPoints, { sessionToken, participantId, points: 10, reason: "Duplicate scan" });

    const details = await t.query(api.getParticipantDetails, { sessionToken, participantId });
    expect(details).toMatchObject({
      participantId, name: "Taylor Student", email: "taylor@example.com", points: 10, ledgerPoints: 10,
      pointsConsistent: true, checkedInAt: null, foodCheckedInAt: null, volunteer: null,
      awards: [{ eventId, eventName: "Workshop", pointsAwarded: 15, awardedAt: 50, awardedBy: { adminId: admin.adminId, name: "Admin Ada" } }],
    });
    expect(JSON.stringify(details)).not.toMatch(/qrCodeToken/);
    expect(JSON.stringify(details)).not.toMatch(/dietaryInfo|Vegan/);
  });

  it("flags a cached balance that disagrees with the ledger", async () => {
    const { t, admin, sessionToken } = await fixture();
    const { participantId } = await seedParticipant(t, admin.adminId, { fields: { points: 7 } });
    expect(await t.query(api.getParticipantDetails, { sessionToken, participantId }))
      .toMatchObject({ points: 7, ledgerPoints: 0, pointsConsistent: false });
  });

  it("returns null for missing and non-accepted participants", async () => {
    const { t, admin, sessionToken } = await fixture();
    const rejected = await seedParticipant(t, admin.adminId, { status: "rejected" });
    const removed = await seedParticipant(t, admin.adminId);
    await t.run((ctx) => ctx.db.delete(removed.participantId));
    expect(await t.query(api.getParticipantDetails, { sessionToken, participantId: rejected.participantId })).toBeNull();
    expect(await t.query(api.getParticipantDetails, { sessionToken, participantId: removed.participantId })).toBeNull();
  });
});

describe("setParticipantPoints", () => {
  it("computes the delta server-side and writes balance and an immutable log together", async () => {
    const { t, admin, sessionToken } = await fixture();
    const { participantId } = await seedParticipant(t, admin.adminId, { fields: { points: 25 } });
    const result = await t.mutation(api.setParticipantPoints, { sessionToken, participantId, points: 18, reason: "  Duplicate scan  " });
    expect(result).toEqual({ ok: true, changed: true, previousPoints: 25, newPoints: 18, pointsDelta: -7 });
    expect((await getParticipant(t, participantId))?.points).toBe(18);
    expect(await t.run((ctx) => ctx.db.query("volunteerActionLogs").collect())).toMatchObject([{
      actorAdminId: admin.adminId, participantId, action: "admin_adjust",
      previousPoints: 25, newPoints: 18, pointsDelta: -7, reason: "Duplicate scan", createdAt: expect.any(Number),
    }]);
  });

  it("keeps event awards, award uniqueness, and other participants unchanged", async () => {
    const { t, admin, sessionToken } = await fixture();
    const { participantId } = await seedParticipant(t, admin.adminId);
    const other = await seedParticipant(t, admin.adminId, { firstName: "Other", fields: { points: 9 } });
    const eventId = await seedEvent(t, "Workshop", 20);
    await t.run((ctx) => awardEventPoints(ctx, { actorAdminId: admin.adminId, participantId, eventId, now: 1 }));
    const awardsBefore = await t.run((ctx) => ctx.db.query("participantEventAwards").collect());
    const eventBefore = await t.run((ctx) => ctx.db.get(eventId));
    const otherBefore = await getParticipant(t, other.participantId);
    const before = await getParticipant(t, participantId);

    await t.mutation(api.setParticipantPoints, { sessionToken, participantId, points: 0, reason: "Award was a mistake" });
    expect(await t.run((ctx) => ctx.db.query("participantEventAwards").collect())).toEqual(awardsBefore);
    expect(await t.run((ctx) => ctx.db.get(eventId))).toEqual(eventBefore);
    expect(await getParticipant(t, other.participantId)).toEqual(otherBefore);
    const after = await getParticipant(t, participantId);
    expect(after).toMatchObject({
      points: 0, qrCodeToken: before?.qrCodeToken, applicationId: before?.applicationId,
      authUserId: before?.authUserId, foodRestriction: "Vegan",
    });
    await expectAdminErrorCode(
      t.run((ctx) => awardEventPoints(ctx, { actorAdminId: admin.adminId, participantId, eventId, now: 2 })),
      "POINTS_ALREADY_AWARDED",
    );
    expect(await t.run((ctx) => computeLedgerPoints(ctx, participantId))).toBe(0);
  });

  it("keeps the balance equal to event awards plus adjustments", async () => {
    const { t, admin, sessionToken } = await fixture();
    const { participantId } = await seedParticipant(t, admin.adminId);
    const [a, b] = [await seedEvent(t, "A", 10), await seedEvent(t, "B", 25)];
    const ledger = () => t.run((ctx) => computeLedgerPoints(ctx, participantId));
    const balance = async () => (await getParticipant(t, participantId))?.points;
    await t.run((ctx) => awardEventPoints(ctx, { actorAdminId: admin.adminId, participantId, eventId: a, now: 1 }));
    await t.mutation(api.setParticipantPoints, { sessionToken, participantId, points: 40, reason: "Bonus" });
    await t.run((ctx) => awardEventPoints(ctx, { actorAdminId: admin.adminId, participantId, eventId: b, now: 2 }));
    await t.mutation(api.setParticipantPoints, { sessionToken, participantId, points: 5, reason: "Correction" });
    expect(await balance()).toBe(5);
    expect(await ledger()).toBe(5);
  });

  it("serializes concurrent adjustments so each log chains from the last committed balance", async () => {
    const { t, admin, sessionToken } = await fixture();
    const second = await seedStaff(t, { role: "admin", name: "Admin Bo" });
    const { participantId } = await seedParticipant(t, admin.adminId, { fields: { points: 0 } });
    const targets = [10, 3, 27, 3, 0, 14];
    const results = await Promise.all(targets.map((points, index) => t.mutation(api.setParticipantPoints, {
      sessionToken: index % 2 ? second.sessionToken : sessionToken, participantId, points, reason: `Concurrent ${index}`,
    })));
    for (const [index, result] of results.entries()) expect(result.newPoints).toBe(targets[index]);

    const logs = (await t.run((ctx) => ctx.db.query("volunteerActionLogs").collect()))
      .sort((x, y) => x._creationTime - y._creationTime);
    let running = 0;
    for (const log of logs) {
      expect(log.previousPoints).toBe(running);
      expect(log.newPoints).toBe(running + (log.pointsDelta ?? 0));
      running = log.newPoints!;
    }
    const finalPoints = (await getParticipant(t, participantId))?.points;
    expect(finalPoints).toBe(running);
    expect(await t.run((ctx) => computeLedgerPoints(ctx, participantId))).toBe(finalPoints);
    expect(logs.length).toBe(results.filter((result) => result.changed).length);
  });

  it("is a no-op without a log when the target equals the current balance", async () => {
    const { t, admin, sessionToken } = await fixture();
    const { participantId } = await seedParticipant(t, admin.adminId, { fields: { points: 12 } });
    expect(await t.mutation(api.setParticipantPoints, { sessionToken, participantId, points: 12, reason: "Check" }))
      .toEqual({ ok: true, changed: false, previousPoints: 12, newPoints: 12, pointsDelta: 0 });
    expect(await t.run((ctx) => ctx.db.query("volunteerActionLogs").collect())).toEqual([]);
  });

  it("rejects invalid targets, reasons, client-supplied deltas, and ineligible participants without writes", async () => {
    const { t, admin, sessionToken } = await fixture();
    const { participantId } = await seedParticipant(t, admin.adminId, { fields: { points: 5 } });
    const rejected = await seedParticipant(t, admin.adminId, { status: "rejected" });
    const set = (extra: Record<string, unknown>) =>
      t.mutation(api.setParticipantPoints, { sessionToken, participantId, points: 10, reason: "Fix", ...extra } as never);
    const snapshot = () => t.run(async (ctx) => ({
      participants: await ctx.db.query("participants").collect(),
      logs: await ctx.db.query("volunteerActionLogs").collect(),
    }));
    const before = await snapshot();

    for (const points of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      await expectAdminErrorCode(set({ points }), "INVALID_POINTS");
    }
    for (const reason of ["", "   ", "x".repeat(ADJUSTMENT_REASON_MAX_LENGTH + 1)]) {
      await expectAdminErrorCode(set({ reason }), "INVALID_ADJUSTMENT_REASON");
    }
    for (const extra of [{ pointsDelta: 5 }, { previousPoints: 0 }, { actorAdminId: admin.adminId }]) {
      await expect(set(extra)).rejects.toThrow();
    }
    await expectAdminErrorCode(set({ participantId: rejected.participantId }), "PARTICIPANT_NOT_ELIGIBLE");
    await t.run((ctx) => ctx.db.delete(rejected.participantId));
    const afterDelete = await snapshot();
    await expectAdminErrorCode(set({ participantId: rejected.participantId }), "PARTICIPANT_NOT_FOUND");
    expect(await snapshot()).toEqual(afterDelete);
    expect(afterDelete.logs).toEqual(before.logs);
  });
});

describe("listPointAdjustments", () => {
  async function adjustmentFixture() {
    const base = await fixture();
    const { t, admin, sessionToken } = base;
    const second = await seedStaff(t, { role: "admin", name: "Admin Bo" });
    const p1 = await seedParticipant(t, admin.adminId, { firstName: "One" });
    const p2 = await seedParticipant(t, admin.adminId, { firstName: "Two" });
    await t.run((ctx) => ctx.db.insert("volunteerActionLogs", {
      actorAdminId: admin.adminId, participantId: p1.participantId, action: "point_scan",
      pointsDelta: 10, previousPoints: 0, newPoints: 10, createdAt: 50,
    }));
    const rows = [
      { actor: admin.adminId, participantId: p1.participantId, previousPoints: 10, newPoints: 4, createdAt: 100 },
      { actor: second.adminId, participantId: p2.participantId, previousPoints: 0, newPoints: 8, createdAt: 200 },
      { actor: admin.adminId, participantId: p2.participantId, previousPoints: 8, newPoints: 3, createdAt: 300 },
    ];
    await t.run(async (ctx) => {
      for (const row of rows) {
        await ctx.db.insert("volunteerActionLogs", {
          actorAdminId: row.actor, participantId: row.participantId, action: "admin_adjust",
          previousPoints: row.previousPoints, newPoints: row.newPoints, pointsDelta: row.newPoints - row.previousPoints,
          reason: `Reason ${row.createdAt}`, createdAt: row.createdAt,
        });
      }
    });
    return { ...base, second, p1, p2, sessionToken };
  }

  it("lists only admin adjustments, newest first, with every audit field", async () => {
    const { t, admin, sessionToken, p2 } = await adjustmentFixture();
    const result = await t.query(api.listPointAdjustments, { sessionToken, paginationOpts: page });
    expect(result.page.map((row) => row.createdAt)).toEqual([300, 200, 100]);
    expect(result.page[0]).toEqual({
      logId: expect.any(String), createdAt: 300,
      admin: { adminId: admin.adminId, name: "Admin Ada" },
      participant: { participantId: p2.participantId, name: "Two Student" },
      previousPoints: 8, newPoints: 3, pointsDelta: -5, reason: "Reason 300",
    });
  });

  it.each([
    ["participant", (f: Awaited<ReturnType<typeof adjustmentFixture>>) => ({ participantId: f.p2.participantId }), [300, 200]],
    ["admin", (f: Awaited<ReturnType<typeof adjustmentFixture>>) => ({ actorAdminId: f.admin.adminId }), [300, 100]],
    ["participant and admin", (f: Awaited<ReturnType<typeof adjustmentFixture>>) => ({ participantId: f.p2.participantId, actorAdminId: f.second.adminId }), [200]],
    ["date range", () => ({ from: 150, to: 300 }), [300, 200]],
    ["participant point_scan excluded", (f: Awaited<ReturnType<typeof adjustmentFixture>>) => ({ participantId: f.p1.participantId }), [100]],
  ] as const)("filters by %s", async (_label, filters, expected) => {
    const f = await adjustmentFixture();
    const result = await f.t.query(api.listPointAdjustments, { sessionToken: f.sessionToken, paginationOpts: page, ...filters(f) } as never);
    expect(result.page.map((row: { createdAt: number }) => row.createdAt)).toEqual(expected);
  });

  it("paginates with a stable cursor and rejects invalid ranges", async () => {
    const { t, sessionToken } = await adjustmentFixture();
    const first = await t.query(api.listPointAdjustments, { sessionToken, paginationOpts: { numItems: 2, cursor: null } });
    const second = await t.query(api.listPointAdjustments, { sessionToken, paginationOpts: { numItems: 2, cursor: first.continueCursor } });
    expect([...first.page, ...second.page].map((row) => row.createdAt)).toEqual([300, 200, 100]);
    expect(second.isDone).toBe(true);
    await expectAdminErrorCode(t.query(api.listPointAdjustments, { sessionToken, paginationOpts: page, from: 10, to: 1 }), "INVALID_LOG_FILTER");
  });
});

describe("promoteParticipantToVolunteer", () => {
  it("creates a linked volunteer through the shared provisioning helper and rejects duplicates", async () => {
    const { t, admin, sessionToken } = await fixture();
    const { participantId } = await seedParticipant(t, admin.adminId, { email: "taylor@example.com", fields: { points: 12 } });
    const before = await getParticipant(t, participantId);
    const created = await t.mutation(api.promoteParticipantToVolunteer, { sessionToken, participantId, password: ORGANIZER_TEST_PASSWORD });
    expect(await t.run((ctx) => ctx.db.get(created.adminId))).toMatchObject({
      role: "volunteer", participantId, email: "taylor@example.com", canCheckIn: false, canFoodCheckIn: false,
    });
    expect(await getParticipant(t, participantId)).toEqual(before);
    expect((await signInOrganizer(t, "taylor@example.com")).ok).toBe(true);
    await expectAdminErrorCode(t.mutation(api.promoteParticipantToVolunteer, {
      sessionToken, participantId, password: ORGANIZER_TEST_PASSWORD, email: "other@hackuta.org",
    }), "STAFF_ACCOUNT_EXISTS");
    await expectAdminErrorCode(t.mutation(api.promoteParticipantToVolunteer, {
      sessionToken, participantId, password: "weak", email: "third@hackuta.org",
    }), "STAFF_ACCOUNT_EXISTS");
    const rejected = await seedParticipant(t, admin.adminId, { status: "rejected" });
    await expectAdminErrorCode(t.mutation(api.promoteParticipantToVolunteer, {
      sessionToken, participantId: rejected.participantId, password: ORGANIZER_TEST_PASSWORD, email: "r@hackuta.org",
    }), "PARTICIPANT_NOT_ELIGIBLE");
  });
});

describe("participant admin access", () => {
  it.each(["volunteer", "invalid"] as const)("denies every participant admin API to a %s caller without writes", async (condition) => {
    const { t, admin } = await fixture();
    const { participantId } = await seedParticipant(t, admin.adminId, { fields: { points: 5 } });
    const sessionToken = condition === "invalid" ? "" : (await seedStaff(t, { role: "volunteer" })).sessionToken;
    const code = condition === "volunteer" ? "NOT_AUTHORIZED" : "NOT_AUTHENTICATED";
    const snapshot = () => t.run(async (ctx) => ({
      participants: await ctx.db.query("participants").collect(),
      logs: await ctx.db.query("volunteerActionLogs").collect(),
      staff: await ctx.db.query("admins").collect(),
    }));
    const before = await snapshot();
    const calls = [
      () => t.query(api.listParticipants, { sessionToken, paginationOpts: page }),
      () => t.query(api.getParticipantDetails, { sessionToken, participantId }),
      () => t.query(api.listPointAdjustments, { sessionToken, paginationOpts: page }),
      () => t.mutation(api.setParticipantPoints, { sessionToken, participantId, points: 100, reason: "Escalation" }),
      () => t.mutation(api.promoteParticipantToVolunteer, { sessionToken, participantId, password: ORGANIZER_TEST_PASSWORD }),
    ];
    for (const call of calls) await expectAdminErrorCode(call(), code);
    expect(await snapshot()).toEqual(before);
  });
});
