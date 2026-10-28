import { afterEach, describe, expect, it, vi } from "vitest";
import type { GenericId } from "convex/values";
import { adminError } from "../../shared/admin/errors";
import {
  awardOutcome,
  checkedInOutcome,
  checkInStepOutcome,
  foodOutcome,
  formatScanTime,
  INVALID_QR_OUTCOME,
  previewOutcome,
  scanErrorOutcome,
  scanFailureOutcome,
  ScanNetworkError,
  withScanTimeout,
} from "../../src/lib/scanResults";

const eventId = "event-1" as GenericId<"events">;
const meal = { mealPeriodId: "meal-1" as GenericId<"mealPeriods">, name: "Lunch" };
const at = Date.UTC(2026, 9, 25, 15, 30);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("withScanTimeout", () => {
  it("returns the request result", async () => {
    await expect(withScanTimeout(async () => "done")).resolves.toBe("done");
  });

  it("fails fast while offline without calling the server", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const run = vi.fn();
    await expect(withScanTimeout(run)).rejects.toBeInstanceOf(ScanNetworkError);
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects a request that does not answer in time", async () => {
    vi.useFakeTimers();
    const pending = withScanTimeout(() => new Promise(() => undefined), 1_000);
    const assertion = expect(pending).rejects.toThrow("Scan request timed out");
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
  });

  it("passes server errors through", async () => {
    await expect(withScanTimeout(() => Promise.reject(adminError("NOT_AUTHENTICATED")))).rejects.toMatchObject({
      data: { code: "NOT_AUTHENTICATED" },
    });
  });
});

describe("scanErrorOutcome", () => {
  it("explains network, session, and permission failures", () => {
    expect(scanErrorOutcome(new ScanNetworkError(), "ctx")).toBe(scanFailureOutcome("network"));
    expect(scanErrorOutcome(new TypeError("Failed to fetch"), "ctx")).toBe(scanFailureOutcome("network"));
    expect(scanErrorOutcome(adminError("NOT_AUTHENTICATED"), "ctx")).toBe(scanFailureOutcome("session_expired"));
    for (const code of ["VOLUNTEER_ONLY", "NOT_AUTHORIZED", "CAPABILITY_DENIED", "ACCOUNT_INACTIVE"] as const) {
      expect(scanErrorOutcome(adminError(code), "ctx")).toBe(scanFailureOutcome("not_authorized"));
    }
  });

  it("logs unexpected failures and shows a generic message", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(scanErrorOutcome(new Error("boom [Request ID: r1]"), "Lookup failed")).toBe(scanFailureOutcome("unexpected"));
    expect(log).toHaveBeenCalledWith("Lookup failed", expect.objectContaining({ source: "volunteerScan", convexRequestId: "r1" }));
  });
});

describe("previewOutcome", () => {
  it("ends the flow for failed lookups", () => {
    for (const status of ["qr_not_found", "participant_not_eligible", "not_authorized", "rate_limited", "self_scan_denied"] as const) {
      expect(previewOutcome({ status })).toBe(scanFailureOutcome(status));
    }
  });

  it("explains each badge-only rejection distinctly", () => {
    const statuses = ["registration_qr_replaced", "badge_retired", "participant_not_checked_in", "badge_not_assigned"] as const;
    const titles = statuses.map((status) => {
      const outcome = previewOutcome({ status });
      expect(outcome).toBe(scanFailureOutcome(status));
      return outcome?.title;
    });
    expect(new Set(titles).size).toBe(statuses.length);
  });

  it("reports duplicates before confirmation", () => {
    expect(previewOutcome({
      status: "ok",
      purpose: "food_check_in",
      meal,
      participant: { name: "Sam", alreadyRedeemed: true, redeemedAt: null, dietaryInfo: "Vegan" },
    })).toMatchObject({ tone: "duplicate", title: "Food Already Collected", detail: "This participant has already received their food for Lunch." });
    expect(previewOutcome({
      status: "ok",
      purpose: "point_scan",
      participant: { name: "Sam" },
      event: { eventId, name: "Workshop", pointsAwarded: 10 },
      alreadyAwarded: true,
    })).toMatchObject({ tone: "duplicate", title: "Points already awarded" });
  });

  it("continues to confirmation for actionable previews", () => {
    expect(previewOutcome({
      status: "ok",
      purpose: "food_check_in",
      meal,
      participant: { name: "Sam", alreadyRedeemed: false, redeemedAt: null, dietaryInfo: null },
    })).toBeNull();
    expect(previewOutcome({
      status: "ok",
      purpose: "point_scan",
      participant: { name: "Sam" },
      event: { eventId, name: "Workshop", pointsAwarded: 10 },
      alreadyAwarded: false,
    })).toBeNull();
  });
});

describe("operation outcomes", () => {
  it("describes check-in step results", () => {
    expect(checkedInOutcome("Sam")).toMatchObject({ tone: "success", title: "Checked in", detail: expect.stringContaining("Sam is checked in with their badge") });
    expect(checkInStepOutcome({ status: "already_checked_in", participant: { name: "Sam", checkedInAt: at } }))
      .toEqual({ tone: "duplicate", title: "Already checked in", detail: `Sam already checked in at ${formatScanTime(at)}. Nothing was changed.` });
    expect(checkInStepOutcome({ status: "already_checked_in", participant: { name: "Sam", checkedInAt: null } }).detail)
      .toBe("Sam already checked in. Nothing was changed.");
    expect(checkInStepOutcome({ status: "registration_qr_used", participant: { name: "Sam", checkedInAt: at } })).toMatchObject({
      tone: "error", title: "Registration QR already used", detail: expect.stringContaining(`Sam already checked in at ${formatScanTime(at)}`),
    });
    for (const status of [
      "qr_not_found", "participant_not_eligible", "not_authorized", "rate_limited",
      "badge_invalid", "badge_is_registration", "badge_in_use", "badge_retired",
      "self_scan_denied",
    ] as const) {
      expect(checkInStepOutcome({ status })).toBe(scanFailureOutcome(status));
    }
  });

  it("describes food results", () => {
    expect(foodOutcome({ status: "success", redeemedAt: at, meal }, "Sam")).toMatchObject({ title: "Food collected", detail: "Sam's food collection for Lunch is recorded." });
    expect(foodOutcome({ status: "already_redeemed", redeemedAt: at, meal }, "Sam").title).toBe("Food Already Collected");
    expect(foodOutcome({ status: "rate_limited" }, "Sam")).toBe(scanFailureOutcome("rate_limited"));
    for (const status of ["meal_not_active", "meal_not_started", "meal_ended", "participant_ineligible", "qr_not_found", "not_authorized"] as const) {
      expect(foodOutcome({ status }, "Sam")).toBe(scanFailureOutcome(status));
      expect(previewOutcome({ status })).toBe(scanFailureOutcome(status));
    }
  });

  it("describes award results with the server's point value", () => {
    expect(awardOutcome({ status: "success", pointsAwarded: 25 }, "Sam", "Workshop")).toEqual({
      tone: "success",
      title: "25 points awarded",
      detail: "Sam received 25 points for Workshop.",
    });
    expect(awardOutcome({ status: "already_awarded" }, "Sam", "Workshop").title).toBe("Points already awarded");
    expect(awardOutcome({ status: "participant_not_checked_in" }, "Sam", "Workshop")).toMatchObject({ tone: "error", title: "Not checked in yet" });
    for (const status of ["event_denied", "event_inactive", "qr_not_found", "participant_not_eligible", "rate_limited", "self_scan_denied"] as const) {
      expect(awardOutcome({ status }, "Sam", "Workshop")).toBe(scanFailureOutcome(status));
    }
  });

  it("has a dedicated invalid QR message", () => {
    expect(INVALID_QR_OUTCOME).toMatchObject({ tone: "error", title: "Not a badge QR code" });
  });
});
