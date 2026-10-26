import { afterEach, describe, expect, it, vi } from "vitest";
import type { GenericId } from "convex/values";
import { adminError } from "../../shared/admin/errors";
import {
  awardOutcome,
  checkInOutcome,
  foodOutcome,
  formatScanTime,
  INVALID_QR_OUTCOME,
  normalizeQrToken,
  previewOutcome,
  scanErrorOutcome,
  scanFailureOutcome,
  ScanNetworkError,
  withScanTimeout,
} from "../../src/lib/scanResults";

const token = "ab".repeat(32);
const eventId = "event-1" as GenericId<"events">;
const at = Date.UTC(2026, 9, 25, 15, 30);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("normalizeQrToken", () => {
  it("accepts 64 hex characters, forgiving whitespace and case", () => {
    expect(normalizeQrToken(token)).toBe(token);
    expect(normalizeQrToken(` ${token.toUpperCase().slice(0, 32)}\n${token.slice(32)} `)).toBe(token);
  });

  it.each(["", "abc", "g".repeat(64), `${token}a`, "https://example.com"])("rejects %j", (value) => {
    expect(normalizeQrToken(value)).toBeNull();
  });
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
    for (const status of ["qr_not_found", "participant_not_eligible", "not_authorized", "rate_limited"] as const) {
      expect(previewOutcome({ status })).toBe(scanFailureOutcome(status));
    }
  });

  it("reports duplicates before confirmation", () => {
    expect(previewOutcome({ status: "ok", purpose: "check_in", participant: { name: "Sam", checkedIn: true, checkedInAt: at } }))
      .toEqual({ tone: "duplicate", title: "Already checked in", detail: `Sam already checked in at ${formatScanTime(at)}. Nothing was changed.` });
    expect(previewOutcome({ status: "ok", purpose: "check_in", participant: { name: "Sam", checkedIn: true, checkedInAt: null } })?.detail)
      .toBe("Sam already checked in. Nothing was changed.");
    expect(previewOutcome({
      status: "ok",
      purpose: "food_check_in",
      participant: { name: "Sam", foodCheckedIn: true, foodCheckedInAt: null, dietaryInfo: "Vegan" },
    })).toMatchObject({ tone: "duplicate", title: "Food already redeemed", detail: "Sam already received food. Nothing was changed." });
    expect(previewOutcome({
      status: "ok",
      purpose: "point_scan",
      participant: { name: "Sam" },
      event: { eventId, name: "Workshop", pointsAwarded: 10 },
      alreadyAwarded: true,
    })).toMatchObject({ tone: "duplicate", title: "Points already awarded" });
  });

  it("continues to confirmation for actionable previews", () => {
    expect(previewOutcome({ status: "ok", purpose: "check_in", participant: { name: "Sam", checkedIn: false, checkedInAt: null } })).toBeNull();
    expect(previewOutcome({
      status: "ok",
      purpose: "food_check_in",
      participant: { name: "Sam", foodCheckedIn: false, foodCheckedInAt: null, dietaryInfo: null },
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
  it("describes check-in results", () => {
    expect(checkInOutcome({ status: "success", checkedInAt: at }, "Sam")).toEqual({ tone: "success", title: "Checked in", detail: "Sam is checked in." });
    expect(checkInOutcome({ status: "already_checked_in", checkedInAt: at }, "Sam").tone).toBe("duplicate");
    for (const status of ["qr_not_found", "participant_not_eligible", "not_authorized", "rate_limited"] as const) {
      expect(checkInOutcome({ status }, "Sam")).toBe(scanFailureOutcome(status));
    }
  });

  it("describes food results", () => {
    expect(foodOutcome({ status: "success", foodCheckedInAt: at }, "Sam").title).toBe("Food redeemed");
    expect(foodOutcome({ status: "already_food_checked_in", foodCheckedInAt: at }, "Sam").title).toBe("Food already redeemed");
    expect(foodOutcome({ status: "rate_limited" }, "Sam")).toBe(scanFailureOutcome("rate_limited"));
  });

  it("describes award results with the server's point value", () => {
    expect(awardOutcome({ status: "success", pointsAwarded: 25 }, "Sam", "Workshop")).toEqual({
      tone: "success",
      title: "25 points awarded",
      detail: "Sam received 25 points for Workshop.",
    });
    expect(awardOutcome({ status: "already_awarded" }, "Sam", "Workshop").title).toBe("Points already awarded");
    expect(awardOutcome({ status: "participant_not_checked_in" }, "Sam", "Workshop")).toMatchObject({ tone: "error", title: "Not checked in yet" });
    for (const status of ["event_denied", "event_inactive", "qr_not_found", "participant_not_eligible", "rate_limited"] as const) {
      expect(awardOutcome({ status }, "Sam", "Workshop")).toBe(scanFailureOutcome(status));
    }
  });

  it("has a dedicated invalid QR message", () => {
    expect(INVALID_QR_OUTCOME).toMatchObject({ tone: "error", title: "Not a participant QR code" });
  });
});
