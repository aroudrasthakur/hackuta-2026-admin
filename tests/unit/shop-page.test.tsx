// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminError } from "../../shared/admin/errors";
import { AdminAuthContext, type AdminAuthContextValue } from "../../src/contexts/adminAuthContext";
import {
  cancelFlashSaleRef,
  createFlashSaleRef,
  createShopItemRef,
  listFlashSalesRef,
  listShopItemsAdminRef,
  listShopRedemptionsRef,
  listShopVolunteersRef,
  refundShopRedemptionRef,
  setShopItemStatusRef,
  setVolunteerShopAccessRef,
  updateFlashSaleRef,
  updateShopItemRef,
} from "../../src/convex/adminApi";
import { ShopPage } from "../../src/pages/admin/ShopPage";

type Paginated = { results: unknown[]; status: string; loadMore: ReturnType<typeof vi.fn> };

const mocks = vi.hoisted(() => ({
  queries: new Map<unknown, unknown>(),
  mutations: new Map<unknown, ReturnType<typeof vi.fn>>(),
  paginated: new Map<unknown, Paginated>(),
  queryArgs: new Map<unknown, unknown>(),
}));

vi.mock("../../src/convex/reactBindings", () => ({
  useQuery: (ref: unknown, args: unknown) => {
    if (args === "skip") return undefined;
    mocks.queryArgs.set(ref, args);
    const value = mocks.queries.get(ref);
    if (typeof value === "function") return (value as () => unknown)();
    return value;
  },
  useMutation: (ref: unknown) => {
    if (!mocks.mutations.has(ref)) mocks.mutations.set(ref, vi.fn(async () => ({ ok: true })));
    return mocks.mutations.get(ref);
  },
  usePaginatedQuery: (ref: unknown, args: unknown) => {
    mocks.queryArgs.set(ref, args);
    return mocks.paginated.get(ref) ?? { results: [], status: "LoadingFirstPage", loadMore: vi.fn() };
  },
}));

const now = Date.now();
const row = (overrides: Record<string, unknown>) => ({
  itemId: "item-x", name: "Item", description: "", pointsCost: 100, effectivePointsCost: 100,
  flashSaleId: null, saleEndsAt: null, status: "active", createdAt: now, updatedAt: now, ...overrides,
});
const tee = row({ itemId: "tee", name: "HackUTA 2026 T-shirt", description: "Soft tee", pointsCost: 400, effectivePointsCost: 300, flashSaleId: "sale-live" });
const stickers = row({ itemId: "stickers", name: "Sticker pack", pointsCost: 50, effectivePointsCost: 50 });
const bottle = row({ itemId: "bottle", name: "Insulated bottle", pointsCost: 600, effectivePointsCost: 600 });
const mug = row({ itemId: "mug", name: "Amphora mug", status: "inactive" });
const tote = row({ itemId: "tote", name: "Canvas tote", status: "archived" });
const items = [tee, stickers, bottle, mug, tote];

const sale = (overrides: Record<string, unknown>) => ({
  flashSaleId: "sale-x", title: "Sale", message: "", startsAt: now - 1000, endsAt: now + 3_600_000, status: "live",
  cancelledAt: null, createdAt: now, items: [{ itemId: "tee", name: "HackUTA 2026 T-shirt", pointsCost: 400, salePointsCost: 300 }], ...overrides,
});
const sales = [
  sale({ flashSaleId: "sale-live", title: "Midnight tee sale" }),
  sale({ flashSaleId: "sale-next", title: "Breakfast bundle", status: "scheduled", startsAt: now + 3_600_000, endsAt: now + 7_200_000, items: [{ itemId: "stickers", name: "Sticker pack", pointsCost: 50, salePointsCost: 30 }] }),
  sale({ flashSaleId: "sale-old", title: "Kickoff sale", status: "ended", items: [{ itemId: "gone", name: "Unknown item", pointsCost: null, salePointsCost: 10 }] }),
  sale({ flashSaleId: "sale-off", title: "Keyboard drop", status: "cancelled" }),
];

const purchase = (overrides: Record<string, unknown>) => ({
  redemptionId: "red-1", participant: { participantId: "p1", name: "Riley Ready" }, item: { itemId: "tee", name: "HackUTA 2026 T-shirt" },
  quantity: 1, unitPointsCost: 300, basePointsCost: 400, totalPointsSpent: 300, pointsBefore: 1000, pointsAfter: 700,
  volunteer: { adminId: "v1", name: "Priya Nair" }, redeemedAt: now, flashSale: { flashSaleId: "sale-live", title: "Midnight tee sale" }, refund: null, ...overrides,
});

let container: HTMLDivElement;
let root: Root;

function auth(overrides: Partial<AdminAuthContextValue> = {}): AdminAuthContextValue {
  return {
    staff: { adminId: "admin", email: "a@example.com", name: "Sam", role: "admin", expiresAt: now + 60_000 },
    sessionToken: "session", authError: null, isLoading: false, sessionReady: true, isAuthenticated: true,
    signIn: vi.fn(), signOut: vi.fn(), ...overrides,
  };
}

function Probe() {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
}

async function render(search = "", context = auth()) {
  await act(async () => root.render(
    <AdminAuthContext.Provider value={context}>
      <MemoryRouter key={`${search}:${context.sessionToken}`} initialEntries={[`/admin/shop${search}`]}>
        <Routes><Route path="/admin/shop" element={<><ShopPage /><Probe /></>} /></Routes>
      </MemoryRouter>
    </AdminAuthContext.Provider>,
  ));
}

const text = () => container.textContent ?? "";
const mutation = (ref: unknown) => {
  if (!mocks.mutations.has(ref)) mocks.mutations.set(ref, vi.fn(async () => ({ ok: true })));
  return mocks.mutations.get(ref)!;
};

function button(name: string) {
  const match = Array.from(container.querySelectorAll("button, a")).find((element) =>
    element.getAttribute("aria-label") === name || element.textContent?.trim() === name ||
    element.querySelector(".shop-tab__label")?.textContent === name);
  if (!match) throw new Error(`No button ${name}`);
  return match as HTMLButtonElement;
}

async function click(name: string) {
  await act(async () => button(name).click());
}

function field(label: string) {
  const match = Array.from(container.querySelectorAll("label")).find((element) => element.textContent?.trim().startsWith(label));
  if (!match) throw new Error(`No field ${label}`);
  const control = match.htmlFor ? container.querySelector(`[id="${match.htmlFor}"]`) : match.querySelector("input, select, textarea");
  return control as HTMLInputElement;
}

async function type(label: string | HTMLElement, value: string) {
  const element = typeof label === "string" ? field(label) : label as HTMLInputElement;
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

async function submit(form: Element | null) {
  await act(async () => (form as HTMLFormElement).requestSubmit());
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.queries.clear();
  mocks.mutations.clear();
  mocks.paginated.clear();
  mocks.queryArgs.clear();
  mocks.queries.set(listShopItemsAdminRef, { items, nextPriceChangeAt: now + 3_600_000 });
  mocks.queries.set(listShopVolunteersRef, [
    { adminId: "v1", name: "Priya Nair", email: "priya@example.com", canRedeemShop: true },
    { adminId: "v2", name: "Marcus Lee", email: "marcus@example.com", canRedeemShop: false },
  ]);
  mocks.queries.set(listFlashSalesRef, sales);
  vi.spyOn(console, "error").mockImplementation(() => {});
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ShopPage", () => {
  it("switches sections with links and marks the current tab", async () => {
    await render();
    expect(container.querySelector("h1")?.textContent).toBe("Shop");
    expect(button("Items").getAttribute("aria-current")).toBe("page");
    await click("Flash sales");
    expect(container.querySelector("[data-testid=location]")?.textContent).toBe("?tab=sales");
    expect(button("Flash sales").getAttribute("aria-current")).toBe("page");
    await click("History");
    expect(text()).toContain("Loading purchases");
    await click("Items");
    expect(container.querySelector("[data-testid=location]")?.textContent).toBe("");
  });

  it("shows a retryable error when a section fails to load", async () => {
    let fail = true;
    mocks.queries.set(listShopItemsAdminRef, () => {
      if (fail) throw new Error("offline");
      return { items, nextPriceChangeAt: null };
    });
    await render();
    expect(text()).toContain("Unable to load shop items");
    fail = false;
    await click("Try again");
    expect(text()).toContain("HackUTA 2026 T-shirt");
  });

  it("waits for a session and data", async () => {
    mocks.queries.set(listShopItemsAdminRef, undefined);
    await render();
    expect(text()).toContain("Loading shop items");
    await render("?tab=sales", auth({ sessionToken: null }));
    expect(text()).toContain("Loading flash sales");
    await render("?tab=history", auth({ sessionToken: null }));
    expect(text()).toContain("Loading purchases");
  });
});

describe("Items tab", () => {
  it("summarizes items and filters the table", async () => {
    await render();
    const stats = container.querySelector("[aria-label='Item summary']")!.textContent;
    expect(stats).toContain("Active items3");
    expect(stats).toContain("Inactive1");
    expect(stats).toContain("Archived1");
    expect(text()).toContain("4 of 5 items");
    expect(text()).toContain("On sale");
    expect(container.querySelector(".shop-price__was")?.textContent).toBe("400");
    expect(text()).toContain("Soft tee");

    await type("Search items", "sticker");
    expect(text()).toContain("1 of 5 items");
    await type("Search items", "");
    for (const [filter, count] of [["active", 3], ["archived", 1], ["all", 5]] as const) {
      await type("Filter by status", filter);
      expect(text()).toContain(`${count} of 5 items`);
    }
    await type("Search items", "nothing");
    expect(text()).toContain("No items match.");
  });

  it("shows an empty state before any items exist", async () => {
    mocks.queries.set(listShopItemsAdminRef, { items: [], nextPriceChangeAt: null });
    await render();
    expect(text()).toContain("No shop items yet");
  });

  it("adds an item through the form", async () => {
    mutation(createShopItemRef).mockResolvedValue({ itemId: "new" });
    await render();
    await click("Add item");
    await submit(container.querySelector("dialog form"));
    expect(text()).toContain("Enter a name.");
    expect(text()).toContain("Enter a whole number of 1 point or more.");

    await type("Name", "  Bucket hat ");
    await type("Description", "Sun hat");
    await type("Price (points)", "250");
    await type("Status", "archived");
    await submit(container.querySelector("dialog form"));
    expect(mutation(createShopItemRef)).toHaveBeenCalledWith({
      sessionToken: "session", name: "Bucket hat", description: "Sun hat", pointsCost: 250, active: false,
    });
    expect(mutation(setShopItemStatusRef)).toHaveBeenCalledWith({ sessionToken: "session", itemId: "new", status: "archived" });
    expect(text()).toContain("Bucket hat added.");
  });

  it("edits an item and changes its status", async () => {
    await render();
    await click("Edit HackUTA 2026 T-shirt");
    await type("Price (points)", "450");
    await type("Status", "inactive");
    await submit(container.querySelector("dialog form"));
    expect(mutation(updateShopItemRef)).toHaveBeenCalledWith({
      sessionToken: "session", itemId: "tee", name: "HackUTA 2026 T-shirt", description: "Soft tee", pointsCost: 450,
    });
    expect(mutation(setShopItemStatusRef)).toHaveBeenCalledWith({ sessionToken: "session", itemId: "tee", status: "inactive" });
    expect(text()).toContain("HackUTA 2026 T-shirt saved.");

    await click("Edit Sticker pack");
    mutation(updateShopItemRef).mockRejectedValueOnce(adminError("INVALID_SHOP_ITEM"));
    await submit(container.querySelector("dialog form"));
    expect(container.querySelector("dialog [role=alert]")?.textContent).toContain("Check the item name");
    expect(mutation(setShopItemStatusRef)).toHaveBeenCalledTimes(1);
  });

  it("turns shop access on and off for volunteers", async () => {
    await render();
    const marcus = button("Shop access for Marcus Lee");
    expect(marcus.getAttribute("aria-checked")).toBe("false");
    await act(async () => marcus.click());
    expect(mutation(setVolunteerShopAccessRef)).toHaveBeenCalledWith({ sessionToken: "session", volunteerAdminId: "v2", canRedeemShop: true });
    expect(text()).toContain("Marcus Lee can now sell shop items.");
    await click("Shop access for Priya Nair");
    expect(text()).toContain("Priya Nair can no longer sell shop items.");
    mutation(setVolunteerShopAccessRef).mockRejectedValueOnce(new Error("offline"));
    await click("Shop access for Priya Nair");
    expect(text()).toContain("We couldn't change shop access.");
  });

  it("shows volunteer loading and empty states", async () => {
    mocks.queries.set(listShopVolunteersRef, undefined);
    await render();
    expect(text()).toContain("Loading volunteers…");
    mocks.queries.set(listShopVolunteersRef, []);
    await render();
    expect(text()).toContain("No active volunteers yet.");
  });
});

describe("Flash sales tab", () => {
  it("lists sales by status and cancels after confirmation", async () => {
    await render("?tab=sales");
    expect(text()).toContain("Midnight tee sale");
    expect(text()).toContain("HackUTA 2026 T-shirt: 300 (was 400)");
    expect(text()).toContain("Unknown item: 10");
    for (const label of ["Live", "Scheduled", "Ended", "Cancelled"]) expect(text()).toContain(label);
    const live = container.querySelector(".shop-sale--live")!;
    await act(async () => (live.querySelector("button") as HTMLButtonElement).click());
    await act(async () => Array.from(live.querySelectorAll("button")).find((element) => element.textContent === "Keep sale")!.click());
    await act(async () => (live.querySelector("button") as HTMLButtonElement).click());
    await act(async () => Array.from(live.querySelectorAll("button")).find((element) => element.textContent === "Confirm cancel")!.click());
    expect(mutation(cancelFlashSaleRef)).toHaveBeenCalledWith({ sessionToken: "session", flashSaleId: "sale-live" });
    expect(text()).toContain("Midnight tee sale cancelled.");

    mutation(cancelFlashSaleRef).mockRejectedValueOnce(adminError("FLASH_SALE_NOT_EDITABLE"));
    await act(async () => Array.from(live.querySelectorAll("button")).find((element) => element.textContent === "Confirm cancel")!.click());
    expect(container.querySelector("[role=alert]")?.textContent).toContain("already started, ended, or been cancelled");
  });

  it("checks a new sale before scheduling it", async () => {
    await render("?tab=sales");
    const form = container.querySelector("form");
    await submit(form);
    const alert = container.querySelector("[role=alert]")!.textContent;
    expect(alert).toContain("Enter a title.");
    expect(alert).toContain("Add at least one item to the sale.");

    await type("Title", "Late-night drop");
    await type("Notification message", "Tees are cheap");
    await type("Starts", "");
    await submit(form);
    expect(text()).toContain("Choose a start and end date and time.");
    await type("Starts", "2099-01-01T10:00");
    await type("Ends", "2099-01-01T09:00");
    await submit(form);
    expect(text()).toContain("The sale must end after it starts.");
    await type("Starts", "2000-01-01T09:00");
    await type("Ends", "2000-01-01T10:00");
    await submit(form);
    expect(text()).toContain("The sale must end in the future.");

    await type("Starts", "2099-01-01T09:00");
    await type("Ends", "2099-01-01T10:00");
    await click("Add an item");
    await click("Add an item");
    await type(field("Item 2"), "bottle");
    await type("Sale price for Insulated bottle", "600");
    await submit(form);
    expect(text()).toContain("Insulated bottle: the sale price must be between 1 and 599 points.");
    await click("Remove Insulated bottle from the sale");
    mutation(createFlashSaleRef).mockRejectedValueOnce(adminError("FLASH_SALE_OVERLAP"));
    await submit(form);
    expect(text()).toContain("already in another sale during that time");
    await submit(form);
    expect(mutation(createFlashSaleRef)).toHaveBeenLastCalledWith({
      sessionToken: "session", title: "Late-night drop", message: "Tees are cheap",
      startsAt: new Date("2099-01-01T09:00").getTime(), endsAt: new Date("2099-01-01T10:00").getTime(),
      items: [{ itemId: "tee", salePointsCost: 320 }],
    });
    expect(text()).toContain("Sale scheduled.");
  });

  it("edits a scheduled sale and can stop editing", async () => {
    await render("?tab=sales");
    await click("Edit");
    expect(text()).toContain("Edit flash sale");
    expect(field("Title").value).toBe("Breakfast bundle");
    await submit(container.querySelector("form"));
    expect(mutation(updateFlashSaleRef)).toHaveBeenCalledWith(expect.objectContaining({ flashSaleId: "sale-next", items: [{ itemId: "stickers", salePointsCost: 30 }] }));
    expect(text()).toContain("Sale updated.");
    await click("Edit");
    await click("Stop editing");
    expect(text()).toContain("New flash sale");
  });
});

describe("History tab", () => {
  it("lists purchases and refunds one with a reason", async () => {
    const loadMore = vi.fn();
    mocks.paginated.set(listShopRedemptionsRef, {
      status: "CanLoadMore", loadMore,
      results: [
        purchase({}),
        purchase({ redemptionId: "red-2", participant: { participantId: "p2", name: "Aisha Khan" }, flashSale: null, refund: { refundedAt: now, reason: "Dented", pointsRestored: 600, refundedBy: { adminId: "a", name: "Sam" } } }),
      ],
    });
    await render("?tab=history");
    expect(text()).toContain("2 purchases shown");
    expect(text()).toContain("Dented · Sam");
    expect(text()).not.toContain("restocked");
    await click("Show more");
    expect(loadMore).toHaveBeenCalledWith(25);

    await click("Refund Riley Ready's HackUTA 2026 T-shirt");
    await submit(container.querySelector("dialog form"));
    expect(text()).toContain("Add a reason for the refund.");
    await type("Reason", "Wrong size");
    mutation(refundShopRedemptionRef).mockRejectedValueOnce(adminError("REDEMPTION_ALREADY_REFUNDED"));
    await submit(container.querySelector("dialog form"));
    expect(container.querySelector("dialog [role=alert]")?.textContent).toContain("already been refunded");
    await submit(container.querySelector("dialog form"));
    expect(mutation(refundShopRedemptionRef)).toHaveBeenLastCalledWith({ sessionToken: "session", redemptionId: "red-1", reason: "Wrong size" });
    expect(text()).toContain("300 points returned to Riley Ready.");
  });

  it("searches purchases and shows loading and empty states", async () => {
    await render("?tab=history");
    expect(text()).toContain("Loading purchases…");
    mocks.paginated.set(listShopRedemptionsRef, { status: "CanLoadMore", loadMore: vi.fn(), results: [] });
    await render("?tab=history");
    expect(text()).toContain("No purchases yet.");
    await type("Search purchases", " riley ");
    await submit(container.querySelector("form[role=search]"));
    expect(mocks.queryArgs.get(listShopRedemptionsRef)).toEqual({ sessionToken: "session", search: "riley" });
    expect(text()).toContain("No purchases match.");
    await click("Clear");
    expect(mocks.queryArgs.get(listShopRedemptionsRef)).toEqual({ sessionToken: "session" });
    await click("Show more");
    expect(mocks.paginated.get(listShopRedemptionsRef)!.loadMore).toHaveBeenCalledWith(25);
  });
});
