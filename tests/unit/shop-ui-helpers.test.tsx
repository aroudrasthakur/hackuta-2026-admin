// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShopPurchaseResult } from "../../src/convex/adminApi";
import { PRICE_BUCKET_MS, usePriceClock, useWatchPriceChange } from "../../src/hooks/usePriceClock";
import {
  formatPoints,
  formatShopTime,
  fromDateTimeInput,
  ITEM_STATUS,
  parseWholeNumber,
  SALE_STATUS,
  STOCK_STATUS,
  toDateTimeInput,
} from "../../src/lib/shopFormat";
import { newIdempotencyKey, purchaseOutcome } from "../../src/lib/shopScanResults";
import { scanFailureOutcome } from "../../src/lib/scanResults";

const receipt = {
  redemptionId: "r1", itemId: "i1", itemName: "Sticker pack", quantity: 2, unitPointsCost: 50, basePointsCost: 50,
  totalPointsSpent: 100, pointsBefore: 500, pointsAfter: 400, flashSaleId: null, redeemedAt: 1,
};

describe("shop formatting", () => {
  it("formats points, times, and status labels", () => {
    expect(formatPoints(12500)).toBe("12,500");
    expect(formatShopTime(Date.UTC(2026, 9, 25, 18, 0))).toMatch(/Oct/);
    expect(STOCK_STATUS.low).toEqual({ label: "Low", tone: "warning" });
    expect(ITEM_STATUS.archived.label).toBe("Archived");
    expect(SALE_STATUS.live.tone).toBe("positive");
  });

  it("round-trips datetime-local values in local time", () => {
    const at = new Date(2026, 9, 25, 9, 5).getTime();
    expect(toDateTimeInput(at)).toBe("2026-10-25T09:05");
    expect(fromDateTimeInput("2026-10-25T09:05")).toBe(at);
    expect(fromDateTimeInput("")).toBeNull();
    expect(fromDateTimeInput("not a date")).toBeNull();
  });

  it("parses whole numbers within a range", () => {
    expect(parseWholeNumber(" 12 ", 0)).toBe(12);
    expect(parseWholeNumber("0", 1)).toBeNull();
    expect(parseWholeNumber("11", 1, 10)).toBeNull();
    expect(parseWholeNumber("1.5", 0)).toBeNull();
    expect(parseWholeNumber("-3", 0)).toBeNull();
    expect(parseWholeNumber("99999999999999999999", 0)).toBeNull();
  });
});

describe("purchase outcomes", () => {
  const outcome = (result: unknown) => purchaseOutcome(result as ShopPurchaseResult, "Riley");

  it("ends with a receipt on success and duplicate", () => {
    expect(outcome({ status: "success", receipt })).toMatchObject({ next: "result", receipt, outcome: { tone: "success", detail: "Give Riley 2 × Sticker pack." } });
    expect(outcome({ status: "duplicate", receipt })).toMatchObject({ next: "result", receipt, outcome: { tone: "duplicate", title: "Already purchased" } });
  });

  it("keeps the attempt for a price change or rate limit", () => {
    expect(outcome({ status: "price_changed", unitPointsCost: 350, totalPointsCost: 700 })).toMatchObject({
      next: "review", outcome: { title: "Price changed", detail: expect.stringContaining("350 points each (700 total)") },
    });
    expect(outcome({ status: "rate_limited" })).toEqual({ next: "review", receipt: null, outcome: scanFailureOutcome("rate_limited") });
  });

  it("lets the volunteer choose again when the item or balance is the problem", () => {
    expect(outcome({ status: "insufficient_points", points: 40, totalPointsCost: 300 })).toMatchObject({ next: "choose", outcome: { title: "Not enough points", detail: expect.stringContaining("Riley has 40 points and needs 300") } });
    expect(outcome({ status: "insufficient_stock", stockQuantity: 0 })).toMatchObject({ next: "choose", outcome: { title: "Sold out" } });
    expect(outcome({ status: "insufficient_stock", stockQuantity: 2 })).toMatchObject({ next: "choose", outcome: { title: "Not enough stock", detail: expect.stringContaining("Only 2 left") } });
    expect(outcome({ status: "item_unavailable" })).toMatchObject({ next: "choose", outcome: { title: "Item unavailable" } });
    expect(outcome({ status: "invalid_quantity", maxQuantity: 10 })).toMatchObject({ next: "choose", outcome: { detail: expect.stringContaining("Choose 1 to 10") } });
  });

  it("ends the flow for request, participant, and QR problems", () => {
    expect(outcome({ status: "invalid_request" })).toMatchObject({ next: "result", outcome: { title: "Purchase not completed" } });
    for (const status of ["participant_not_eligible", "self_purchase_denied", "qr_not_found"] as const) {
      expect(outcome({ status })).toEqual({ next: "result", receipt: null, outcome: scanFailureOutcome(status) });
    }
  });

  it("makes valid idempotency keys with or without randomUUID", () => {
    expect(newIdempotencyKey()).toMatch(/^[A-Za-z0-9_-]{16,100}$/);
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
    try {
      expect(newIdempotencyKey()).toMatch(/^[0-9a-f]{32}$/);
    } finally {
      Object.defineProperty(crypto, "randomUUID", { value: original, configurable: true });
    }
  });
});

describe("usePriceClock", () => {
  let container: HTMLDivElement;
  let root: Root;
  const seen: number[] = [];

  function Probe({ next }: { next: number | null | undefined }) {
    const { nowBucket, watch } = usePriceClock();
    useWatchPriceChange(watch, next);
    seen.push(nowBucket);
    return null;
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 25, 12, 0, 10));
    seen.length = 0;
    container = document.createElement("div");
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    vi.useRealTimers();
  });

  it("buckets time and re-runs at the next price change", async () => {
    const start = Date.now();
    await act(async () => root.render(<Probe next={start + 5_000} />));
    expect(seen.at(-1)).toBe(Math.floor(start / PRICE_BUCKET_MS) * PRICE_BUCKET_MS);
    await act(async () => vi.advanceTimersByTime(5_600));
    expect(seen.at(-1)).toBe(start + 5_000);
  });

  it("ignores missing or far-off changes", async () => {
    await act(async () => root.render(<Probe next={null} />));
    await act(async () => root.render(<Probe next={Date.now() + 2 ** 32} />));
    const before = seen.at(-1);
    await act(async () => vi.advanceTimersByTime(1_000));
    expect(seen.at(-1)).toBe(before);
  });
});
