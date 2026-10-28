import { makeFunctionReference } from "convex/server";
import type { GenericId } from "convex/values";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listMyScanOptionsRef, resolveQrForScanRef } from "../../src/convex/adminApi";
import { hashBadgeToken } from "../../convex/admin/participantQr";
import {
  QR_SCAN_ATTEMPT_LIMIT,
  QR_SCAN_ATTEMPT_WINDOW_MS,
  QR_SCAN_FAILURE_LIMIT,
  QR_SCAN_FAILURE_WINDOW_MS,
  QR_SCAN_PRUNE_PER_WRITE,
} from "../../convex/admin/volunteerScanRateLimit";
import { expectAdminErrorCode } from "../helpers/adminErrors";
import { createConvexTest, type ConvexTestInstance } from "../helpers/convexTestContext";
import { seedApplicant, seedStaff } from "../helpers/reviewTestKit";
import { seedMealPeriod } from "../helpers/mealTestKit";

/** The seeded participant's badge; they are checked in with it. */
const QR_TOKEN = "BADGE-0042";
const REGISTRATION_TOKEN = "ab".repeat(32);
const UNKNOWN_TOKEN = "cd".repeat(32);

afterEach(() => {
  vi.useRealTimers();
});

async function seedVolunteer(
  t: ConvexTestInstance,
  capabilities: { canCheckIn?: boolean; canFoodCheckIn?: boolean; canRedeemShop?: boolean } = {},
) {
  const staff = await seedStaff(t, { role: "volunteer" });
  await t.run((ctx) => ctx.db.patch(staff.adminId, capabilities));
  return staff;
}

async function seedParticipant(
  t: ConvexTestInstance,
  options: { status?: string; qrCodeToken?: string; fields?: Record<string, unknown> } = {},
) {
  const { applicationId, userId } = await seedApplicant(t, {
    review: { status: options.status ?? "accepted" },
  });
  const admin = await seedStaff(t, { role: "admin" });
  const participantId = await t.run((ctx) =>
    ctx.db.insert("participants", {
      applicationId,
      authUserId: userId,
      acceptedAt: 1,
      acceptedBy: admin.adminId,
      qrCodeToken: options.qrCodeToken ?? QR_TOKEN,
      registrationQrCodeToken: REGISTRATION_TOKEN,
      badgeQrCodeToken: options.qrCodeToken ?? QR_TOKEN,
      badgeAssignedAt: 2,
      checkedInAt: 2,
      points: 25,
      foodRestriction: "Vegetarian; peanut allergy",
      createdAt: 1,
      updatedAt: 1,
      ...options.fields,
    }),
  );
  return { participantId, applicationId, adminId: admin.adminId };
}

async function seedEvent(
  t: ConvexTestInstance,
  fields: { name?: string; active?: boolean; startsAt?: number; endsAt?: number } = {},
) {
  return t.run((ctx) =>
    ctx.db.insert("events", {
      name: fields.name ?? "Workshop",
      pointsAwarded: 10,
      startsAt: fields.startsAt ?? 1,
      endsAt: fields.endsAt ?? 2,
      active: fields.active ?? true,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
}

function assign(
  t: ConvexTestInstance,
  volunteerAdminId: GenericId<"admins">,
  eventId: GenericId<"events">,
  grantedBy: GenericId<"admins">,
) {
  return t.run((ctx) =>
    ctx.db.insert("volunteerEventAccess", { volunteerAdminId, eventId, grantedBy, createdAt: 1 }),
  );
}

function scanRows(t: ConvexTestInstance) {
  return t.run((ctx) => ctx.db.query("rateLimits").collect());
}

describe("listMyScanOptions", () => {
  it("returns only the caller's capabilities and assigned active events", async () => {
    const t = createConvexTest();
    const volunteer = await seedVolunteer(t, { canCheckIn: true });
    const other = await seedVolunteer(t, { canFoodCheckIn: true });
    const { adminId } = await seedParticipant(t);
    const late = await seedEvent(t, { name: "Late", startsAt: 50, endsAt: 60 });
    const early = await seedEvent(t, { name: "Early", startsAt: 10, endsAt: 20 });
    const inactive = await seedEvent(t, { name: "Closed", active: false });
    const otherEvent = await seedEvent(t, { name: "Other" });
    for (const eventId of [late, early, inactive]) await assign(t, volunteer.adminId, eventId, adminId);
    await assign(t, other.adminId, otherEvent, adminId);

    const options = await t.query(listMyScanOptionsRef, { sessionToken: volunteer.sessionToken });
    expect(options).toEqual({
      canCheckIn: true,
      canFoodCheckIn: false,
      canRedeemShop: false,
      events: [
        { eventId: early, name: "Early", pointsAwarded: 10, startsAt: 10, endsAt: 20 },
        { eventId: late, name: "Late", pointsAwarded: 10, startsAt: 50, endsAt: 60 },
      ],
    });
    expect(JSON.stringify(options)).not.toMatch(/email|points"|participant|Other/);
  });

  it("returns all capabilities and all active events for admins and rejects missing sessions", async () => {
    const t = createConvexTest();
    const admin = await seedStaff(t, { role: "admin" });
    const early = await seedEvent(t, { name: "Early", startsAt: 10, endsAt: 20 });
    const late = await seedEvent(t, { name: "Late", startsAt: 50, endsAt: 60 });
    await seedEvent(t, { name: "Closed", active: false });

    const adminOptions = await t.query(listMyScanOptionsRef, { sessionToken: admin.sessionToken });
    expect(adminOptions).toEqual({
      canCheckIn: true,
      canFoodCheckIn: true,
      canRedeemShop: true,
      events: [
        { eventId: early, name: "Early", pointsAwarded: 10, startsAt: 10, endsAt: 20 },
        { eventId: late, name: "Late", pointsAwarded: 10, startsAt: 50, endsAt: 60 },
      ],
    });
    await expectAdminErrorCode(t.query(listMyScanOptionsRef, { sessionToken: "missing" }), "NOT_AUTHENTICATED");
  });

  it("returns every active event for a volunteer with canScanAllEvents, including ones added later", async () => {
    const t = createConvexTest();
    const volunteer = await seedVolunteer(t);
    const early = await seedEvent(t, { name: "Early", startsAt: 10, endsAt: 20 });
    await t.run((ctx) => ctx.db.patch(volunteer.adminId, { canScanAllEvents: true }));
    const late = await seedEvent(t, { name: "Late", startsAt: 50, endsAt: 60 });
    await seedEvent(t, { name: "Closed", active: false });

    expect(await t.query(listMyScanOptionsRef, { sessionToken: volunteer.sessionToken })).toEqual({
      canCheckIn: false,
      canFoodCheckIn: false,
      canRedeemShop: false,
      events: [
        { eventId: early, name: "Early", pointsAwarded: 10, startsAt: 10, endsAt: 20 },
        { eventId: late, name: "Late", pointsAwarded: 10, startsAt: 50, endsAt: 60 },
      ],
    });
  });
});

describe("resolveQrForScan", () => {
  it("previews a shop scan by badge without dietary info or any QR value", async () => {
    const t = createConvexTest();
    const volunteer = await seedVolunteer(t, { canRedeemShop: true });
    const { participantId } = await seedParticipant(t);
    const result = await t.mutation(resolveQrForScanRef, {
      sessionToken: volunteer.sessionToken, qrCodeToken: ` ${QR_TOKEN}\n`, purpose: "shop",
    });
    expect(result).toEqual({
      status: "ok",
      purpose: "shop",
      participant: { participantId, name: "Taylor Student", points: 25 },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/Vegetarian|@/);
    expect(serialized).not.toContain(QR_TOKEN);
    expect(serialized).not.toContain(REGISTRATION_TOKEN);
  });

  it("rejects registration, replaced, and retired codes with distinct statuses", async () => {
    const t = createConvexTest();
    const volunteer = await seedVolunteer(t, { canRedeemShop: true });
    const { participantId, adminId } = await seedParticipant(t);
    await seedParticipant(t, {
      qrCodeToken: "ef".repeat(32),
      fields: { registrationQrCodeToken: undefined, badgeQrCodeToken: undefined, badgeAssignedAt: undefined, checkedInAt: undefined },
    });
    await seedParticipant(t, {
      qrCodeToken: "12".repeat(32),
      fields: { registrationQrCodeToken: undefined, badgeQrCodeToken: undefined, badgeAssignedAt: undefined },
    });
    await t.run(async (ctx) => ctx.db.insert("retiredBadgeTokens", {
      tokenHash: await hashBadgeToken("BADGE-LOST"), participantId, retiredBy: adminId, retiredAt: 1,
    }));
    const scan = (qrCodeToken: string) =>
      t.mutation(resolveQrForScanRef, { sessionToken: volunteer.sessionToken, qrCodeToken, purpose: "shop" });

    expect(await scan(REGISTRATION_TOKEN)).toEqual({ status: "registration_qr_replaced" });
    expect(await scan("BADGE-LOST")).toEqual({ status: "badge_retired" });
    expect(await scan("EF".repeat(32))).toEqual({ status: "participant_not_checked_in" });
    expect(await scan("12".repeat(32))).toEqual({ status: "badge_not_assigned" });
    const failures = (await scanRows(t)).filter((row) => row.bucket.startsWith("volunteer_qr_scan_failure"));
    expect(failures).toHaveLength(2);
  });

  it("includes dietary info only for food check-in", async () => {
    const t = createConvexTest();
    const volunteer = await seedVolunteer(t, { canFoodCheckIn: true });
    const { adminId } = await seedParticipant(t);
    const mealPeriodId = await seedMealPeriod(t, adminId);
    expect(await t.mutation(resolveQrForScanRef, {
      sessionToken: volunteer.sessionToken, qrCodeToken: QR_TOKEN, purpose: "food_check_in", mealPeriodId,
    })).toEqual({
      status: "ok",
      purpose: "food_check_in",
      meal: { mealPeriodId, name: "Lunch" },
      participant: {
        name: "Taylor Student",
        alreadyRedeemed: false,
        redeemedAt: null,
        dietaryInfo: "Vegetarian; peanut allergy",
      },
    });
  });

  it("previews a point scan with the event value and already-awarded flag", async () => {
    const t = createConvexTest();
    const volunteer = await seedVolunteer(t);
    const { participantId, adminId } = await seedParticipant(t);
    const eventId = await seedEvent(t, { name: "Open workshop" });
    await assign(t, volunteer.adminId, eventId, adminId);
    const args = { sessionToken: volunteer.sessionToken, qrCodeToken: QR_TOKEN, purpose: "point_scan" as const, eventId };

    const first = await t.mutation(resolveQrForScanRef, args);
    expect(first).toEqual({
      status: "ok",
      purpose: "point_scan",
      participant: { name: "Taylor Student" },
      event: { eventId, name: "Open workshop", pointsAwarded: 10 },
      alreadyAwarded: false,
    });
    expect(JSON.stringify(first)).not.toMatch(/Vegetarian|"points"/);

    await t.run((ctx) => ctx.db.insert("participantEventAwards", {
      participantId, eventId, pointsAwarded: 10, awardedBy: volunteer.adminId, awardedAt: 3,
    }));
    expect(await t.mutation(resolveQrForScanRef, args)).toMatchObject({ status: "ok", alreadyAwarded: true });
  });

  it("rejects a volunteer from previewing a point scan of their own badge", async () => {
    const t = createConvexTest();
    const volunteer = await seedVolunteer(t);
    const { participantId, adminId } = await seedParticipant(t);
    const eventId = await seedEvent(t);
    await assign(t, volunteer.adminId, eventId, adminId);
    await t.run((ctx) => ctx.db.patch(volunteer.adminId, { participantId }));
    expect(await t.mutation(resolveQrForScanRef, {
      sessionToken: volunteer.sessionToken, qrCodeToken: QR_TOKEN, purpose: "point_scan", eventId,
    })).toEqual({ status: "self_scan_denied" });
  });

  it("previews a point scan for an assigned event outside its reference schedule", async () => {
    const t = createConvexTest();
    const volunteer = await seedVolunteer(t);
    const { adminId } = await seedParticipant(t);
    const ended = await seedEvent(t, { startsAt: 1, endsAt: 2 });
    const upcoming = await seedEvent(t, { startsAt: Number.MAX_SAFE_INTEGER - 1 });
    for (const eventId of [ended, upcoming]) {
      await assign(t, volunteer.adminId, eventId, adminId);
      expect(await t.mutation(resolveQrForScanRef, {
        sessionToken: volunteer.sessionToken, qrCodeToken: QR_TOKEN, purpose: "point_scan", eventId,
      })).toMatchObject({ status: "ok", purpose: "point_scan" });
    }
  });

  it("is a preview only: participant, award, and log rows are unchanged", async () => {
    const t = createConvexTest();
    const volunteer = await seedVolunteer(t, { canRedeemShop: true, canFoodCheckIn: true });
    const { adminId } = await seedParticipant(t);
    const mealPeriodId = await seedMealPeriod(t, adminId);
    const eventId = await seedEvent(t);
    await assign(t, volunteer.adminId, eventId, adminId);
    const snapshot = () => t.run(async (ctx) => ({
      participants: await ctx.db.query("participants").collect(),
      awards: await ctx.db.query("participantEventAwards").collect(),
      logs: await ctx.db.query("volunteerActionLogs").collect(),
    }));
    const before = await snapshot();
    for (const purpose of ["shop", "food_check_in", "point_scan"] as const) {
      expect(await t.mutation(resolveQrForScanRef, { sessionToken: volunteer.sessionToken, qrCodeToken: QR_TOKEN, purpose, eventId, mealPeriodId })).toMatchObject({ status: "ok" });
    }
    expect(await snapshot()).toEqual(before);
  });

  it("returns the same generic result for malformed and unknown values and never stores them", async () => {
    const t = createConvexTest();
    const volunteer = await seedVolunteer(t, { canRedeemShop: true });
    await seedParticipant(t);
    const results = [];
    for (const qrCodeToken of [UNKNOWN_TOKEN, "not-a-token", QR_TOKEN.toLowerCase(), "a".repeat(5000)]) {
      results.push(await t.mutation(resolveQrForScanRef, {
        sessionToken: volunteer.sessionToken, qrCodeToken, purpose: "shop",
      }));
    }
    expect(results).toEqual(Array(4).fill({ status: "qr_not_found" }));
    expect(JSON.stringify(await scanRows(t))).not.toMatch(/cdcd|not-a-token|badge-0042|aaaa/i);
  });

  it("reveals nothing about ineligible participants", async () => {
    const t = createConvexTest();
    const volunteer = await seedVolunteer(t, { canFoodCheckIn: true });
    const { adminId } = await seedParticipant(t, { status: "rejected" });
    const mealPeriodId = await seedMealPeriod(t, adminId);
    expect(await t.mutation(resolveQrForScanRef, {
      sessionToken: volunteer.sessionToken, qrCodeToken: QR_TOKEN, purpose: "food_check_in", mealPeriodId,
    })).toEqual({ status: "participant_ineligible" });
  });

  it("denies missing capabilities and event access before looking up the token", async () => {
    const t = createConvexTest();
    const volunteer = await seedVolunteer(t);
    const { adminId } = await seedParticipant(t);
    const unassigned = await seedEvent(t);
    const inactive = await seedEvent(t, { active: false });
    await assign(t, volunteer.adminId, inactive, adminId);
    const sessionToken = volunteer.sessionToken;
    const denied = [
      { purpose: "shop" as const },
      { purpose: "food_check_in" as const },
      { purpose: "point_scan" as const },
      { purpose: "point_scan" as const, eventId: unassigned },
      { purpose: "point_scan" as const, eventId: inactive },
    ];
    for (const args of denied) {
      expect(await t.mutation(resolveQrForScanRef, { sessionToken, qrCodeToken: QR_TOKEN, ...args }))
        .toEqual({ status: "not_authorized" });
    }
  });

  it("applies capability and assignment changes on the next request", async () => {
    const t = createConvexTest();
    const volunteer = await seedVolunteer(t, { canRedeemShop: true });
    const { adminId } = await seedParticipant(t);
    const eventId = await seedEvent(t);
    const assignmentId = await assign(t, volunteer.adminId, eventId, adminId);
    const scan = (purpose: "shop" | "point_scan") => t.mutation(resolveQrForScanRef, {
      sessionToken: volunteer.sessionToken, qrCodeToken: QR_TOKEN, purpose, eventId,
    });
    expect(await scan("shop")).toMatchObject({ status: "ok" });
    expect(await scan("point_scan")).toMatchObject({ status: "ok" });

    await t.run(async (ctx) => {
      await ctx.db.patch(volunteer.adminId, { canRedeemShop: false });
      await ctx.db.delete(assignmentId);
    });
    expect(await scan("shop")).toEqual({ status: "not_authorized" });
    expect(await scan("point_scan")).toEqual({ status: "not_authorized" });

    await t.run((ctx) => ctx.db.patch(volunteer.adminId, { active: false }));
    await expectAdminErrorCode(scan("shop"), "NOT_AUTHENTICATED");
  });

  it("allows admins across all purposes without capability or event grants", async () => {
    const t = createConvexTest();
    const admin = await seedStaff(t, { role: "admin" });
    await seedParticipant(t);
    const mealPeriodId = await seedMealPeriod(t, admin.adminId);
    const unassignedEventId = await seedEvent(t, { name: "Unassigned Event" });
    for (const purpose of ["shop", "food_check_in", "point_scan"] as const) {
      expect(await t.mutation(resolveQrForScanRef, {
        sessionToken: admin.sessionToken,
        qrCodeToken: QR_TOKEN,
        purpose,
        eventId: unassignedEventId,
        mealPeriodId,
      })).toMatchObject({ status: "ok", purpose });
    }
  });

  it("throttles repeated invalid tokens, persists counters, and recovers after the window", async () => {
    const t = createConvexTest();
    const volunteer = await seedVolunteer(t, { canRedeemShop: true });
    const other = await seedVolunteer(t, { canRedeemShop: true });
    await seedParticipant(t);
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    const scan = (sessionToken: string, qrCodeToken: string) =>
      t.mutation(resolveQrForScanRef, { sessionToken, qrCodeToken, purpose: "shop" });

    for (let i = 0; i < QR_SCAN_FAILURE_LIMIT; i++) {
      expect(await scan(volunteer.sessionToken, UNKNOWN_TOKEN)).toEqual({ status: "qr_not_found" });
    }
    const rowsAtLimit = (await scanRows(t)).length;
    expect(await scan(volunteer.sessionToken, QR_TOKEN)).toEqual({ status: "rate_limited" });
    expect((await scanRows(t)).length).toBe(rowsAtLimit);
    expect(await scan(other.sessionToken, QR_TOKEN)).toMatchObject({ status: "ok" });

    vi.setSystemTime(now + QR_SCAN_FAILURE_WINDOW_MS + 1);
    expect(await scan(volunteer.sessionToken, QR_TOKEN)).toMatchObject({ status: "ok" });
  });

  it("counts denials toward the failure limit", async () => {
    const t = createConvexTest();
    const volunteer = await seedVolunteer(t);
    await seedParticipant(t);
    for (let i = 0; i < QR_SCAN_FAILURE_LIMIT; i++) {
      await t.mutation(resolveQrForScanRef, { sessionToken: volunteer.sessionToken, qrCodeToken: QR_TOKEN, purpose: "shop" });
    }
    expect(await t.mutation(resolveQrForScanRef, {
      sessionToken: volunteer.sessionToken, qrCodeToken: QR_TOKEN, purpose: "shop",
    })).toEqual({ status: "rate_limited" });
  });

  it("caps successful lookups per window and prunes expired rows", async () => {
    const t = createConvexTest();
    const volunteer = await seedVolunteer(t, { canRedeemShop: true });
    await seedParticipant(t);
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    const scan = () => t.mutation(resolveQrForScanRef, {
      sessionToken: volunteer.sessionToken, qrCodeToken: QR_TOKEN, purpose: "shop",
    });
    for (let i = 0; i < QR_SCAN_ATTEMPT_LIMIT; i++) {
      expect(await scan()).toMatchObject({ status: "ok" });
    }
    expect(await scan()).toEqual({ status: "rate_limited" });

    vi.setSystemTime(now + QR_SCAN_ATTEMPT_WINDOW_MS + 1);
    expect(await scan()).toMatchObject({ status: "ok" });
    expect((await scanRows(t)).length).toBe(QR_SCAN_ATTEMPT_LIMIT + 1 - QR_SCAN_PRUNE_PER_WRITE);
  });

  it("prunes only expired volunteer scan rows in the internal cleanup", async () => {
    const t = createConvexTest();
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("rateLimits", { bucket: "volunteer_qr_scan_attempt:a", key: "a", createdAt: now - QR_SCAN_ATTEMPT_WINDOW_MS - 1 });
      await ctx.db.insert("rateLimits", { bucket: "volunteer_qr_scan_attempt:a", key: "a", createdAt: now });
      await ctx.db.insert("rateLimits", { bucket: "volunteer_qr_scan_failure:a", key: "a", createdAt: now - QR_SCAN_FAILURE_WINDOW_MS - 1 });
      await ctx.db.insert("rateLimits", { bucket: "volunteer_qr_scan_failure:a", key: "a", createdAt: now - QR_SCAN_ATTEMPT_WINDOW_MS - 1 });
      await ctx.db.insert("rateLimits", { bucket: "otp_send", key: "user", createdAt: 1 });
    });
    const prune = makeFunctionReference<"mutation">("admin/volunteerScanRateLimit:pruneVolunteerScanRateLimits");
    expect(await t.mutation(prune, {})).toMatchObject({ deleted: 2, isDone: true });
    const remaining = (await scanRows(t)).map((row) => row.bucket).sort();
    expect(remaining).toEqual(["otp_send", "volunteer_qr_scan_attempt:a", "volunteer_qr_scan_failure:a"]);
  });
});
