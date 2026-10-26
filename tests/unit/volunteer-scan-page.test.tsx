// @vitest-environment happy-dom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GenericId } from "convex/values";
import { adminError } from "../../shared/admin/errors";
import { AdminAuthContext, type AdminAuthContextValue } from "../../src/contexts/adminAuthContext";
import {
  awardEventPointsRef,
  checkInParticipantRef,
  redeemMealRef,
  resolveQrForMealRef,
  listActiveMealPeriodsRef,
  type VolunteerMealPeriod,
  listMyScanOptionsRef,
  resolveQrForScanRef,
  type VolunteerScanOptions,
} from "../../src/convex/adminApi";
import { useScanWorkflow } from "../../src/hooks/useScanWorkflow";
import { ScanNetworkError } from "../../src/lib/scanResults";
import { VolunteerScanPage, type ScanWorkflowName } from "../../src/pages/admin/VolunteerScanPage";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  resolve: vi.fn(),
  resolveMeal: vi.fn(),
  checkIn: vi.fn(),
  food: vi.fn(),
  award: vi.fn(),
  scan: { value: "", source: "manual" as "manual" | "camera" },
}));

vi.mock("../../src/convex/reactBindings", () => ({
  useQuery: mocks.query,
  useMutation: (ref: unknown) => {
    if (ref === resolveQrForScanRef) return mocks.resolve;
    if (ref === checkInParticipantRef) return mocks.checkIn;
    if (ref === redeemMealRef) return mocks.food;
    if (ref === resolveQrForMealRef) return mocks.resolveMeal;
    if (ref === awardEventPointsRef) return mocks.award;
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

const token = "ab".repeat(32);
const workshop = { eventId: "event-workshop" as GenericId<"events">, name: "Workshop", pointsAwarded: 25, startsAt: 1, endsAt: 2 };
const panel = { eventId: "event-panel" as GenericId<"events">, name: "Panel", pointsAwarded: 10, startsAt: 3, endsAt: 4 };
let options: VolunteerScanOptions | undefined;
const lunch = { mealPeriodId: "meal-lunch" as GenericId<"mealPeriods">, name: "Lunch", startsAt: 0, endsAt: Number.MAX_SAFE_INTEGER, updatedAt: 1 };
let meals: VolunteerMealPeriod[] | undefined;
let container: HTMLDivElement;
let root: Root;

function auth(overrides: Partial<AdminAuthContextValue> = {}): AdminAuthContextValue {
  return {
    staff: { adminId: "volunteer", email: "v@example.com", name: "Avery", role: "volunteer", canCheckIn: true, canFoodCheckIn: true, expiresAt: Date.now() + 60_000 },
    sessionToken: "session",
    authError: null,
    isLoading: false,
    sessionReady: true,
    isAuthenticated: true,
    signIn: vi.fn(),
    signOut: vi.fn(),
    ...overrides,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <output>{location.pathname}{location.search}</output>;
}

async function render(workflow: ScanWorkflowName, path = `/admin/scan/${workflow}`, context = auth()) {
  await act(async () => root.render(
    <AdminAuthContext.Provider value={context}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path="*" element={<><VolunteerScanPage workflow={workflow} /><LocationProbe /></>} /></Routes>
      </MemoryRouter>
    </AdminAuthContext.Provider>,
  ));
}

const text = () => container.textContent ?? "";
const button = (name: string | RegExp) =>
  Array.from(container.querySelectorAll("button")).find((element) => (typeof name === "string" ? element.textContent === name : name.test(element.textContent ?? "")));

async function click(name: string | RegExp) {
  const target = button(name);
  if (!target) throw new Error(`No button ${String(name)}`);
  await act(async () => target.click());
}

async function scan(value = token, source: "manual" | "camera" = "manual") {
  mocks.scan.value = value;
  mocks.scan.source = source;
  await click("Simulate scan");
}

const currentStep = () => container.querySelector('[aria-current="step"]')?.textContent;
const result = () => container.querySelector('[aria-label="Scan result"] [role]');

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const checkInPreview = { status: "ok", purpose: "check_in", participant: { name: "Sam Lee", checkedIn: false, checkedInAt: null } };

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  options = { canCheckIn: true, canFoodCheckIn: true, events: [workshop, panel] };
  meals = [lunch];
  mocks.query.mockReset().mockImplementation((ref) => {
    if (ref === listActiveMealPeriodsRef) return meals;
    expect(ref).toBe(listMyScanOptionsRef);
    return options;
  });
  for (const mock of [mocks.resolve, mocks.resolveMeal, mocks.checkIn, mocks.food, mocks.award]) mock.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("check-in workflow", () => {
  it("resolves, waits for confirmation, then checks in", async () => {
    mocks.resolve.mockResolvedValue(checkInPreview);
    mocks.checkIn.mockResolvedValue({ status: "success", checkedInAt: 1 });
    await render("check-in");
    expect(container.querySelector("h1")?.textContent).toBe("Participant Check-in");
    expect(currentStep()).toBe("1. Scan");

    await scan(token.toUpperCase(), "camera");
    expect(mocks.resolve).toHaveBeenCalledWith({ sessionToken: "session", qrCodeToken: token, purpose: "check_in" });
    expect(mocks.checkIn).not.toHaveBeenCalled();
    expect(currentStep()).toBe("2. Confirm");
    expect(container.querySelector("h2")?.textContent).toBe("Sam Lee");
    expect(document.activeElement?.textContent).toBe("Sam Lee");
    expect(text()).toContain("Not checked in yet");
    expect(text()).not.toContain("Dietary");

    await click("Confirm check-in");
    expect(mocks.checkIn).toHaveBeenCalledWith({ sessionToken: "session", qrCodeToken: token });
    expect(currentStep()).toBe("3. Done");
    expect(result()?.getAttribute("role")).toBe("status");
    expect(result()?.textContent).toContain("Sam Lee is checked in.");
    expect(document.activeElement?.textContent).toBe("Scan next");

    await click("Scan next");
    expect(container.querySelector('[data-testid="scanner"]')?.getAttribute("data-autostart")).toBe("true");
  });

  it("explains an existing check-in without offering confirmation", async () => {
    mocks.resolve.mockResolvedValue({ status: "ok", purpose: "check_in", participant: { name: "Sam Lee", checkedIn: true, checkedInAt: 1 } });
    await render("check-in");
    await scan();
    expect(result()?.textContent).toContain("Already checked in");
    expect(button("Confirm check-in")).toBeUndefined();
    await click("Scan next");
    expect(container.querySelector('[data-testid="scanner"]')?.getAttribute("data-autostart")).toBe("false");
  });

  it("rejects codes that are not participant tokens without contacting the server", async () => {
    await render("check-in");
    await scan("https://example.com/not-a-token", "camera");
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(result()?.getAttribute("role")).toBe("alert");
    expect(result()?.textContent).toContain("Not a participant QR code");
  });

  it.each([
    ["qr_not_found", "Participant not found"],
    ["participant_not_eligible", "Participant not eligible"],
    ["not_authorized", "Permission required"],
    ["rate_limited", "Too many scans"],
  ])("explains a %s lookup", async (status, title) => {
    mocks.resolve.mockResolvedValue({ status });
    await render("check-in");
    await scan();
    expect(result()?.textContent).toContain(title);
  });

  it.each([
    [adminError("NOT_AUTHENTICATED"), "Session expired"],
    [adminError("VOLUNTEER_ONLY"), "Permission required"],
    [new ScanNetworkError(), "Connection problem"],
  ])("explains a failed lookup (%s)", async (error, title) => {
    mocks.resolve.mockRejectedValue(error);
    await render("check-in");
    await scan();
    expect(result()?.textContent).toContain(title);
  });

  it("ignores a lookup that finishes after the volunteer cancels", async () => {
    const pending = deferred<unknown>();
    mocks.resolve.mockReturnValue(pending.promise);
    await render("check-in");
    await scan();
    expect(text()).toContain("Looking up participant");
    expect(container.querySelector('[data-testid="scanner"]')).toBeNull();
    await click("Cancel");
    expect(container.querySelector('[data-testid="scanner"]')).not.toBeNull();
    await act(async () => pending.resolve(checkInPreview));
    expect(container.querySelector('[data-testid="scanner"]')).not.toBeNull();
    expect(text()).not.toContain("Sam Lee");
  });

  it("ignores a failed lookup after cancel", async () => {
    let reject!: (error: unknown) => void;
    mocks.resolve.mockReturnValue(new Promise((_, fail) => { reject = fail; }));
    await render("check-in");
    await scan();
    await click("Cancel");
    await act(async () => reject(new ScanNetworkError()));
    expect(result()).toBeNull();
  });

  it("submits a confirmation once while it is pending", async () => {
    mocks.resolve.mockResolvedValue(checkInPreview);
    const pending = deferred<unknown>();
    mocks.checkIn.mockReturnValue(pending.promise);
    await render("check-in");
    await scan();
    await click("Confirm check-in");
    const saving = button("Saving…")!;
    expect(saving.disabled).toBe(true);
    expect(saving.getAttribute("aria-busy")).toBe("true");
    expect(button("Cancel")!.disabled).toBe(true);
    await act(async () => saving.click());
    await act(async () => saving.click());
    expect(mocks.checkIn).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ status: "already_checked_in", checkedInAt: 1 }));
    expect(result()?.textContent).toContain("Already checked in");
  });

  it("keeps the confirmation for a retry after a rate limit or network failure", async () => {
    mocks.resolve.mockResolvedValue(checkInPreview);
    mocks.checkIn
      .mockResolvedValueOnce({ status: "rate_limited" })
      .mockRejectedValueOnce(new ScanNetworkError())
      .mockResolvedValueOnce({ status: "success", checkedInAt: 1 });
    await render("check-in");
    await scan();
    await click("Confirm check-in");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Too many scans");
    await click(/^Try again/);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Connection problem");
    await click(/^Try again/);
    expect(result()?.textContent).toContain("Checked in");
    expect(mocks.checkIn).toHaveBeenCalledTimes(3);
  });

  it("ends the flow when confirmation reports an expired session or revoked access", async () => {
    mocks.resolve.mockResolvedValue(checkInPreview);
    mocks.checkIn.mockRejectedValueOnce(adminError("NOT_AUTHENTICATED")).mockResolvedValueOnce({ status: "not_authorized" });
    await render("check-in");
    await scan();
    await click("Confirm check-in");
    expect(result()?.textContent).toContain("Session expired");
    await click("Scan next");
    await scan();
    await click("Confirm check-in");
    expect(result()?.textContent).toContain("Permission required");
  });

  it("drops the participant when the volunteer cancels confirmation", async () => {
    mocks.resolve.mockResolvedValue(checkInPreview);
    await render("check-in");
    await scan();
    await click("Cancel");
    expect(text()).not.toContain("Sam Lee");
    expect(currentStep()).toBe("1. Scan");
  });

  it("shows a loading state until scan access loads", async () => {
    options = undefined;
    await render("check-in");
    expect(text()).toContain("Loading your scan access");
  });
});

describe("food workflow", () => {
  it("keeps an in-flight confirmed collection visible when its meal becomes unavailable", async () => {
    mocks.resolveMeal.mockResolvedValue({ status: "ok", purpose: "food_check_in", meal: lunch,
      participant: { name: "Sam Lee", alreadyRedeemed: false, redeemedAt: null, dietaryInfo: "Vegan" } });
    const pending = deferred<unknown>(); mocks.food.mockReturnValue(pending.promise);
    await render("food"); await scan(); await click("Confirm food given");
    meals = []; await render("food");
    expect(button("Saving…")).toBeDefined();
    await act(async () => pending.resolve({ status: "success", redeemedAt: 1, meal: lunch }));
    expect(result()?.textContent).toContain("Sam Lee's food collection for Lunch is recorded.");
    expect(text()).not.toContain("Vegan");
    await click("Scan next"); expect(text()).toContain("No meals available");
    expect(button("Simulate scan")).toBeUndefined();
  });

  it("allows cancelling meal selection and keeping the current meal", async () => {
    meals = [lunch, { ...lunch, mealPeriodId: "snack" as GenericId<"mealPeriods">, name: "Snack" }];
    await render("food", "/admin/scan/food?meal=meal-lunch");
    await click("Change meal"); await click("Keep Lunch");
    expect(text()).not.toContain("Choose your meal"); expect(button("Simulate scan")).toBeDefined();
    expect(container.querySelector("output")?.textContent).toContain("meal=meal-lunch");
  });

  it("shows dietary information only during confirmation", async () => {
    mocks.resolveMeal.mockResolvedValue({
      status: "ok",
      purpose: "food_check_in",
      meal: lunch,
      participant: { name: "Sam Lee", alreadyRedeemed: false, redeemedAt: null, dietaryInfo: "Vegan; Allergies: nuts" },
    });
    mocks.food.mockResolvedValue({ status: "success", redeemedAt: 1, meal: lunch });
    await render("food");
    await scan();
    expect(mocks.resolveMeal).toHaveBeenCalledWith({ sessionToken: "session", qrCodeToken: token, mealPeriodId: lunch.mealPeriodId });
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(text()).toContain("Not redeemed yet");
    expect(text()).toContain("Vegan; Allergies: nuts");
    await click("Confirm food given");
    expect(mocks.food).toHaveBeenCalledWith({ sessionToken: "session", qrCodeToken: token, mealPeriodId: lunch.mealPeriodId });
    expect(result()?.textContent).toContain("Food collected");
    expect(text()).not.toContain("Vegan");
  });

  it("states when no dietary restrictions are listed and explains repeats", async () => {
    mocks.resolveMeal.mockResolvedValue({
      status: "ok",
      purpose: "food_check_in",
      meal: lunch,
      participant: { name: "Sam Lee", alreadyRedeemed: false, redeemedAt: null, dietaryInfo: null },
    });
    mocks.food.mockResolvedValue({ status: "already_redeemed", redeemedAt: 1, meal: lunch });
    await render("food");
    await scan();
    expect(text()).toContain("None listed");
    await click("Confirm food given");
    expect(result()?.textContent).toContain("Food Already Collected");
    expect(result()?.textContent).toContain("for Lunch.");
  });

  it("waits for meal availability and does not scan when no meal is being served", async () => {
    meals = undefined; await render("food"); expect(text()).toContain("Loading available meals");
    meals = []; await render("food"); expect(text()).toContain("No meals available");
    expect(button("Simulate scan")).toBeUndefined();
  });

  it("requires a choice for multiple available meals and resets the participant when switching", async () => {
    const snack = { ...lunch, mealPeriodId: "snack" as GenericId<"mealPeriods">, name: "Snack" };
    meals = [lunch, snack];
    mocks.resolveMeal.mockResolvedValue({ status: "ok", purpose: "food_check_in", meal: lunch,
      participant: { name: "Sam Lee", alreadyRedeemed: false, redeemedAt: null, dietaryInfo: "Vegan" } });
    await render("food"); expect(text()).toContain("Choose your meal"); expect(button("Simulate scan")).toBeUndefined();
    await act(async () => container.querySelector<HTMLInputElement>('input[name="scan-meal"]')!.click());
    expect(container.querySelector("output")?.textContent).toContain("meal=meal-lunch");
    await scan(); expect(text()).toContain("Vegan");
    // Event/meal switching is locked during confirmation to avoid mixed-up awards.
    expect(button("Change meal")).toBeUndefined();
    await click("Cancel");
    await click("Change meal"); expect(text()).not.toContain("Sam Lee");
    await act(async () => container.querySelectorAll<HTMLInputElement>('input[name="scan-meal"]')[1]!.click());
    expect(text()).toContain("Snack"); expect(text()).not.toContain("Vegan"); expect(mocks.food).not.toHaveBeenCalled();
  });

  it("clears a pending preview and ignores its late response after a meal is disabled", async () => {
    const pending = deferred<unknown>(); mocks.resolveMeal.mockReturnValue(pending.promise);
    await render("food"); await scan();
    meals = []; await render("food");
    await act(async () => pending.resolve({ status: "ok", purpose: "food_check_in", meal: lunch,
      participant: { name: "Sam Lee", alreadyRedeemed: false, redeemedAt: null, dietaryInfo: "Vegan" } }));
    expect(text()).toContain("No meals available"); expect(text()).not.toContain("Sam Lee"); expect(mocks.food).not.toHaveBeenCalled();
  });

  it("starts and ends availability at the clock boundary without a database change", async () => {
    vi.useFakeTimers(); const now = Date.now();
    meals = [{ ...lunch, startsAt: now + 1000, endsAt: now + 2000 }];
    await render("food"); expect(text()).toContain("No meals available");
    await act(async () => vi.advanceTimersByTime(1000)); expect(button("Simulate scan")).toBeDefined();
    await act(async () => vi.advanceTimersByTime(1000)); expect(button("Simulate scan")).toBeUndefined(); expect(text()).toContain("No meals available");
  });

  it("does not silently replace an explicitly selected meal that was removed", async () => {
    await render("food", "/admin/scan/food?meal=removed");
    expect(text()).toContain("selected meal is no longer available"); expect(text()).toContain("Choose your meal");
    expect(button("Simulate scan")).toBeUndefined();
  });

  it("clears confirmation after a schedule edit", async () => {
    mocks.resolveMeal.mockResolvedValue({ status: "ok", purpose: "food_check_in", meal: lunch,
      participant: { name: "Sam Lee", alreadyRedeemed: false, redeemedAt: null, dietaryInfo: "Vegan" } });
    await render("food"); await scan(); expect(text()).toContain("Sam Lee");
    meals = [{ ...lunch, updatedAt: 2 }]; await render("food");
    expect(text()).not.toContain("Sam Lee"); expect(button("Simulate scan")).toBeDefined();
  });

  it("reports a duplicate during preview and immediately offers Scan next", async () => {
    mocks.resolveMeal.mockResolvedValue({ status: "ok", purpose: "food_check_in", meal: lunch,
      participant: { name: "Sam Lee", alreadyRedeemed: true, redeemedAt: 1, dietaryInfo: "Vegan" } });
    await render("food"); await scan(); expect(result()?.textContent).toContain("Food Already Collected");
    expect(text()).not.toContain("Vegan"); expect(mocks.food).not.toHaveBeenCalled();
    expect(document.activeElement?.textContent).toBe("Scan next"); await click("Scan next"); expect(button("Simulate scan")).toBeDefined();
  });

  it.each(["meal_not_active", "meal_not_started", "meal_ended", "participant_ineligible", "not_authorized"])("handles %s between preview and confirmation", async (status) => {
    mocks.resolveMeal.mockResolvedValue({ status: "ok", purpose: "food_check_in", meal: lunch,
      participant: { name: "Sam Lee", alreadyRedeemed: false, redeemedAt: null, dietaryInfo: "Vegan" } });
    mocks.food.mockResolvedValue({ status }); await render("food"); await scan(); await click("Confirm food given");
    expect(result()?.getAttribute("role")).toBe("alert"); expect(text()).not.toContain("Vegan");
  });

  it("preserves the selected meal and confirmation across retryable failures", async () => {
    mocks.resolveMeal.mockResolvedValue({ status: "ok", purpose: "food_check_in", meal: lunch,
      participant: { name: "Sam Lee", alreadyRedeemed: false, redeemedAt: null, dietaryInfo: "Vegan" } });
    mocks.food.mockResolvedValueOnce({ status: "rate_limited" }).mockRejectedValueOnce(new ScanNetworkError())
      .mockResolvedValueOnce({ status: "success", redeemedAt: 1, meal: lunch });
    await render("food"); await scan(); await click("Confirm food given");
    expect(text()).toContain("Too many scans"); await click(/^Try again/); expect(text()).toContain("Connection problem");
    await click(/^Try again/); expect(result()?.textContent).toContain("Food collected");
    expect(mocks.food).toHaveBeenLastCalledWith({ sessionToken: "session", qrCodeToken: token, mealPeriodId: lunch.mealPeriodId });
  });

  it("contains meal-query errors and retries without exposing server details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.query.mockImplementation((ref) => { if (ref === listActiveMealPeriodsRef) throw new Error("Private details"); return options; });
    await render("food"); expect(text()).toContain("Unable to load available meals"); expect(text()).not.toContain("Private details");
    mocks.query.mockImplementation((ref) => ref === listActiveMealPeriodsRef ? [lunch] : options);
    await click("Try again"); expect(button("Simulate scan")).toBeDefined();
  });
});

describe("points workflow", () => {
  const pointsPreview = (event: typeof workshop, alreadyAwarded = false) => ({
    status: "ok",
    purpose: "point_scan",
    participant: { name: "Sam Lee" },
    event: { eventId: event.eventId, name: event.name, pointsAwarded: event.pointsAwarded },
    alreadyAwarded,
  });

  it("requires an assigned event, then awards its fixed points", async () => {
    mocks.resolve.mockResolvedValue(pointsPreview(workshop));
    mocks.award.mockResolvedValue({ status: "success", pointsAwarded: 25 });
    await render("points");
    expect(text()).toContain("Choose an event to start scanning.");
    expect(container.querySelector('[data-testid="scanner"]')).toBeNull();
    expect(container.querySelector('input[type="number"]')).toBeNull();

    await act(async () => container.querySelector<HTMLInputElement>(`input[value="${workshop.eventId}"]`)!.click());
    expect(container.querySelector("output")?.textContent).toBe(`/admin/scan/points?event=${workshop.eventId}`);
    expect(text()).toContain("Scanning for");
    expect(text()).toContain("25 points");

    await scan();
    expect(mocks.resolve).toHaveBeenCalledWith({ sessionToken: "session", qrCodeToken: token, purpose: "point_scan", eventId: workshop.eventId });
    expect(text()).toContain("Workshop");
    await click("Award 25 points");
    expect(mocks.award).toHaveBeenCalledWith({ sessionToken: "session", qrCodeToken: token, eventId: workshop.eventId });
    expect(result()?.textContent).toContain("25 points awarded");
  });

  it("clears the participant when the event changes", async () => {
    mocks.resolve.mockResolvedValue(pointsPreview(workshop));
    await render("points", `/admin/scan/points?event=${workshop.eventId}`);
    await scan();
    expect(text()).toContain("Sam Lee");
    // Keep the selected event fixed while confirming a participant.
    expect(button("Change event")).toBeUndefined();
    await click("Cancel");
    await click("Change event");
    expect(text()).not.toContain("Sam Lee");
    await act(async () => container.querySelector<HTMLInputElement>(`input[value="${panel.eventId}"]`)!.click());
    expect(container.querySelector("output")?.textContent).toBe(`/admin/scan/points?event=${panel.eventId}`);
    expect(container.querySelector('[data-testid="scanner"]')).not.toBeNull();
    expect(text()).not.toContain("Sam Lee");
  });

  it("selects the only assigned event automatically", async () => {
    options = { canCheckIn: false, canFoodCheckIn: false, events: [panel] };
    mocks.resolve.mockResolvedValue(pointsPreview(panel, true));
    await render("points");
    expect(button("Change event")).toBeUndefined();
    await scan();
    expect(mocks.resolve).toHaveBeenCalledWith(expect.objectContaining({ eventId: panel.eventId }));
    expect(result()?.textContent).toContain("Points already awarded");
  });

  it("shows the picker for an event that is no longer assigned", async () => {
    await render("points", "/admin/scan/points?event=removed");
    expect(text()).toContain("Choose your event");
    expect(container.querySelector('[data-testid="scanner"]')).toBeNull();
  });

  it.each([
    [{ status: "participant_not_checked_in" }, "Not checked in yet"],
    [{ status: "already_awarded" }, "Points already awarded"],
    [{ status: "event_denied" }, "Event not assigned"],
    [{ status: "event_inactive" }, "Event not active"],
  ])("explains an award result %j", async (response, title) => {
    mocks.resolve.mockResolvedValue(pointsPreview(workshop));
    mocks.award.mockResolvedValue(response);
    await render("points", `/admin/scan/points?event=${workshop.eventId}`);
    await scan();
    await click("Award 25 points");
    expect(result()?.textContent).toContain(title);
  });
});

function WorkflowHarness({ purpose, eventId }: { purpose: "check_in" | "point_scan" | "food_check_in"; eventId?: GenericId<"events"> }) {
  const { state, scan: runScan, confirm } = useScanWorkflow(purpose, eventId);
  return (
    <>
      <output>{state.step === "result" ? state.outcome.title : state.step}</output>
      <button type="button" onClick={() => void runScan(token)}>scan</button>
      <button type="button" onClick={() => void confirm()}>confirm</button>
    </>
  );
}

describe("useScanWorkflow guards", () => {
  async function renderHarness(element: ReactElement, context = auth()) {
    await act(async () => root.render(<AdminAuthContext.Provider value={context}>{element}</AdminAuthContext.Provider>));
  }
  const step = () => container.querySelector("output")?.textContent;

  it("refuses a point scan without an event", async () => {
    await renderHarness(<WorkflowHarness purpose="point_scan" />);
    await click("scan");
    expect(step()).toBe("Event not assigned");
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("refuses a food scan without a selected meal", async () => {
    await renderHarness(<WorkflowHarness purpose="food_check_in" />); await click("scan");
    expect(step()).toBe("Meal not available"); expect(mocks.resolveMeal).not.toHaveBeenCalled();
  });

  it("requires a session to look up or confirm", async () => {
    await renderHarness(<WorkflowHarness purpose="check_in" />, auth({ sessionToken: null }));
    await click("scan");
    expect(step()).toBe("Session expired");

    mocks.resolve.mockResolvedValue(checkInPreview);
    await renderHarness(<WorkflowHarness purpose="check_in" />);
    await click("confirm");
    expect(mocks.checkIn).not.toHaveBeenCalled();
    await click("scan");
    expect(step()).toBe("confirm");
    await click("scan");
    expect(mocks.resolve).toHaveBeenCalledTimes(1);
    await renderHarness(<WorkflowHarness purpose="check_in" />, auth({ sessionToken: null }));
    await click("confirm");
    expect(step()).toBe("Session expired");
    expect(mocks.checkIn).not.toHaveBeenCalled();
  });
});
