import type { GenericId } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  awardEventPointsRef,
  checkInParticipantRef,
  foodCheckInParticipantRef,
} from "../../src/convex/adminApi";
import { QR_SCAN_FAILURE_LIMIT } from "../../convex/admin/volunteerScanRateLimit";
import { expectAdminErrorCode } from "../helpers/adminErrors";
import { createConvexTest, type ConvexTestInstance } from "../helpers/convexTestContext";
import { seedApplicant, seedStaff } from "../helpers/reviewTestKit";

const QR_TOKEN = "ab".repeat(32);
const UNKNOWN_TOKEN = "cd".repeat(32);
const DIETARY = "Vegetarian; peanut allergy";
const NOW = Date.UTC(2026, 10, 14, 15);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

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
  options: { status?: string; fields?: Record<string, unknown> } = {},
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
      qrCodeToken: QR_TOKEN,
      points: 25,
      foodRestriction: DIETARY,
      createdAt: 1,
      updatedAt: 1,
      ...options.fields,
    }),
  );
  return { participantId, adminId: admin.adminId };
}

async function seedEvent(
  t: ConvexTestInstance,
  fields: { active?: boolean; startsAt?: number; endsAt?: number } = {},
) {
  return t.run((ctx) =>
    ctx.db.insert("events", {
      name: "Workshop",
      pointsAwarded: 10,
      startsAt: fields.startsAt ?? NOW - 60_000,
      endsAt: fields.endsAt ?? NOW + 60_000,
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

/** Volunteer assigned to an active event, with a checked-in participant. */
async function seedAwardScene(t: ConvexTestInstance, participantFields: Record<string, unknown> = {}) {
  const volunteer = await seedVolunteer(t);
  const { participantId, adminId } = await seedParticipant(t, {
    fields: { checkedInAt: NOW - 1000, ...participantFields },
  });
  const eventId = await seedEvent(t);
  const assignmentId = await assign(t, volunteer.adminId, eventId, adminId);
  const scan = () => t.mutation(awardEventPointsRef, {
    sessionToken: volunteer.sessionToken, qrCodeToken: QR_TOKEN, eventId,
  });
  return { volunteer, participantId, adminId, eventId, assignmentId, scan };
}

function snapshot(t: ConvexTestInstance) {
  return t.run(async (ctx) => ({
    participants: await ctx.db.query("participants").collect(),
    awards: await ctx.db.query("participantEventAwards").collect(),
    logs: await ctx.db.query("volunteerActionLogs").collect(),
  }));
}

function logs(t: ConvexTestInstance) {
  return t.run((ctx) => ctx.db.query("volunteerActionLogs").collect());
}

function getParticipant(t: ConvexTestInstance, participantId: GenericId<"participants">) {
  return t.run((ctx) => ctx.db.get(participantId));
}

function expectNoSensitiveData(value: unknown) {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain(QR_TOKEN);
  expect(serialized).not.toContain(DIETARY);
  expect(serialized).not.toMatch(/qrCodeToken|foodRestriction|sessionToken/);
}

describe("checkInParticipant", () => {
  it("checks in once with the server time and writes one audit log", async () => {
    const t = createConvexTest();
    const volunteer = await seedVolunteer(t, { canCheckIn: true });
    const { participantId } = await seedParticipant(t);
    const args = { sessionToken: volunteer.sessionToken, qrCodeToken: QR_TOKEN };

    expect(await t.mutation(checkInParticipantRef, args)).toEqual({ status: "success", checkedInAt: NOW });
    expect(await getParticipant(t, participantId)).toMatchObject({ checkedInAt: NOW, updatedAt: NOW });
    const rows = await logs(t);
    expect(rows).toEqual([expect.objectContaining({
      actorAdminId: volunteer.adminId, participantId, action: "check_in", createdAt: NOW,
    })]);
    expectNoSensitiveData(rows);

    vi.setSystemTime(NOW + 5000);
    const before = await snapshot(t);
    expect(await t.mutation(checkInParticipantRef, args))
      .toEqual({ status: "already_checked_in", checkedInAt: NOW });
    expect(await snapshot(t)).toEqual(before);
  });

  it("requires an explicit canCheckIn grant", async () => {
    const t = createConvexTest();
    const volunteer = await seedVolunteer(t, { canFoodCheckIn: true });
    await seedParticipant(t);
    const before = await snapshot(t);
    expect(await t.mutation(checkInParticipantRef, {
      sessionToken: volunteer.sessionToken, qrCodeToken: QR_TOKEN,
    })).toEqual({ status: "not_authorized" });
    expect(await snapshot(t)).toEqual(before);
  });

  it("rejects ineligible participants and unknown or malformed tokens", async () => {
    const t = createConvexTest();
    const volunteer = await seedVolunteer(t, { canCheckIn: true });
    await seedParticipant(t, { status: "waitlisted" });
    const scan = (qrCodeToken: string) =>
      t.mutation(checkInParticipantRef, { sessionToken: volunteer.sessionToken, qrCodeToken });

    expect(await scan(QR_TOKEN)).toEqual({ status: "participant_not_eligible" });
    expect(await scan(UNKNOWN_TOKEN)).toEqual({ status: "qr_not_found" });
    expect(await scan("not-a-token")).toEqual({ status: "qr_not_found" });
    expect(await logs(t)).toEqual([]);
  });
});

describe("foodCheckInParticipant", () => {
  it("redeems once without requiring door check-in", async () => {
    const t = createConvexTest();
    const volunteer = await seedVolunteer(t, { canFoodCheckIn: true });
    const { participantId } = await seedParticipant(t);
    const args = { sessionToken: volunteer.sessionToken, qrCodeToken: QR_TOKEN };

    const result = await t.mutation(foodCheckInParticipantRef, args);
    expect(result).toEqual({ status: "success", foodCheckedInAt: NOW });
    expectNoSensitiveData(result);
    const participant = await getParticipant(t, participantId);
    expect(participant).toMatchObject({ foodCheckedInAt: NOW, updatedAt: NOW });
    expect(participant?.checkedInAt).toBeUndefined();
    const rows = await logs(t);
    expect(rows).toEqual([expect.objectContaining({
      actorAdminId: volunteer.adminId, participantId, action: "food_check_in", createdAt: NOW,
    })]);
    expectNoSensitiveData(rows);

    vi.setSystemTime(NOW + 5000);
    const before = await snapshot(t);
    expect(await t.mutation(foodCheckInParticipantRef, args))
      .toEqual({ status: "already_food_checked_in", foodCheckedInAt: NOW });
    expect(await snapshot(t)).toEqual(before);
  });

  it("requires an explicit canFoodCheckIn grant", async () => {
    const t = createConvexTest();
    const volunteer = await seedVolunteer(t, { canCheckIn: true });
    await seedParticipant(t);
    expect(await t.mutation(foodCheckInParticipantRef, {
      sessionToken: volunteer.sessionToken, qrCodeToken: QR_TOKEN,
    })).toEqual({ status: "not_authorized" });
    expect(await logs(t)).toEqual([]);
  });

  it("rejects ineligible participants", async () => {
    const t = createConvexTest();
    const volunteer = await seedVolunteer(t, { canFoodCheckIn: true });
    await seedParticipant(t, { status: "rejected" });
    expect(await t.mutation(foodCheckInParticipantRef, {
      sessionToken: volunteer.sessionToken, qrCodeToken: QR_TOKEN,
    })).toEqual({ status: "participant_not_eligible" });
  });
});

describe("awardEventPoints", () => {
  it("awards the stored event points once with an accurate audit log", async () => {
    const t = createConvexTest();
    const { volunteer, participantId, eventId, scan } = await seedAwardScene(t);

    const result = await scan();
    expect(result).toEqual({ status: "success", pointsAwarded: 10 });
    expect(await getParticipant(t, participantId)).toMatchObject({ points: 35, updatedAt: NOW });
    const state = await snapshot(t);
    expect(state.awards).toEqual([expect.objectContaining({
      participantId, eventId, pointsAwarded: 10, awardedBy: volunteer.adminId, awardedAt: NOW,
    })]);
    expect(state.logs).toEqual([expect.objectContaining({
      actorAdminId: volunteer.adminId,
      participantId,
      action: "point_scan",
      eventId,
      pointsDelta: 10,
      previousPoints: 25,
      newPoints: 35,
      createdAt: NOW,
    })]);
    expectNoSensitiveData(state.logs);

    expect(await scan()).toEqual({ status: "already_awarded" });
    expect(await snapshot(t)).toEqual(state);
  });

  it("requires door check-in first", async () => {
    const t = createConvexTest();
    const { scan } = await seedAwardScene(t, { checkedInAt: undefined });
    const before = await snapshot(t);
    expect(await scan()).toEqual({ status: "participant_not_checked_in" });
    expect(await snapshot(t)).toEqual(before);
  });

  it("rejects ineligible participants and unknown tokens", async () => {
    const t = createConvexTest();
    const volunteer = await seedVolunteer(t);
    const { adminId } = await seedParticipant(t, { status: "rejected", fields: { checkedInAt: 1 } });
    const eventId = await seedEvent(t);
    await assign(t, volunteer.adminId, eventId, adminId);
    const scan = (qrCodeToken: string) =>
      t.mutation(awardEventPointsRef, { sessionToken: volunteer.sessionToken, qrCodeToken, eventId });
    expect(await scan(QR_TOKEN)).toEqual({ status: "participant_not_eligible" });
    expect(await scan(UNKNOWN_TOKEN)).toEqual({ status: "qr_not_found" });
    expect(await t.run((ctx) => ctx.db.query("participantEventAwards").collect())).toEqual([]);
  });

  it("denies unassigned and missing events, and rejects inactive ones", async () => {
    const t = createConvexTest();
    const volunteer = await seedVolunteer(t);
    const { adminId } = await seedParticipant(t, { fields: { checkedInAt: 1 } });
    const unassigned = await seedEvent(t);
    const inactive = await seedEvent(t, { active: false });
    const deleted = await seedEvent(t);
    await assign(t, volunteer.adminId, inactive, adminId);
    await assign(t, volunteer.adminId, deleted, adminId);
    await t.run((ctx) => ctx.db.delete(deleted));
    const scan = (eventId: GenericId<"events">) =>
      t.mutation(awardEventPointsRef, { sessionToken: volunteer.sessionToken, qrCodeToken: QR_TOKEN, eventId });

    const before = await snapshot(t);
    expect(await scan(unassigned)).toEqual({ status: "event_denied" });
    expect(await scan(deleted)).toEqual({ status: "event_denied" });
    expect(await scan(inactive)).toEqual({ status: "event_inactive" });
    expect(await snapshot(t)).toEqual(before);
  });

  it("does not gate awards on the event schedule", async () => {
    const t = createConvexTest();
    const volunteer = await seedVolunteer(t);
    const { adminId } = await seedParticipant(t, { fields: { checkedInAt: 1 } });
    const eventId = await seedEvent(t, { startsAt: 1, endsAt: 2 });
    await assign(t, volunteer.adminId, eventId, adminId);
    expect(await t.mutation(awardEventPointsRef, {
      sessionToken: volunteer.sessionToken, qrCodeToken: QR_TOKEN, eventId,
    })).toEqual({ status: "success", pointsAwarded: 10 });
  });

  it("applies event changes and revoked assignments on the next scan", async () => {
    const t = createConvexTest();
    const { assignmentId, eventId, scan } = await seedAwardScene(t);
    await t.run((ctx) => ctx.db.patch(eventId, { active: false }));
    expect(await scan()).toEqual({ status: "event_inactive" });
    await t.run(async (ctx) => {
      await ctx.db.patch(eventId, { active: true });
      await ctx.db.delete(assignmentId);
    });
    expect(await scan()).toEqual({ status: "event_denied" });
  });

  it("uses the ledger when the cached balance has not been backfilled", async () => {
    const t = createConvexTest();
    const { participantId, adminId, volunteer } = await seedAwardScene(t, { points: undefined });
    const earlierEvent = await seedEvent(t);
    await t.run((ctx) => ctx.db.insert("participantEventAwards", {
      participantId, eventId: earlierEvent, pointsAwarded: 7, awardedBy: adminId, awardedAt: 1,
    }));
    const eventId = await seedEvent(t);
    await assign(t, volunteer.adminId, eventId, adminId);
    await t.mutation(awardEventPointsRef, {
      sessionToken: volunteer.sessionToken, qrCodeToken: QR_TOKEN, eventId,
    });
    expect((await getParticipant(t, participantId))?.points).toBe(17);
  });
});

describe("concurrent scans", () => {
  const SCANS = 5;

  it("produce one award and one points increment", async () => {
    const t = createConvexTest();
    const { participantId, scan } = await seedAwardScene(t);
    const results = await Promise.all(Array.from({ length: SCANS }, scan));
    expect(results.filter((r) => r.status === "success")).toHaveLength(1);
    expect(results.filter((r) => r.status === "already_awarded")).toHaveLength(SCANS - 1);
    const state = await snapshot(t);
    expect(state.awards).toHaveLength(1);
    expect(state.logs).toHaveLength(1);
    expect((await getParticipant(t, participantId))?.points).toBe(35);
  });

  it("produce one check-in and one food redemption", async () => {
    const t = createConvexTest();
    const volunteer = await seedVolunteer(t, { canCheckIn: true, canFoodCheckIn: true });
    await seedParticipant(t);
    const args = { sessionToken: volunteer.sessionToken, qrCodeToken: QR_TOKEN };
    const checkIns = await Promise.all(
      Array.from({ length: SCANS }, () => t.mutation(checkInParticipantRef, args)),
    );
    const food = await Promise.all(
      Array.from({ length: SCANS }, () => t.mutation(foodCheckInParticipantRef, args)),
    );
    expect(checkIns.filter((r) => r.status === "success")).toHaveLength(1);
    expect(food.filter((r) => r.status === "success")).toHaveLength(1);
    expect((await logs(t)).map((row) => row.action).sort()).toEqual(["check_in", "food_check_in"]);
  });
});

describe("throttling and sessions", () => {
  it("keeps failure counters from returned denials and then rate limits without writing", async () => {
    const t = createConvexTest();
    const volunteer = await seedVolunteer(t);
    await seedParticipant(t);
    const args = { sessionToken: volunteer.sessionToken, qrCodeToken: QR_TOKEN };
    for (let i = 0; i < QR_SCAN_FAILURE_LIMIT; i++) {
      expect(await t.mutation(checkInParticipantRef, args)).toEqual({ status: "not_authorized" });
    }
    await t.run((ctx) => ctx.db.patch(volunteer.adminId, { canCheckIn: true }));
    const before = await t.run((ctx) => ctx.db.query("rateLimits").collect());
    expect(await t.mutation(checkInParticipantRef, args)).toEqual({ status: "rate_limited" });
    expect(await t.run((ctx) => ctx.db.query("rateLimits").collect())).toEqual(before);
    expect(await logs(t)).toEqual([]);
  });

  it("throws for missing and non-volunteer sessions before writing anything", async () => {
    const t = createConvexTest();
    const { eventId } = await seedAwardScene(t);
    const admin = await seedStaff(t, { role: "admin" });
    const calls = (sessionToken: string) => [
      t.mutation(checkInParticipantRef, { sessionToken, qrCodeToken: QR_TOKEN }),
      t.mutation(foodCheckInParticipantRef, { sessionToken, qrCodeToken: QR_TOKEN }),
      t.mutation(awardEventPointsRef, { sessionToken, qrCodeToken: QR_TOKEN, eventId }),
    ];
    for (const call of calls(admin.sessionToken)) await expectAdminErrorCode(call, "VOLUNTEER_ONLY");
    for (const call of calls("missing")) await expectAdminErrorCode(call, "NOT_AUTHENTICATED");
    expect(await t.run((ctx) => ctx.db.query("rateLimits").collect())).toEqual([]);
  });
});
