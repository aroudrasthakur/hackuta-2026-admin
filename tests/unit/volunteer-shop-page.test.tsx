// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminError } from "../../shared/admin/errors";
import { AdminAuthContext, type AdminAuthContextValue } from "../../src/contexts/adminAuthContext";
import {
  getShopCustomerRef,
  listShopCatalogForVolunteerRef,
  previewShopPurchaseRef,
  purchaseShopItemRef,
  resolveQrForScanRef,
} from "../../src/convex/adminApi";
import { ScanNetworkError } from "../../src/lib/scanResults";
import { VolunteerShopPage } from "../../src/pages/admin/VolunteerShopPage";

const mocks = vi.hoisted(() => ({
  queries: new Map<unknown, unknown>(),
  resolve: vi.fn(),
  purchase: vi.fn(),
  scan: { value: "", source: "manual" as "manual" | "camera" },
}));

vi.mock("../../src/convex/reactBindings", () => ({
  useQuery: (ref: unknown, args: unknown) => {
    if (args === "skip") return undefined;
    const value = mocks.queries.get(ref);
    return typeof value === "function" ? (value as (input: unknown) => unknown)(args) : value;
  },
  useMutation: (ref: unknown) => {
    if (ref === resolveQrForScanRef) return mocks.resolve;
    if (ref === purchaseShopItemRef) return mocks.purchase;
    throw new Error("Unexpected mutation ref");
  },
}));

vi.mock("../../src/components/volunteer/QrScanner", () => ({
  QrScanner: ({ onScan, autoStart }: { onScan: (value: string, source: "manual" | "camera") => void; autoStart?: boolean }) => (
    <div data-testid="scanner" data-autostart={String(autoStart)}>
      <button type="button" onClick={() => onScan(mocks.scan.value, mocks.scan.source)}>Simulate scan</button>
    </div>
  ),
}));

const token = "HACKUTA-BADGE-0001";
const customer = { participantId: "p1", name: "Riley Ready", points: 1250 };
const catalogItem = (overrides: Record<string, unknown>) => ({
  itemId: "tee", name: "HackUTA 2026 T-shirt", description: "", imageUrl: null, unitPointsCost: 300, basePointsCost: 400,
  flashSaleId: "sale", saleEndsAt: null, ...overrides,
});
const catalog = {
  maxQuantity: 10,
  nextPriceChangeAt: null,
  items: [
    catalogItem({}),
    catalogItem({ itemId: "stickers", name: "Sticker pack", description: "Six stickers", unitPointsCost: 50, basePointsCost: 50, flashSaleId: null }),
    catalogItem({ itemId: "bottle", name: "Insulated bottle", unitPointsCost: 600, basePointsCost: 600, flashSaleId: null }),
  ],
};
const receipt = { redemptionId: "r1", itemId: "tee", itemName: "HackUTA 2026 T-shirt", quantity: 2, unitPointsCost: 300, basePointsCost: 400, totalPointsSpent: 600, pointsBefore: 1250, pointsAfter: 650, flashSaleId: "sale", redeemedAt: 1 };

function preview(args: { itemId: string; quantity: number }) {
  const item = catalog.items.find((entry) => entry.itemId === args.itemId)!;
  const total = item.unitPointsCost * args.quantity;
  return {
    status: "ok", unitPointsCost: item.unitPointsCost, basePointsCost: item.basePointsCost, flashSaleId: item.flashSaleId, saleEndsAt: null,
    quantity: args.quantity, totalPointsCost: total, points: customer.points,
    pointsAfter: customer.points - total, hasEnoughPoints: customer.points >= total,
  };
}

let container: HTMLDivElement;
let root: Root;

function auth(overrides: Partial<AdminAuthContextValue> = {}): AdminAuthContextValue {
  return {
    staff: { adminId: "volunteer", email: "v@example.com", name: "Priya", role: "volunteer", canRedeemShop: true, expiresAt: Date.now() + 60_000 },
    sessionToken: "session", authError: null, isLoading: false, sessionReady: true, isAuthenticated: true,
    signIn: vi.fn(), signOut: vi.fn(), ...overrides,
  };
}

async function render(context = auth()) {
  await act(async () => root.render(
    <AdminAuthContext.Provider value={context}>
      <MemoryRouter><VolunteerShopPage /></MemoryRouter>
    </AdminAuthContext.Provider>,
  ));
}

const text = () => container.textContent ?? "";
function button(name: string) {
  const match = Array.from(container.querySelectorAll("button")).find((element) =>
    element.getAttribute("aria-label") === name || element.textContent?.trim() === name || element.textContent?.includes(name));
  if (!match) throw new Error(`No button ${name}`);
  return match;
}
async function click(name: string) {
  await act(async () => button(name).click());
}
async function scan(value = token, source: "manual" | "camera" = "manual") {
  mocks.scan.value = value;
  mocks.scan.source = source;
  await click("Simulate scan");
}
async function reviewTee(quantity = 2) {
  await scan();
  await click("HackUTA 2026 T-shirt");
  for (let count = 1; count < quantity; count += 1) await click("More");
  await click("Review purchase");
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.queries.clear();
  mocks.queries.set(listShopCatalogForVolunteerRef, catalog);
  mocks.queries.set(getShopCustomerRef, customer);
  mocks.queries.set(previewShopPurchaseRef, preview);
  mocks.resolve.mockReset().mockResolvedValue({ status: "ok", purpose: "shop", participant: customer });
  mocks.purchase.mockReset().mockResolvedValue({ status: "success", receipt });
  vi.spyOn(console, "error").mockImplementation(() => {});
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("VolunteerShopPage", () => {
  it("sells an item once with the server price and shows the receipt", async () => {
    await render();
    expect(text()).toContain("Shop redemption");
    await scan(` ${token}\n`, "camera");
    expect(mocks.resolve).toHaveBeenCalledWith({ sessionToken: "session", qrCodeToken: token, purpose: "shop" });
    expect(container.querySelector("[aria-label=Participant]")?.textContent).toContain("Riley Ready1,250points");
    expect(button("Review purchase").disabled).toBe(true);
    expect(button("Insulated bottle").disabled).toBe(false);
    expect(text()).toContain("Sale");
    expect(text()).toContain("Six stickers");

    await click("Sticker pack");
    await click("More");
    expect(button("More").disabled).toBe(false);
    expect(text()).toContain("Up to 10 per purchase");
    await click("Fewer");
    await click("HackUTA 2026 T-shirt");
    expect(text()).toContain("Up to 10 per purchase");
    await click("More");
    await click("Review purchase");
    expect(document.activeElement?.id).toBe("shop-review-heading");
    expect(text()).toContain("Total600 pts");
    expect(text()).toContain("Balance after650 pts");
    expect(text()).toContain("Sale price");

    await click("Confirm · 600 pts");
    const call = mocks.purchase.mock.calls[0]![0];
    expect(call).toMatchObject({ sessionToken: "session", qrCodeToken: token, itemId: "tee", quantity: 2, expectedUnitPointsCost: 300 });
    expect(call.idempotencyKey).toMatch(/^[A-Za-z0-9_-]{16,100}$/);
    expect(container.querySelector("[role=status]")?.textContent).toContain("Purchase complete");
    expect(text()).toContain("New balance650 pts");
    expect(document.activeElement?.textContent).toBe("Scan next");

    await click("Scan next");
    expect(container.querySelector("[data-testid=scanner]")?.getAttribute("data-autostart")).toBe("true");
  });

  it("reuses the same key after a price change, rate limit, or lost connection", async () => {
    await render();
    await reviewTee();
    mocks.purchase
      .mockResolvedValueOnce({ status: "price_changed", unitPointsCost: 350, totalPointsCost: 700 })
      .mockResolvedValueOnce({ status: "rate_limited" })
      .mockRejectedValueOnce(new ScanNetworkError())
      .mockResolvedValueOnce({ status: "duplicate", receipt });
    await click("Confirm · 600 pts");
    expect(text()).toContain("Price changed");
    expect(text()).toContain("350 points each");
    await click("Confirm · 600 pts");
    expect(text()).toContain("Too many scans");
    await click("Confirm · 600 pts");
    expect(text()).toContain("Connection problem");
    await click("Confirm · 600 pts");
    expect(text()).toContain("Already purchased");
    const keys = new Set(mocks.purchase.mock.calls.map(([args]) => args.idempotencyKey));
    expect(keys.size).toBe(1);
  });

  it("gives a new key after changing the item", async () => {
    await render();
    await reviewTee(1);
    await click("Change item");
    expect(text()).toContain("Choose an item");
    await click("Review purchase");
    await click("Confirm · 300 pts");
    await click("Scan next");
    await reviewTee(1);
    await click("Confirm · 300 pts");
    expect(mocks.purchase.mock.calls[0]![0].idempotencyKey).not.toBe(mocks.purchase.mock.calls[1]![0].idempotencyKey);
  });

  it("blocks a purchase the participant can't afford and lets the volunteer choose again", async () => {
    mocks.queries.set(previewShopPurchaseRef, (args: { itemId: string; quantity: number }) => ({ ...preview(args), points: 100, pointsAfter: -500, hasEnoughPoints: false }));
    await render();
    await reviewTee();
    expect(container.querySelector("[role=alert]")?.textContent).toContain("Riley Ready has 100 points and needs 600");
    expect(text()).toContain("Balance afterNot enough");
    expect(button("Confirm · 600 pts").disabled).toBe(true);

    mocks.queries.set(previewShopPurchaseRef, preview);
    await click("Change item");
    await click("Review purchase");
    mocks.purchase.mockResolvedValueOnce({ status: "insufficient_points", points: 100, totalPointsCost: 600 });
    await click("Confirm · 600 pts");
    expect(container.querySelector("[role=alert]")?.textContent).toContain("Not enough points");
    await click("Choose another item");
    expect(text()).toContain("Choose an item");
    expect(button("Review purchase").disabled).toBe(true);
  });

  it("explains availability and eligibility problems before confirming", async () => {
    mocks.queries.set(previewShopPurchaseRef, { status: "item_unavailable" });
    await render();
    await reviewTee();
    expect(text()).toContain("This purchase can't go ahead");
    mocks.queries.set(previewShopPurchaseRef, undefined);
    await click("Change item");
    await click("Review purchase");
    expect(text()).toContain("Checking the price…");
    expect(button("Confirm purchase").disabled).toBe(true);

    mocks.queries.set(getShopCustomerRef, null);
    await click("Change item");
    expect(text()).toContain("can no longer buy from the shop");
    expect(button("Review purchase").disabled).toBe(true);
  });

  it("shows catalog loading and empty states", async () => {
    mocks.queries.set(listShopCatalogForVolunteerRef, undefined);
    await render();
    await scan();
    expect(text()).toContain("Loading the shop…");
    mocks.queries.set(listShopCatalogForVolunteerRef, { ...catalog, items: [] });
    await render();
    expect(text()).toContain("No items are for sale right now.");
  });

  it("ends the flow for bad codes, failed lookups, and unexpected errors", async () => {
    await render();
    await scan("x".repeat(257));
    expect(text()).toContain("Not a badge QR code");
    expect(mocks.resolve).not.toHaveBeenCalled();
    await click("Scan next");

    mocks.resolve.mockResolvedValueOnce({ status: "registration_qr_replaced" });
    await scan("ab".repeat(32));
    expect(text()).toContain("Registration QR no longer works");
    await click("Scan next");

    mocks.resolve.mockResolvedValueOnce({ status: "self_purchase_denied" });
    await scan();
    expect(text()).toContain("Can't sell to yourself");
    await click("Scan next");

    mocks.resolve.mockResolvedValueOnce({ status: "ok", purpose: "check_in", participant: { name: "Riley", checkedIn: false, checkedInAt: null } });
    await scan();
    expect(text()).toContain("Scan failed");
    await click("Scan next");

    mocks.resolve.mockRejectedValueOnce(adminError("CAPABILITY_DENIED"));
    await scan();
    expect(text()).toContain("Permission required");
    await click("Scan next");

    await reviewTee(1);
    mocks.purchase.mockRejectedValueOnce(new Error("boom"));
    await click("Confirm · 300 pts");
    expect(text()).toContain("Scan failed");
    expect(() => button("Choose another item")).toThrow();
  });

  it("cancels a lookup and ignores its late answer", async () => {
    let answer: (value: unknown) => void = () => {};
    mocks.resolve.mockReturnValueOnce(new Promise((resolve) => { answer = resolve; }));
    await render();
    await scan();
    expect(text()).toContain("Looking up participant…");
    await click("Cancel");
    await act(async () => answer({ status: "ok", purpose: "shop", participant: customer }));
    expect(container.querySelector("[data-testid=scanner]")).not.toBeNull();
    await scan();
    await click("Cancel");
    expect(container.querySelector("[data-testid=scanner]")).not.toBeNull();
  });

  it("requires a session", async () => {
    await render(auth({ sessionToken: null }));
    await scan();
    expect(text()).toContain("Session expired");
  });
});
