import { describe, expect, it } from "vitest";
import { adminErrorCode } from "../../shared/admin/errors";
import {
  ADJUSTMENT_REASON_MAX_LENGTH,
  assertAdjustmentDelta,
  assertPointBalance,
  buildStaffConfigDetails,
  EVENT_DESCRIPTION_MAX_LENGTH,
  EVENT_NAME_MAX_LENGTH,
  EVENT_POINTS_MAX,
  eventStatus,
  normalizeAdjustmentReason,
  normalizeEventInput,
} from "../../shared/admin/volunteerRules";

const MAX_SAFE = Number.MAX_SAFE_INTEGER;

function errorCode(run: () => unknown) {
  try {
    run();
  } catch (error) {
    return adminErrorCode(error);
  }
  return null;
}

describe("point amounts", () => {
  it("accepts a safe non-negative balance and a non-zero adjustment", () => {
    expect(assertPointBalance(0)).toBe(0);
    expect(assertPointBalance(MAX_SAFE)).toBe(MAX_SAFE);
    expect(assertAdjustmentDelta(1)).toBe(1);
    expect(assertAdjustmentDelta(-4)).toBe(-4);
    expect(assertAdjustmentDelta(Number.MIN_SAFE_INTEGER)).toBe(Number.MIN_SAFE_INTEGER);
  });

  it.each([
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    2 ** 53,
  ])("rejects balance %s", (points) => {
    expect(errorCode(() => assertPointBalance(points))).toBe("INVALID_POINTS");
  });

  it.each([0, 1.5, Number.NaN, 2 ** 53])("rejects adjustment %s", (delta) => {
    expect(errorCode(() => assertAdjustmentDelta(delta))).toBe("INVALID_POINTS");
  });

  it("trims an adjustment reason and rejects an empty or long one", () => {
    expect(normalizeAdjustmentReason("  score correction  ")).toBe("score correction");
    expect(normalizeAdjustmentReason("x".repeat(ADJUSTMENT_REASON_MAX_LENGTH))).toHaveLength(
      ADJUSTMENT_REASON_MAX_LENGTH,
    );
    expect(errorCode(() => normalizeAdjustmentReason("   "))).toBe("INVALID_ADJUSTMENT_REASON");
    expect(errorCode(() => normalizeAdjustmentReason("x".repeat(ADJUSTMENT_REASON_MAX_LENGTH + 1)))).toBe(
      "INVALID_ADJUSTMENT_REASON",
    );
    expect(errorCode(() => normalizeAdjustmentReason(4 as unknown as string))).toBe(
      "INVALID_ADJUSTMENT_REASON",
    );
  });
});

describe("event input", () => {
  it("trims the name, drops a blank description, and keeps a positive window", () => {
    expect(
      normalizeEventInput({
        name: "  Workshop  ",
        description: "   ",
        pointsAwarded: 10,
        startsAt: 1_000,
        endsAt: 2_000,
      }),
    ).toEqual({
      name: "Workshop",
      pointsAwarded: 10,
      startsAt: 1_000,
      endsAt: 2_000,
    });

    expect(
      normalizeEventInput({
        name: "Workshop",
        description: "  Bring a laptop  ",
        pointsAwarded: EVENT_POINTS_MAX,
        startsAt: 0,
        endsAt: 1,
      }).description,
    ).toBe("Bring a laptop");
  });

  it("accepts a name and description at their length limits", () => {
    const event = normalizeEventInput({
      name: "n".repeat(EVENT_NAME_MAX_LENGTH),
      description: "d".repeat(EVENT_DESCRIPTION_MAX_LENGTH),
      pointsAwarded: 1,
      startsAt: 1,
      endsAt: 2,
    });
    expect(event.name).toHaveLength(EVENT_NAME_MAX_LENGTH);
    expect(event.description).toHaveLength(EVENT_DESCRIPTION_MAX_LENGTH);
  });

  it.each([
    { name: "n".repeat(EVENT_NAME_MAX_LENGTH + 1), pointsAwarded: 10, startsAt: 1, endsAt: 2 },
    { name: "Workshop", description: "d".repeat(EVENT_DESCRIPTION_MAX_LENGTH + 1), pointsAwarded: 10, startsAt: 1, endsAt: 2 },
    { name: "Workshop", pointsAwarded: EVENT_POINTS_MAX + 1, startsAt: 1, endsAt: 2 },
    { name: "Workshop", pointsAwarded: 10, startsAt: Number.NaN, endsAt: 2 },
    { name: "Workshop", pointsAwarded: 10, startsAt: 1, endsAt: Number.POSITIVE_INFINITY },
    { name: "   ", pointsAwarded: 10, startsAt: 1, endsAt: 2 },
    { name: 4 as unknown as string, pointsAwarded: 10, startsAt: 1, endsAt: 2 },
    { name: "Workshop", description: 4 as unknown as string, pointsAwarded: 10, startsAt: 1, endsAt: 2 },
    { name: "Workshop", pointsAwarded: 0, startsAt: 1, endsAt: 2 },
    { name: "Workshop", pointsAwarded: 1.5, startsAt: 1, endsAt: 2 },
    { name: "Workshop", pointsAwarded: 2 ** 53, startsAt: 1, endsAt: 2 },
    { name: "Workshop", pointsAwarded: 10, startsAt: 5, endsAt: 5 },
    { name: "Workshop", pointsAwarded: 10, startsAt: 6, endsAt: 5 },
    { name: "Workshop", pointsAwarded: 10, startsAt: 1.5, endsAt: 2 },
  ])("rejects %#", (input) => {
    expect(errorCode(() => normalizeEventInput(input))).toBe("INVALID_EVENT");
  });
});

describe("event status", () => {
  const event = { active: true, startsAt: 100, endsAt: 200 };

  it.each([
    [99, "upcoming"],
    [100, "active"],
    [199, "active"],
    [200, "ended"],
  ] as const)("at %s is %s", (now, status) => {
    expect(eventStatus(event, now)).toBe(status);
  });

  it("is inactive whenever the event is switched off", () => {
    for (const now of [99, 150, 200]) {
      expect(eventStatus({ ...event, active: false }, now)).toBe("inactive");
    }
  });
});

describe("staff config details", () => {
  it("serializes allowlisted values in a stable order", () => {
    expect(
      buildStaffConfigDetails({
        eventIds: ["evt1"],
        after: { pointsAwarded: 4 },
        before: { pointsAwarded: 2 },
        changedFields: ["pointsAwarded"],
      }),
    ).toBe(
      JSON.stringify({
        changedFields: ["pointsAwarded"],
        eventIds: ["evt1"],
        before: { pointsAwarded: 2 },
        after: { pointsAwarded: 4 },
      }),
    );
  });

  it("omits keys that were not provided", () => {
    expect(buildStaffConfigDetails({ eventIds: [], changedFields: undefined })).toBe(
      JSON.stringify({ eventIds: [] }),
    );
    expect(buildStaffConfigDetails({})).toBe("{}");
  });

  it.each([
    { qrCodeToken: "abc" },
    { password: "secret" },
    { foodRestriction: "peanuts" },
    { note: "free text" },
    { canCheckIn: true },
    { active: false },
    { pointsAwarded: 4 },
    { before: { pointsAwarded: 1.5 } },
    { before: { startsAt: Number.NaN } },
    { after: { endsAt: "20" } },
    { after: { active: 1 } },
    { eventIds: ["has space"] },
    { eventIds: [""] },
    { eventIds: ["a".repeat(41)] },
    { eventIds: [true] },
    { eventIds: "evt1" },
    { changedFields: ["password"] },
    { changedFields: ["qrCodeToken"] },
    { changedFields: "active" },
    { changedFields: [1] },
    { eventIds: Array.from({ length: 51 }, () => "evt1") },
    { changedFields: Array.from({ length: 51 }, () => "active") },
    { before: null },
    { before: "active" },
    { before: [true] },
    { after: { password: true } },
    { after: { canCheckIn: "yes" } },
    { addedEventIds: ["has space"] },
    { removedEventIds: "evt1" },
  ])("rejects %#", (input) => {
    expect(() => buildStaffConfigDetails(input)).toThrow(/not allowed/);
  });

  it("stores boolean before/after snapshots and added/removed event ids", () => {
    expect(buildStaffConfigDetails({
      before: { canCheckIn: false, active: true },
      after: { canCheckIn: true, canFoodCheckIn: false },
      addedEventIds: ["evt2"],
      removedEventIds: [],
    })).toBe(JSON.stringify({
      addedEventIds: ["evt2"],
      removedEventIds: [],
      before: { canCheckIn: false, active: true },
      after: { canCheckIn: true, canFoodCheckIn: false },
    }));
  });

  it("accepts a 40-character event id", () => {
    const eventId = "a".repeat(40);
    expect(JSON.parse(buildStaffConfigDetails({ eventIds: [eventId] })).eventIds).toEqual([eventId]);
  });
});
