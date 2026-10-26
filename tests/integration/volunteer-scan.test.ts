import { makeFunctionReference } from "convex/server";
import type { GenericId } from "convex/values";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listMyScanOptionsRef, resolveQrForScanRef } from "../../src/convex/adminApi";
import { isWellFormedQrToken } from "../../convex/admin/volunteerScan";
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

const QR_TOKEN = "ab".repeat(32);
const UNKNOWN_TOKEN = "cd".repeat(32);

afterEach(() => {
  vi.useRealTimers();
});

async function seedVolunteer(
  t: ConvexTestInstance,
  capabilities: { canCheckIn?: boolean; canFoodCheckIn?: boolean } = {},
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

describe("isWellFormedQrToken", () => {
  it.each([
    ["valid lowercase hex", QR_TOKEN, true],
    ["uppercase hex", QR_TOKEN.toUpperCase(), false],
    ["too short", QR_TOKEN.slice(1), false],
    ["too long", `${QR_TOKEN}a`, false],
    ["non-hex", "zz".repeat(32), false],
    ["empty", "", false],
    ["oversized", "a".repeat(10_000), false],
  ])("%s", (_label, token, expected) => {
    expect(isWellFormedQrToken(token)).toBe(expected);
  });
});

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

  it("rejects non-volunteers and missing sessions", async () => {
    const t = createConvexTest();
    const admin = await seedStaff(t, { role: "admin" });
    await expectAdminErrorCode(t.query(listMyScanOptionsRef, { sessionToken: admin.sessionToken }), "VOLUNTEER_ONLY");
    await expectAdminErrorCode(t.query(listMyScanOptionsRef, { sessionToken: "missing" }), "NOT_AUTHENTICATED");
  });
});

describe("resolveQrForScan", () => {
  it("previews check-in without dietary info, points, or the token", async () => {
    const t = createConvexTest();
    const volunteer = await seedVolunteer(t, { canCheckIn: true });
    await seedParticipant(t, { fields: { checkedInAt: 500 } });
    const result = await t.mutation(resolveQrForScanRef, {
      sessionToken: volunteer.sessionToken, qrCodeToken: QR_TOKEN, purpose: "check_in",
    });
    expect(result).toEqual({
      status: "ok",
      purpose: "check_in",
      participant: { name: "Taylor Student", checkedIn: true, checkedInAt: 500 },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/Vegetarian|"points"|@/);
    expect(serialized).not.toContain(QR_TOKEN);
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
    const volunteer = await seedVolunteer(t, { canCheckIn: true, canFoodCheckIn: true });
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
    for (const purpose of ["check_in", "food_check_in", "point_scan"] as const) {
      expect(await t.mutation(resolveQrForScanRef, { sessionToken: volunteer.sessionToken, qrCodeToken: QR_TOKEN, purpose, eventId, mealPeriodId })).toMatchObject({ status: "ok" });
    }
    expect(await snapshot()).toEqual(before);
  });

  it("returns the same generic result for malformed and unknown tokens and never stores them", async () => {
    const t = createConvexTest();
    const volunteer = await seedVolunteer(t, { canCheckIn: true });
    await seedParticipant(t);
    const results = [];
    for (const qrCodeToken of [UNKNOWN_TOKEN, "not-a-token", QR_TOKEN.toUpperCase(), "a".repeat(5000)]) {
      results.push(await t.mutation(resolveQrForScanRef, {
        sessionToken: volunteer.sessionToken, qrCodeToken, purpose: "check_in",
      }));
    }
    expect(results).toEqual(Array(4).fill({ status: "qr_not_found" }));
    expect(JSON.stringify(await scanRows(t))).not.toMatch(/cdcd|not-a-token|aaaa/i);
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
      { purpose: "check_in" as const },
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
    const volunteer = await seedVolunteer(t, { canCheckIn: true });
    const { adminId } = await seedParticipant(t);
    const eventId = await seedEvent(t);
    const assignmentId = await assign(t, volunteer.adminId, eventId, adminId);
    const scan = (purpose: "check_in" | "point_scan") => t.mutation(resolveQrForScanRef, {
      sessionToken: volunteer.sessionToken, qrCodeToken: QR_TOKEN, purpose, eventId,
    });
    expect(await scan("check_in")).toMatchObject({ status: "ok" });
    expect(await scan("point_scan")).toMatchObject({ status: "ok" });

    await t.run(async (ctx) => {
      await ctx.db.patch(volunteer.adminId, { canCheckIn: false });
      await ctx.db.delete(assignmentId);
    });
    expect(await scan("check_in")).toEqual({ status: "not_authorized" });
    expect(await scan("point_scan")).toEqual({ status: "not_authorized" });

    await t.run((ctx) => ctx.db.patch(volunteer.adminId, { active: false }));
    await expectAdminErrorCode(scan("check_in"), "NOT_AUTHENTICATED");
  });

  it("throws for non-volunteer sessions without writing counters", async () => {
    const t = createConvexTest();
    for (const role of ["admin", "reviewer"] as const) {
      const staff = await seedStaff(t, { role });
      await expectAdminErrorCode(t.mutation(resolveQrForScanRef, {
        sessionToken: staff.sessionToken, qrCodeToken: QR_TOKEN, purpose: "check_in",
      }), "VOLUNTEER_ONLY");
    }
    expect(await scanRows(t)).toEqual([]);
  });

  it("throttles repeated invalid tokens, persists counters, and recovers after the window", async () => {
    const t = createConvexTest();
    const volunteer = await seedVolunteer(t, { canCheckIn: true });
    const other = await seedVolunteer(t, { canCheckIn: true });
    await seedParticipant(t);
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    const scan = (sessionToken: string, qrCodeToken: string) =>
      t.mutation(resolveQrForScanRef, { sessionToken, qrCodeToken, purpose: "check_in" });

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
      await t.mutation(resolveQrForScanRef, { sessionToken: volunteer.sessionToken, qrCodeToken: QR_TOKEN, purpose: "check_in" });
    }
    expect(await t.mutation(resolveQrForScanRef, {
      sessionToken: volunteer.sessionToken, qrCodeToken: QR_TOKEN, purpose: "check_in",
    })).toEqual({ status: "rate_limited" });
  });

  it("caps successful lookups per window and prunes expired rows", async () => {
    const t = createConvexTest();
    const volunteer = await seedVolunteer(t, { canCheckIn: true });
    await seedParticipant(t);
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    const scan = () => t.mutation(resolveQrForScanRef, {
      sessionToken: volunteer.sessionToken, qrCodeToken: QR_TOKEN, purpose: "check_in",
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
