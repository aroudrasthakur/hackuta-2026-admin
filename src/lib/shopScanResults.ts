import type { QrScanPreview, ShopPurchaseResult } from "../convex/adminApi";
import { formatPoints } from "./shopFormat";
import { scanFailureOutcome, type ScanOutcome } from "./scanResults";

export type ShopScanPreview = Extract<QrScanPreview, { status: "ok"; purpose: "shop" }>;
export type ShopCustomerInfo = ShopScanPreview["participant"];
export type ShopReceipt = Extract<ShopPurchaseResult, { status: "success" }>["receipt"];

/**
 * Where the flow goes after a purchase attempt: `result` ends it, `choose`
 * ends it but lets the volunteer pick again for the same participant, and
 * `review` keeps the same attempt (and idempotency key) for another try.
 */
export type PurchaseNext = "result" | "choose" | "review";

export type PurchaseOutcome = { outcome: ScanOutcome; next: PurchaseNext; receipt: ShopReceipt | null };

const NOTHING_CHARGED = "Nothing was charged.";

export function purchaseOutcome(result: ShopPurchaseResult, name: string): PurchaseOutcome {
  const end = (outcome: ScanOutcome, next: PurchaseNext = "result"): PurchaseOutcome => ({ outcome, next, receipt: null });
  switch (result.status) {
    case "success":
      return {
        outcome: { tone: "success", title: "Purchase complete", detail: `Give ${name} ${result.receipt.quantity} × ${result.receipt.itemName}.` },
        next: "result",
        receipt: result.receipt,
      };
    case "duplicate":
      return {
        outcome: { tone: "duplicate", title: "Already purchased", detail: "This purchase already went through. No extra points were taken." },
        next: "result",
        receipt: result.receipt,
      };
    case "price_changed":
      return end({
        tone: "duplicate",
        title: "Price changed",
        detail: `The price is now ${formatPoints(result.unitPointsCost)} points each (${formatPoints(result.totalPointsCost)} total). Nothing was charged. Check the new total and confirm again.`,
      }, "review");
    case "insufficient_points":
      return end({
        tone: "error",
        title: "Not enough points",
        detail: `${name} has ${formatPoints(result.points)} points and needs ${formatPoints(result.totalPointsCost)}. ${NOTHING_CHARGED}`,
      }, "choose");
    case "item_unavailable":
      return end({ tone: "error", title: "Item unavailable", detail: `This item is no longer for sale. ${NOTHING_CHARGED}` }, "choose");
    case "invalid_quantity":
      return end({ tone: "error", title: "Quantity not allowed", detail: `Choose 1 to ${result.maxQuantity}. ${NOTHING_CHARGED}` }, "choose");
    case "invalid_request":
      return end({ tone: "error", title: "Purchase not completed", detail: `Something didn't match this purchase. ${NOTHING_CHARGED} Scan the participant again.` });
    case "rate_limited":
      return end(scanFailureOutcome("rate_limited"), "review");
    default:
      return end(scanFailureOutcome(result.status));
  }
}

/** Client key for one purchase attempt. Reused for retries so a repeat never charges twice. */
export function newIdempotencyKey() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
