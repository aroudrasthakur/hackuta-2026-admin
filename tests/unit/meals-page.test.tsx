// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fireEvent, within } from "@testing-library/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MealsPage } from "../../src/pages/admin/MealsPage";
import { localDateTime } from "../../src/lib/dateFormat";
import { adminError } from "../../shared/admin/errors";
import type { AdminMeal } from "../../src/convex/mealsApi";
import { getFunctionName } from "convex/server";

const mocks = vi.hoisted(() => ({
  query: vi.fn(), pagination: vi.fn(), create: vi.fn(), update: vi.fn(), active: vi.fn(), remove: vi.fn(), loadMore: vi.fn(),
  auth: { sessionToken: "s".repeat(64) as string | null, staff: { role: "admin" } },
}));
vi.mock("../../src/hooks/useAdminAuth", () => ({ useAdminAuth: () => mocks.auth }));
vi.mock("../../src/convex/reactBindings", () => ({
  useQuery: (...args: unknown[]) => mocks.query(...args),
  usePaginatedQuery: (...args: unknown[]) => mocks.pagination(...args),
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => ({
    "admin/meals:createMealPeriod": mocks.create, "admin/meals:updateMealPeriod": mocks.update,
    "admin/meals:setMealPeriodActive": mocks.active, "admin/meals:removeMealPeriod": mocks.remove,
  })[getFunctionName(ref)],
}));

const NOW = new Date("2026-10-25T12:00:00Z").getTime();
function meal(fields: Partial<AdminMeal> = {}): AdminMeal {
  return { _id: "meal-1" as AdminMeal["_id"], _creationTime: 1, name: "Lunch", description: "Hot food",
    startsAt: NOW - 60_000, endsAt: NOW + 60_000, active: true, createdBy: "admin-1" as AdminMeal["createdBy"],
    createdAt: 1, updatedAt: 1, served: 10, ...fields };
}

describe("admin meals page", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    mocks.auth.sessionToken = "s".repeat(64); mocks.auth.staff.role = "admin";
    mocks.query.mockReset().mockReturnValue([meal()]);
    mocks.pagination.mockReset().mockReturnValue({ results: [], status: "Exhausted", loadMore: mocks.loadMore });
    for (const fn of [mocks.create, mocks.update, mocks.active, mocks.remove]) fn.mockReset().mockResolvedValue({ ok: true });
    mocks.loadMore.mockReset();
    vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) {
      this.setAttribute("open", ""); this.querySelector<HTMLElement>("[autofocus], input, button")?.focus();
    });
    vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement) { this.removeAttribute("open"); });
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });
  const ui = () => within(container);
  async function render() { await act(async () => root.render(<MealsPage />)); }
  async function click(name: string) { await act(async () => ui().getByRole("button", { name, exact: true }).click()); }
  async function change(label: string, value: string) { await act(async () => fireEvent.change(ui().getByLabelText(label), { target: { value } })); }
  async function fillForm() {
    await change("Meal name", "Midnight snacks");
    await change("Starts at", "2026-10-26T00:00"); await change("Ends at", "2026-10-26T01:00");
  }
  async function submit() { await act(async () => fireEvent.submit(container.querySelector("form")!)); }

  it.each(["reviewer", "volunteer"])("does not query or show controls to %s", async (role) => {
    mocks.auth.staff.role = role; await render(); expect(container.textContent).toBe(""); expect(mocks.query).not.toHaveBeenCalled();
  });
  it("waits for a session before querying", async () => {
    mocks.auth.sessionToken = null; await render(); expect(mocks.query).not.toHaveBeenCalled();
  });
  it("shows loading and empty states", async () => {
    mocks.query.mockReturnValue(undefined); await render(); expect(ui().getByRole("status").textContent).toContain("Loading meals");
    mocks.query.mockReturnValue([]); await render(); expect(container.textContent).toContain("No meals scheduled");
  });
  it("contains query failures and retries", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.query.mockImplementation(() => { throw new Error("Private server detail"); });
    await render(); expect(ui().getByRole("alert").textContent).toContain("Unable to load meals"); expect(container.textContent).not.toContain("Private server detail");
    mocks.query.mockReturnValue([meal()]); await click("Try again"); expect(container.textContent).toContain("Lunch");
  });
  it("shows real counts, history protection, and all statuses, and updates status when time passes", async () => {
    mocks.query.mockReturnValue([meal(), meal({ _id: "m2" as AdminMeal["_id"], name: "Snack", startsAt: NOW + 15_000, endsAt: NOW + 30_000, served: 0 }),
      meal({ _id: "m3" as AdminMeal["_id"], name: "Breakfast", endsAt: NOW, served: 4 }), meal({ _id: "m4" as AdminMeal["_id"], name: "Dinner", active: false })]);
    await render();
    expect(ui().getByRole("table").querySelectorAll('thead th[scope="col"]')).toHaveLength(5);
    for (const status of ["Upcoming", "Active", "Ended", "Disabled"]) expect(ui().getByRole("cell", { name: status, exact: true })).toBeDefined();
    expect(ui().getByRole<HTMLButtonElement>("button", { name: "Remove Lunch" }).disabled).toBe(true);
    await change("Meal status", "Upcoming"); expect(container.textContent).toContain("Snack");
    await act(async () => vi.advanceTimersByTime(15_000)); expect(container.textContent).toContain("No meals match this status");
    await change("Meal status", "Active"); expect(container.textContent).toContain("Snack");
    await act(async () => vi.advanceTimersByTime(15_000)); expect(container.textContent).not.toContain("Snack");
  });
  it("creates a custom meal and closes the modal on success", async () => {
    await render(); await click("Create meal"); await fillForm(); await submit();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ name: "Midnight snacks", active: true, startsAt: new Date("2026-10-26T00:00").getTime() }));
    expect(ui().queryByRole("dialog")).toBeNull(); expect(ui().getByRole("status").textContent).toBe("Meal created.");
  });
  it("keeps legacy counts pending and removal disabled until their count is complete", async () => {
    mocks.query.mockReturnValue([meal({ served: null })]);
    await render();
    expect(container.textContent).toContain("Updating count…");
    expect(ui().getByRole<HTMLButtonElement>("button", { name: "Remove Lunch" }).disabled).toBe(true);
    mocks.query.mockReturnValue([meal({ served: 0 })]);
    await render();
    expect(container.textContent).not.toContain("Updating count…");
    expect(ui().getByRole<HTMLButtonElement>("button", { name: "Remove Lunch" }).disabled).toBe(false);
  });
  it("rejects an invalid time range before sending a mutation", async () => {
    await render(); await click("Create meal"); await fillForm(); await change("Ends at", "2026-10-25T01:00"); await submit();
    expect(ui().getByRole("alert").textContent).toContain("end time after"); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("preserves form input and shows a safe overlap error", async () => {
    mocks.create.mockRejectedValue(adminError("MEAL_OVERLAP"));
    await render(); await click("Create meal"); await fillForm(); await submit();
    expect(ui().getByRole("alert").textContent).toContain("overlaps another enabled meal");
    expect(ui().getByLabelText<HTMLInputElement>("Meal name").value).toBe("Midnight snacks");
  });
  it("hides unexpected save errors and allows retry", async () => {
    mocks.create.mockRejectedValue(new Error("Internal data"));
    await render(); await click("Create meal"); await fillForm(); await submit();
    expect(ui().getByRole("alert").textContent).toContain("couldn't save"); expect(container.textContent).not.toContain("Internal data");
    mocks.create.mockResolvedValue({ ok: true }); await submit(); expect(ui().queryByRole("dialog")).toBeNull();
  });
  it("edits a meal and requires an explicit confirmation checkbox when disabling it", async () => {
    await render(); await click("Edit Lunch");
    expect(ui().getByLabelText<HTMLInputElement>("Starts at").value).toBe(localDateTime(NOW - 60_000));
    await change("Meal name", "Brunch");
    await act(async () => ui().getByLabelText<HTMLInputElement>("Enable during serving window").click());
    expect(ui().getByLabelText<HTMLInputElement>(/Confirm deactivation/).required).toBe(true);
    await act(async () => ui().getByLabelText<HTMLInputElement>(/Confirm deactivation/).click());
    await submit(); expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ mealPeriodId: "meal-1", name: "Brunch", active: false }));
    expect(ui().getByRole("status").textContent).toBe("Meal updated.");
  });
  it("cancels both a form and a destructive action without writing", async () => {
    await render(); await click("Create meal"); await click("Cancel");
    await click("Deactivate Lunch"); await click("Cancel");
    expect(mocks.active).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("deactivates only after confirmation, preserving the meal", async () => {
    await render(); await click("Deactivate Lunch"); expect(mocks.active).not.toHaveBeenCalled();
    await click("Deactivate meal"); expect(mocks.active).toHaveBeenCalledWith({ sessionToken: mocks.auth.sessionToken, mealPeriodId: "meal-1", active: false });
    expect(container.textContent).toContain("Collection history is preserved."); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("enables a disabled meal and shows errors inside the action dialog", async () => {
    mocks.query.mockReturnValue([meal({ active: false })]); mocks.active.mockRejectedValue(adminError("MEAL_OVERLAP"));
    await render(); await click("Activate Lunch"); await click("Activate meal"); expect(ui().getByRole("alert").textContent).toContain("overlaps");
    mocks.active.mockResolvedValue({ ok: true }); await click("Activate meal");
    expect(container.textContent).toContain("Meal enabled for its serving window.");
  });
  it("removes unused meals and handles a collection arriving before confirmation", async () => {
    mocks.query.mockReturnValue([meal({ served: 0 })]); mocks.remove.mockRejectedValue(adminError("MEAL_HAS_REDEMPTIONS"));
    await render(); await click("Remove Lunch"); await click("Remove meal");
    expect(ui().getByRole("alert").textContent).toContain("cannot be removed");
    mocks.remove.mockResolvedValue({ ok: true }); await click("Remove meal"); expect(container.textContent).toContain("Meal removed.");
  });
  it("disables repeat action submissions until the request completes", async () => {
    let finish!: () => void;
    mocks.active.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    await render(); await click("Deactivate Lunch"); await click("Deactivate meal");
    expect(ui().getByRole<HTMLButtonElement>("button", { name: "Updating…" }).disabled).toBe(true);
    expect(ui().getByRole<HTMLButtonElement>("button", { name: "Cancel" }).disabled).toBe(true);
    await act(async () => finish()); expect(mocks.active).toHaveBeenCalledOnce();
  });
  it("paginates history, applies time filters, and clears them", async () => {
    mocks.pagination.mockReturnValue({ results: [{ redemptionId: "r1", participantName: "Taylor", scannedByName: "Avery", redeemedAt: NOW }], status: "CanLoadMore", loadMore: mocks.loadMore });
    await render(); await click("History for Lunch"); expect(container.textContent).toContain("Taylor"); expect(container.textContent).toContain("Avery");
    await click("Load more collections"); expect(mocks.loadMore).toHaveBeenCalledWith(25);
    await change("Collected from", "2026-10-25T00:00"); await change("Collected through", "2026-10-25T23:59");
    expect(mocks.pagination).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ mealPeriodId: "meal-1", from: new Date("2026-10-25T00:00").getTime(), to: new Date("2026-10-25T23:59").getTime() }), { initialNumItems: 25 });
    await change("Collected through", "2026-10-24T23:59"); expect(ui().getByRole("alert").textContent).toContain("end after the start");
    await click("Clear filters"); expect(ui().queryByRole("alert")).toBeNull();
    expect(ui().getByLabelText<HTMLInputElement>("Collected from").value).toBe("");
  });
  it("shows history loading, empty, loading-more, and retry states", async () => {
    mocks.pagination.mockReturnValue({ results: [], status: "LoadingFirstPage", loadMore: mocks.loadMore });
    await render(); await click("History for Lunch"); expect(container.textContent).toContain("Loading collection history");
    mocks.pagination.mockReturnValue({ results: [], status: "LoadingMore", loadMore: mocks.loadMore }); await render();
    expect(ui().getByRole<HTMLButtonElement>("button", { name: "Loading…" }).disabled).toBe(true);
    expect(container.textContent).toContain("No collections found");
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.pagination.mockImplementation(() => { throw new Error("Backend detail"); }); await render();
    expect(container.textContent).toContain("Unable to load collection history");
    mocks.pagination.mockReturnValue({ results: [], status: "Exhausted", loadMore: mocks.loadMore });
    await click("Try again"); expect(container.textContent).toContain("No collections found");
  });
});
