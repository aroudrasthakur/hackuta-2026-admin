import type { GenericId } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assignParticipantBadgeRef,
  checkInWithBadgeRef,
  resolveBadgeForCheckInRef,
  resolveQrForScanRef,
  resolveRegistrationForCheckInRef,
} from "../../src/convex/adminApi";
import { hashBadgeToken } from "../../convex/admin/participantQr";
import { awardEventPoints } from "../../convex/admin/pointsLedger";
import { expectAdminErrorCode } from "../helpers/adminErrors";
import { createConvexTest, type ConvexTestInstance } from "../helpers/convexTestContext";
import { getCheckedIn, insertParticipantWithOptionalCheckIn } from "../helpers/participantTestKit";
import { seedApplicant, seedStaff } from "../helpers/reviewTestKit";
import { seedMealPeriod } from "../helpers/mealTestKit";

const REGISTRATION = "ab".repeat(32);
const OTHER_REGISTRATION = "cd".repeat(32);
const BADGE = "HACKUTA-BADGE-0001";
const OTHER_BADGE = "HACKUTA-BADGE-0002";
const NOW = Date.UTC(2026, 10, 14, 15);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

async function seedParticipant(
  t: ConvexTestInstance,
  acceptedBy: GenericId<"admins">,
  fields: Record<string, unknown> = {},
  status = "accepted",
) {
  const { applicationId, userId } = await seedApplicant(t, { review: { status } });
  const { participantId } = await t.run((ctx) => insertParticipantWithOptionalCheckIn(ctx, {
    applicationId, authUserId: userId, acceptedBy, acceptedAt: 1,
    qrCodeToken: REGISTRATION, createdAt: 1, updatedAt: 1, ...fields,
  }));
  return participantId;
}

async function scene() {
  const t = createConvexTest();
  const admin = await seedStaff(t, { role: "admin", name: "Avery Admin" });
  const volunteer = await seedStaff(t, { role: "volunteer" });
  await t.run((ctx) => ctx.db.patch(volunteer.adminId, { canCheckIn: true, canRedeemShop: true }));
  const participantId = await seedParticipant(t, admin.adminId);
  const registration = (registrationQrCodeToken = REGISTRATION) =>
    t.mutation(resolveRegistrationForCheckInRef, { sessionToken: volunteer.sessionToken, registrationQrCodeToken });
  const badge = (badgeQrCodeToken = BADGE, registrationQrCodeToken = REGISTRATION) =>
    t.mutation(resolveBadgeForCheckInRef, { sessionToken: volunteer.sessionToken, registrationQrCodeToken, badgeQrCodeToken });
  const checkIn = (badgeQrCodeToken = BADGE, registrationQrCodeToken = REGISTRATION) =>
    t.mutation(checkInWithBadgeRef, { sessionToken: volunteer.sessionToken, registrationQrCodeToken, badgeQrCodeToken });
  const shopScan = (qrCodeToken: string) =>
    t.mutation(resolveQrForScanRef, { sessionToken: volunteer.sessionToken, qrCodeToken, purpose: "shop" });
  const participant = (id: GenericId<"participants"> = participantId) => t.run((ctx) => ctx.db.get(id));
  const attendee = (id: GenericId<"participants"> = participantId) => t.run((ctx) => getCheckedIn(ctx, id));
  const snapshot = () => t.run(async (ctx) => ({
    participants: await ctx.db.query("participants").collect(),
    checkedIn: await ctx.db.query("checkedIn").collect(),
    logs: await ctx.db.query("volunteerActionLogs").collect(),
    retired: await ctx.db.query("retiredBadgeTokens").collect(),
  }));
  return { t, admin, volunteer, participantId, registration, badge, checkIn, shopScan, participant, attendee, snapshot };
}

function expectNoQrValues(value: unknown) {
  const serialized = JSON.stringify(value);
  for (const token of [REGISTRATION, BADGE, OTHER_BADGE]) expect(serialized).not.toContain(token);
}

describe("two-step badge check-in", () => {
  it("rejects a volunteer from checking in their own registration", async () => {
    const s = await scene();
    await s.t.run((ctx) => ctx.db.patch(s.volunteer.adminId, { participantId: s.participantId }));
    const before = await s.snapshot();
    expect(await s.registration()).toEqual({ status: "self_scan_denied" });
    expect(await s.checkIn()).toEqual({ status: "self_scan_denied" });
    expect(await s.snapshot()).toEqual(before);
  });

  it("rejects an unlinked volunteer whose email matches the participant", async () => {
    const s = await scene();
    const email = "check-in-self@hackuta.org";
    const { applicationId, userId } = await seedApplicant(s.t, { email, review: { status: "accepted" } });
    await s.t.run((ctx) => ctx.db.patch(s.volunteer.adminId, { email }));
    const { participantId } = await s.t.run((ctx) => insertParticipantWithOptionalCheckIn(ctx, {
      applicationId, authUserId: userId, acceptedBy: s.admin.adminId, acceptedAt: 1,
      qrCodeToken: OTHER_REGISTRATION, createdAt: 1, updatedAt: 1,
    }));
    const before = await s.participant(participantId);
    expect(await s.registration(OTHER_REGISTRATION)).toEqual({ status: "self_scan_denied" });
    expect(await s.checkIn(BADGE, OTHER_REGISTRATION)).toEqual({ status: "self_scan_denied" });
    expect(await s.participant(participantId)).toEqual(before);
  });

  it("identifies, then checks in and assigns the badge in one write", async () => {
    const s = await scene();
    const before = await s.snapshot();
    expect(await s.registration(` ${REGISTRATION.toUpperCase()} `)).toEqual({ status: "ok", participant: { name: "Taylor Student" } });
    expect(await s.badge()).toEqual({ status: "ok", participant: { name: "Taylor Student" } });
    expect(await s.snapshot()).toEqual(before);

    vi.setSystemTime(NOW + 1000);
    expect(await s.checkIn(`${BADGE}\n`)).toEqual({ status: "success", checkedInAt: NOW + 1000 });
    expect(await s.participant()).toMatchObject({
      qrCodeToken: REGISTRATION,
      checkedInAt: NOW + 1000,
      updatedAt: NOW + 1000,
    });
    expect(await s.participant()).not.toHaveProperty("points");
    expect(await s.attendee()).toMatchObject({
      qrCodeToken: BADGE,
      registrationQrCodeToken: REGISTRATION,
      badgeQrCodeToken: BADGE,
      checkedInAt: NOW + 1000,
      badgeAssignedAt: NOW + 1000,
      badgeAssignedBy: s.volunteer.adminId,
      updatedAt: NOW + 1000,
      points: 0,
    });
    const { logs } = await s.snapshot();
    expect(logs).toEqual([expect.objectContaining({
      actorAdminId: s.volunteer.adminId, checkedInId: (await s.attendee())!._id, action: "check_in", createdAt: NOW + 1000,
    })]);
    expectNoQrValues(logs);
  });

  it("inserts checkedIn, keeps the registration token, and awards points only on checkedIn", async () => {
    const s = await scene();
    expect(await s.checkIn()).toEqual({ status: "success", checkedInAt: NOW });
    expect(await s.participant()).toMatchObject({
      qrCodeToken: REGISTRATION,
      checkedInAt: NOW,
    });
    expect(await s.participant()).not.toHaveProperty("points");
    expect(await s.attendee()).toMatchObject({
      qrCodeToken: BADGE,
      badgeQrCodeToken: BADGE,
      registrationQrCodeToken: REGISTRATION,
      points: 0,
    });

    const eventId = await s.t.run((ctx) => ctx.db.insert("events", {
      name: "Workshop", pointsAwarded: 10, startsAt: 1, endsAt: 2, active: true, createdAt: 1, updatedAt: 1,
    }));
    await s.t.run((ctx) => awardEventPoints(ctx, {
      actorAdminId: s.admin.adminId, participantId: s.participantId, eventId, now: NOW + 1,
    }));
    expect(await s.participant()).not.toHaveProperty("points");
    expect((await s.attendee())?.points).toBe(10);
  });

  it("retires the registration QR everywhere and accepts the badge after check-in", async () => {
    const s = await scene();
    await s.checkIn();
    expect(await s.registration()).toEqual({
      status: "registration_qr_used", participant: { name: "Taylor Student", checkedInAt: NOW },
    });
    expect(await s.shopScan(REGISTRATION)).toEqual({ status: "registration_qr_replaced" });
    expect(await s.shopScan(BADGE)).toMatchObject({ status: "ok", participant: { participantId: s.participantId } });
    expect(await s.registration(BADGE)).toEqual({
      status: "already_checked_in", participant: { name: "Taylor Student", checkedInAt: NOW },
    });
  });

  it("returns already checked in for a retried confirmation and writes nothing", async () => {
    const s = await scene();
    await s.checkIn();
    const before = await s.snapshot();
    vi.setSystemTime(NOW + 5000);
    expect(await s.checkIn()).toEqual({
      status: "already_checked_in", participant: { name: "Taylor Student", checkedInAt: NOW },
    });
    expect(await s.checkIn(OTHER_BADGE)).toEqual({
      status: "registration_qr_used", participant: { name: "Taylor Student", checkedInAt: NOW },
    });
    expect(await s.snapshot()).toEqual(before);
  });

  it("rejects unusable badges and leaves the participant unchanged", async () => {
    const s = await scene();
    const otherId = await seedParticipant(s.t, s.admin.adminId, {
      qrCodeToken: OTHER_REGISTRATION, registrationQrCodeToken: OTHER_REGISTRATION, badgeQrCodeToken: OTHER_BADGE, checkedInAt: 1,
    });
    await s.t.run(async (ctx) => {
      const attendee = await getCheckedIn(ctx, otherId);
      await ctx.db.insert("retiredBadgeTokens", {
        tokenHash: await hashBadgeToken("HACKUTA-BADGE-LOST"), checkedInId: attendee!._id, retiredBy: s.admin.adminId, retiredAt: 1,
      });
    });
    const before = await s.snapshot();
    for (const [value, status] of [
      [OTHER_BADGE, "badge_in_use"],
      [REGISTRATION, "badge_is_registration"],
      [REGISTRATION.toUpperCase(), "badge_is_registration"],
      [OTHER_REGISTRATION, "badge_is_registration"],
      ["HACKUTA-BADGE-LOST", "badge_retired"],
      ["   ", "badge_invalid"],
      ["x".repeat(257), "badge_invalid"],
      ["BAD\u0007GE", "badge_invalid"],
    ] as const) {
      expect(await s.badge(value)).toEqual({ status });
      expect(await s.checkIn(value)).toEqual({ status });
    }
    expect((await s.snapshot()).participants).toEqual(before.participants);
    expect((await s.snapshot()).checkedIn).toEqual(before.checkedIn);
    expect((await s.snapshot()).logs).toEqual([]);
  });

  it("never gives one badge to two participants checking in at once", async () => {
    const s = await scene();
    const secondId = await seedParticipant(s.t, s.admin.adminId, { qrCodeToken: OTHER_REGISTRATION });
    const results = await Promise.all([s.checkIn(BADGE, REGISTRATION), s.checkIn(BADGE, OTHER_REGISTRATION)]);
    expect(results.map((result) => result.status).sort()).toEqual(["badge_in_use", "success"]);
    const holders = (await s.snapshot()).checkedIn.filter((row) => row.badgeQrCodeToken === BADGE);
    expect(holders).toHaveLength(1);
    const loser = holders[0]!.participantId === s.participantId ? secondId : s.participantId;
    const untouched = await s.participant(loser);
    expect(untouched?.checkedInAt).toBeUndefined();
    expect(await s.attendee(loser)).toBeNull();
  });

  it("gives one participant only one badge when two desks confirm at once", async () => {
    const s = await scene();
    const results = await Promise.all([s.checkIn(BADGE), s.checkIn(OTHER_BADGE)]);
    expect(results.map((result) => result.status).sort()).toEqual(["registration_qr_used", "success"]);
    expect((await s.snapshot()).logs).toHaveLength(1);
  });

  it("keeps eligibility, legacy check-ins, and capability checks", async () => {
    const s = await scene();
    await seedParticipant(s.t, s.admin.adminId, { qrCodeToken: OTHER_REGISTRATION }, "waitlisted");
    expect(await s.registration(OTHER_REGISTRATION)).toEqual({ status: "participant_not_eligible" });
    await s.t.run((ctx) => ctx.db.patch(s.participantId, { checkedInAt: 5 }));
    expect(await s.checkIn()).toEqual({ status: "already_checked_in", participant: { name: "Taylor Student", checkedInAt: 5 } });
    expect(await s.registration("ef".repeat(32))).toEqual({ status: "qr_not_found" });

    await s.t.run((ctx) => ctx.db.patch(s.volunteer.adminId, { canCheckIn: false }));
    expect(await s.checkIn()).toEqual({ status: "not_authorized" });
    const freshId = await seedParticipant(s.t, s.admin.adminId, { qrCodeToken: "99".repeat(32) });
    expect(await s.t.mutation(checkInWithBadgeRef, {
      sessionToken: s.admin.sessionToken, registrationQrCodeToken: "99".repeat(32), badgeQrCodeToken: OTHER_BADGE,
    })).toEqual({ status: "success", checkedInAt: NOW });
    expect((await s.snapshot()).logs.at(-1)).toMatchObject({
      actorAdminId: s.admin.adminId, checkedInId: (await s.attendee(freshId))!._id, action: "check_in",
    });
  });
});

describe("admin badge replacement", () => {
  async function checkedInScene() {
    const s = await scene();
    await s.checkIn();
    const mealPeriodId = await seedMealPeriod(s.t, s.admin.adminId);
    await s.t.run(async (ctx) => {
      const attendee = await getCheckedIn(ctx, s.participantId);
      await ctx.db.insert("mealRedemptions", { checkedInId: attendee!._id, mealPeriodId, scannedBy: s.volunteer.adminId, redeemedAt: NOW });
      const eventId = await ctx.db.insert("events", {
        name: "Workshop", pointsAwarded: 10, startsAt: 1, endsAt: 2, active: true, createdAt: 1, updatedAt: 1,
      });
      await ctx.db.insert("participantEventAwards", {
        checkedInId: attendee!._id, eventId, pointsAwarded: 10, awardedBy: s.volunteer.adminId, awardedAt: NOW,
      });
    });
    const replace = (sessionToken: string, fields: Partial<{ badgeQrCodeToken: string; reason: string; expectedBadgeAssignedAt: number | null }> = {}) =>
      s.t.mutation(assignParticipantBadgeRef, {
        sessionToken, participantId: s.participantId, badgeQrCodeToken: OTHER_BADGE, reason: "Badge lost", expectedBadgeAssignedAt: NOW, ...fields,
      });
    const history = () => s.t.run(async (ctx) => ({
      meals: await ctx.db.query("mealRedemptions").collect(),
      awards: await ctx.db.query("participantEventAwards").collect(),
    }));
    return { ...s, replace, history };
  }

  it("retires the old badge, activates the new one, and keeps history", async () => {
    const s = await checkedInScene();
    const historyBefore = await s.history();
    vi.setSystemTime(NOW + 60_000);
    expect(await s.replace(s.admin.sessionToken)).toEqual({ ok: true, replaced: true, assignedAt: NOW + 60_000 });

    expect(await s.participant()).toMatchObject({
      qrCodeToken: REGISTRATION, checkedInAt: NOW,
    });
    expect(await s.attendee()).toMatchObject({
      qrCodeToken: OTHER_BADGE, badgeQrCodeToken: OTHER_BADGE, registrationQrCodeToken: REGISTRATION,
      badgeAssignedAt: NOW + 60_000, badgeAssignedBy: s.admin.adminId, checkedInAt: NOW, points: 0,
    });
    expect(await s.history()).toEqual(historyBefore);
    expect(await s.shopScan(BADGE)).toEqual({ status: "badge_retired" });
    expect(await s.shopScan(REGISTRATION)).toEqual({ status: "registration_qr_replaced" });
    expect(await s.shopScan(OTHER_BADGE)).toMatchObject({ status: "ok" });

    const { logs, retired } = await s.snapshot();
    expect(logs.at(-1)).toMatchObject({
      actorAdminId: s.admin.adminId, checkedInId: (await s.attendee())!._id, action: "badge_replaced", reason: "Badge lost", createdAt: NOW + 60_000,
    });
    expect(retired).toEqual([expect.objectContaining({ tokenHash: await hashBadgeToken(BADGE), checkedInId: (await s.attendee())!._id })]);
    expectNoQrValues({ logs, retired });

    await expectAdminErrorCode(s.replace(s.admin.sessionToken, {
      badgeQrCodeToken: BADGE, expectedBadgeAssignedAt: NOW + 60_000,
    }), "BADGE_RETIRED");
  });

  it("rejects stale screens, used badges, missing reasons, and non-admins without changes", async () => {
    const s = await checkedInScene();
    await seedParticipant(s.t, s.admin.adminId, {
      qrCodeToken: OTHER_REGISTRATION, badgeQrCodeToken: "HACKUTA-BADGE-0003", registrationQrCodeToken: OTHER_REGISTRATION, checkedInAt: 1,
    });
    const before = await s.snapshot();
    await expectAdminErrorCode(s.replace(s.admin.sessionToken, { expectedBadgeAssignedAt: NOW - 1 }), "BADGE_ASSIGNMENT_CHANGED");
    await expectAdminErrorCode(s.replace(s.admin.sessionToken, { badgeQrCodeToken: BADGE }), "BADGE_IN_USE");
    await expectAdminErrorCode(s.replace(s.admin.sessionToken, { badgeQrCodeToken: "HACKUTA-BADGE-0003" }), "BADGE_IN_USE");
    await expectAdminErrorCode(s.replace(s.admin.sessionToken, { badgeQrCodeToken: OTHER_REGISTRATION }), "BADGE_IS_REGISTRATION");
    await expectAdminErrorCode(s.replace(s.admin.sessionToken, { badgeQrCodeToken: "" }), "INVALID_BADGE");
    await expectAdminErrorCode(s.replace(s.admin.sessionToken, { reason: "  " }), "INVALID_BADGE_REASON");
    await expectAdminErrorCode(s.replace(s.volunteer.sessionToken), "NOT_AUTHORIZED");
    expect(await s.snapshot()).toEqual(before);
  });

  it("assigns a first badge to a legacy check-in and requires a check-in first", async () => {
    const s = await scene();
    await s.t.run(async (ctx) => {
      const participant = await ctx.db.get(s.participantId);
      await ctx.db.insert("checkedIn", {
        participantId: s.participantId,
        applicationId: participant!.applicationId,
        authUserId: participant!.authUserId,
        acceptedAt: participant!.acceptedAt,
        acceptedBy: participant!.acceptedBy,
        checkedInAt: 5,
        checkedInBy: s.admin.adminId,
        qrCodeToken: REGISTRATION,
        registrationQrCodeToken: REGISTRATION,
        points: 0,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(s.participantId, { checkedInAt: 5 });
    });
    const assign = (fields: Partial<{ expectedBadgeAssignedAt: number | null }> = {}) => s.t.mutation(assignParticipantBadgeRef, {
      sessionToken: s.admin.sessionToken, participantId: s.participantId, badgeQrCodeToken: BADGE,
      reason: "Checked in before badges", expectedBadgeAssignedAt: null, ...fields,
    });
    expect(await s.shopScan(REGISTRATION)).toEqual({ status: "badge_not_assigned" });
    expect(await assign()).toEqual({ ok: true, replaced: false, assignedAt: NOW });
    expect(await s.participant()).toMatchObject({ qrCodeToken: REGISTRATION });
    expect(await s.attendee()).toMatchObject({ qrCodeToken: BADGE, registrationQrCodeToken: REGISTRATION, badgeQrCodeToken: BADGE });
    expect(await s.shopScan(REGISTRATION)).toEqual({ status: "registration_qr_replaced" });
    expect((await s.snapshot()).logs.at(-1)).toMatchObject({ action: "badge_assigned", reason: "Checked in before badges" });
    expect((await s.snapshot()).retired).toEqual([]);

    const fresh = await seedParticipant(s.t, s.admin.adminId, { qrCodeToken: OTHER_REGISTRATION });
    await expectAdminErrorCode(s.t.mutation(assignParticipantBadgeRef, {
      sessionToken: s.admin.sessionToken, participantId: fresh, badgeQrCodeToken: OTHER_BADGE, reason: "Early", expectedBadgeAssignedAt: null,
    }), "PARTICIPANT_NOT_CHECKED_IN");
  });
});
