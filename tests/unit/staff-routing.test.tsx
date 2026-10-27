// @vitest-environment happy-dom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GenericId } from "convex/values";
import App from "../../src/App";
import { AdminAuthContext, type AdminAuthContextValue, type StaffProfile } from "../../src/contexts/adminAuthContext";
import { listMyScanOptionsRef, listActiveMealPeriodsRef, type VolunteerScanOptions } from "../../src/convex/adminApi";
import { canAccessStaffRoute, intendedStaffDestination, staffHome } from "../../src/lib/staffRouteAccess";
import { ADMIN_ROUTES } from "../../src/types/routes";
vi.mock("../../src/components/WeatherMoodToggle", () => ({ WeatherMoodToggle: () => null }));

vi.mock("../../src/components/StormPageFrame", () => ({ StormPageFrame: ({ children }: { children: unknown }) => <div>{children}</div> }));
vi.mock("../../src/pages/admin/ApplicationsPage", () => ({ ApplicationsPage: () => <h1>Applications queue</h1> }));
vi.mock("../../src/pages/admin/ApplicationReviewPage", () => ({ ApplicationReviewPage: () => <h1>Application review</h1> }));
vi.mock("../../src/pages/admin/DecisionEmailQueuePage", () => ({ DecisionEmailQueuePage: () => <h1>Decision email queue</h1> }));
vi.mock("../../src/pages/admin/VolunteersPage", () => ({ VolunteersPage: () => <h1>Volunteers</h1> }));
vi.mock("../../src/pages/admin/VolunteerDetailPage", () => ({ VolunteerDetailPage: () => <h1>Volunteer detail</h1> }));
vi.mock("../../src/pages/admin/EventsPage", () => ({ EventsPage: () => <h1>Events</h1> }));
vi.mock("../../src/pages/admin/ShopPage", () => ({ ShopPage: () => <h1>Shop</h1> }));
vi.mock("../../src/pages/admin/VolunteerShopPage", () => ({ VolunteerShopPage: () => <h1>Shop redemption</h1> }));
const query = vi.hoisted(() => vi.fn());
vi.mock("../../src/convex/reactBindings", () => ({ useQuery: query, useMutation: () => vi.fn() }));

const staff: StaffProfile = { adminId: "staff", email: "staff@example.com", name: "Avery", role: "volunteer", canCheckIn: true, canFoodCheckIn: true, expiresAt: Date.now() + 60_000 };
const event = { eventId: "event-1" as GenericId<"events">, name: "Opening workshop", pointsAwarded: 20, startsAt: Date.now() - 1000, endsAt: Date.now() + 60_000 };
const allOptions: VolunteerScanOptions = { canCheckIn: true, canFoodCheckIn: true, canRedeemShop: false, events: [event] };
let options: VolunteerScanOptions | undefined;
let container: HTMLDivElement;
let root: Root;

function auth(overrides: Partial<AdminAuthContextValue> = {}): AdminAuthContextValue {
  return { staff, sessionToken: "token", authError: null, isLoading: false, sessionReady: true, isAuthenticated: true, signIn: vi.fn(), signOut: vi.fn(), ...overrides };
}

function Probe() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output data-state={JSON.stringify(location.state)}>{location.pathname}{location.search}{location.hash}</output><button onClick={() => navigate(-1)}>Back</button><button onClick={() => navigate(1)}>Forward</button></>;
}

async function render(path: string | { pathname: string; state: unknown }, context = auth()) {
  await act(async () => root.render(
    <StrictMode>
      <AdminAuthContext.Provider value={context}>
        <MemoryRouter initialEntries={[path]}><App /><Probe /></MemoryRouter>
      </AdminAuthContext.Provider>
    </StrictMode>,
  ));
}
const path = () => container.querySelector("output")?.textContent;
const links = () => Array.from(container.querySelectorAll("nav a"), (link) => link.textContent);
async function click(selector: string) {
  await act(async () => container.querySelector<HTMLElement>(selector)!.click());
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  options = allOptions;
  query.mockReset().mockImplementation((ref) => {
    if (ref === listActiveMealPeriodsRef) return [];
    expect(ref).toBe(listMyScanOptionsRef);
    return options;
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("staff route policy", () => {
  it.each(["admin", "reviewer", "volunteer"] as const)("restricts every route for %s", (role) => {
    const profile = { ...staff, role };
    for (const route of [ADMIN_ROUTES.applications, ADMIN_ROUTES.decisionEmails, ADMIN_ROUTES.applicationReview("abc")]) {
      expect(canAccessStaffRoute(route, profile, allOptions)).toBe(role !== "volunteer");
    }
    for (const route of [ADMIN_ROUTES.participants, ADMIN_ROUTES.volunteers, ADMIN_ROUTES.volunteerDetail("volunteer-1"), ADMIN_ROUTES.events, ADMIN_ROUTES.shop]) {
      expect(canAccessStaffRoute(route, profile, allOptions)).toBe(role === "admin");
    }
    for (const route of [ADMIN_ROUTES.scan, ADMIN_ROUTES.volunteer, ADMIN_ROUTES.scanCheckIn, ADMIN_ROUTES.scanFood, ADMIN_ROUTES.scanPoints]) {
      expect(canAccessStaffRoute(route, profile, allOptions)).toBe(role === "volunteer");
    }
    expect(canAccessStaffRoute("/unknown", profile, allOptions)).toBe(false);
    expect(canAccessStaffRoute("/admin", profile, allOptions)).toBe(true);
    expect(staffHome(profile)).toBe(role === "volunteer" ? ADMIN_ROUTES.scan : ADMIN_ROUTES.applications);
  });

  it("denies missing flags and waits for assignment information", () => {
    expect(canAccessStaffRoute(ADMIN_ROUTES.scanCheckIn, staff, undefined)).toBeUndefined();
    expect(canAccessStaffRoute(ADMIN_ROUTES.scanCheckIn, { ...staff, canCheckIn: undefined }, allOptions)).toBe(false);
    expect(canAccessStaffRoute(ADMIN_ROUTES.scanFood, { ...staff, canFoodCheckIn: false }, allOptions)).toBe(false);
    expect(canAccessStaffRoute(ADMIN_ROUTES.scanPoints, staff, { ...allOptions, events: [] })).toBe(false);
  });

  it("limits the shop to admins and shop redemption to volunteers with shop access", () => {
    for (const role of ["admin", "reviewer", "volunteer"] as const) {
      expect(canAccessStaffRoute(ADMIN_ROUTES.shop, { ...staff, role }, allOptions)).toBe(role === "admin");
      expect(canAccessStaffRoute(ADMIN_ROUTES.scanShop, { ...staff, role, canRedeemShop: true }, { ...allOptions, canRedeemShop: true })).toBe(role === "volunteer");
    }
    expect(canAccessStaffRoute(ADMIN_ROUTES.scanShop, { ...staff, canRedeemShop: true }, undefined)).toBeUndefined();
    expect(canAccessStaffRoute(ADMIN_ROUTES.scanShop, staff, { ...allOptions, canRedeemShop: true })).toBe(false);
    expect(canAccessStaffRoute(ADMIN_ROUTES.scanShop, { ...staff, canRedeemShop: true }, { ...allOptions, canRedeemShop: false })).toBe(false);
  });

  it("restores only known authorized internal destinations", () => {
    expect(intendedStaffDestination({ from: { pathname: ADMIN_ROUTES.scanPoints, search: "?event=event-1", hash: "#scan" } }, staff, allOptions)).toBe("/admin/scan/points?event=event-1#scan");
    expect(intendedStaffDestination({ from: { pathname: ADMIN_ROUTES.scan, search: "https://evil.test", hash: "javascript:alert(1)" } }, staff, allOptions)).toBe(ADMIN_ROUTES.scan);
    for (const state of [null, {}, { from: {} }, { from: { pathname: 7 } }, { from: { pathname: "//evil.test" } }, { from: { pathname: ADMIN_ROUTES.participants } }]) {
      expect(intendedStaffDestination(state, staff, allOptions)).toBe(ADMIN_ROUTES.scan);
    }
  });
});

describe("protected staff screens", () => {
  it.each([
    [ADMIN_ROUTES.scan, /Good (morning|afternoon|evening),/],
    [ADMIN_ROUTES.scanCheckIn, "Participant check-in"],
    [ADMIN_ROUTES.scanFood, "Food distribution"],
    [ADMIN_ROUTES.scanPoints, "Event points"],
  ])("opens an authorized direct link to %s", async (route, heading) => {
    await render(route);
    expect(path()).toBe(route);
    expect(container.querySelector("h1")?.textContent).toMatch(heading);
    expect(links()).toEqual(["Dashboard", "Check-in", "Food", "Points"]);
  });

  it.each(["admin", "reviewer"] as const)("shows the correct %s navigation and management routes", async (role) => {
    await render(ADMIN_ROUTES.participants, auth({ staff: { ...staff, role } }));
    expect(path()).toBe(role === "admin" ? ADMIN_ROUTES.participants : ADMIN_ROUTES.applications);
    expect(links()).toEqual(role === "admin" ? ["Applications", "Decision emails", "Participants", "Volunteers", "Events", "Meals", "Shop"] : ["Applications", "Decision emails"]);
    expect(query.mock.calls.every(([, args]) => args === "skip")).toBe(true);
  });

  it("opens the shop for administrators and shop redemption for shop volunteers", async () => {
    query.mockImplementation((ref) => ref === listMyScanOptionsRef ? options : undefined);
    await render(ADMIN_ROUTES.shop, auth({ staff: { ...staff, role: "admin" } }));
    expect(container.querySelector("h1")?.textContent).toBe("Shop");
    options = { ...allOptions, canRedeemShop: true };
    await render(ADMIN_ROUTES.scan, auth({ staff: { ...staff, canRedeemShop: true } }));
    expect(links()).toEqual(["Dashboard", "Check-in", "Food", "Points", "Shop"]);
    expect(container.textContent).toContain("Shop redemption");
    await click('nav a[href="/admin/scan/shop"]');
    expect(path()).toBe(ADMIN_ROUTES.scanShop);
    expect(container.querySelector("h1")?.textContent).toBe("Shop redemption");
  });

  it.each([
    [ADMIN_ROUTES.volunteers, "Volunteers"],
    [ADMIN_ROUTES.volunteerDetail("volunteer-1"), "Volunteer detail"],
    [ADMIN_ROUTES.events, "Events"],
    [ADMIN_ROUTES.meals, "Meals"],
  ])("opens %s for administrators", async (route, heading) => {
    await render(route, auth({ staff: { ...staff, role: "admin" } }));
    expect(path()).toBe(route);
    expect(container.querySelector("h1")?.textContent).toBe(heading);
  });

  it("keeps the Volunteers tab current on a volunteer's page", async () => {
    await render(ADMIN_ROUTES.volunteerDetail("volunteer-1"), auth({ staff: { ...staff, role: "admin" } }));
    const current = container.querySelector('nav a[aria-current="page"]');
    expect(current?.textContent).toBe("Volunteers");
  });

  it.each([ADMIN_ROUTES.events, ADMIN_ROUTES.volunteerDetail("volunteer-1"), ADMIN_ROUTES.shop, ADMIN_ROUTES.meals])("sends reviewers away from %s", async (route) => {
    await render(route, auth({ staff: { ...staff, role: "reviewer" } }));
    expect(path()).toBe(ADMIN_ROUTES.applications);
  });

  it.each(["/unknown", "/", "/admin", "/volunteer"])("resolves %s to the volunteer home", async (route) => {
    await render(route);
    expect(path()).toBe(ADMIN_ROUTES.scan);
  });

  it("waits without mounting a scanner while permissions load", async () => {
    options = undefined;
    await render(ADMIN_ROUTES.scanPoints);
    expect(container.textContent).toContain("Checking scan permissions");
    expect(container.querySelector("h1")).toBeNull();
    options = allOptions;
    await render(ADMIN_ROUTES.scanPoints);
    expect(container.querySelector("h1")?.textContent).toBe("Event points");
  });

  it("waits on the dashboard for assignment loading", async () => {
    options = undefined;
    await render(ADMIN_ROUTES.scan);
    expect(container.textContent).toContain("Loading your responsibilities");
    expect(links()).toEqual(["Dashboard"]);
  });

  it.each([ADMIN_ROUTES.scanCheckIn, ADMIN_ROUTES.scanFood, ADMIN_ROUTES.scanPoints])("immediately removes revoked access to %s", async (route) => {
    await render(route);
    options = { canCheckIn: false, canFoodCheckIn: false, events: [] };
    await render(route, auth({ staff: { ...staff, canCheckIn: false, canFoodCheckIn: false } }));
    expect(path()).toBe(ADMIN_ROUTES.scan);
    expect(links()).toEqual(["Dashboard"]);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("current permissions");
    expect(container.textContent).toContain("No responsibilities assigned yet");
  });

  it("removes event assignments and explains revocation while staying on the dashboard", async () => {
    await render(ADMIN_ROUTES.scan);
    expect(container.textContent).toContain("Opening workshop");
    options = { ...allOptions, events: [] };
    await render(ADMIN_ROUTES.scan);
    expect(container.textContent).not.toContain("Opening workshop");
    expect(links()).toEqual(["Dashboard", "Check-in", "Food"]);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("scan access was removed");
  });

  it("does not treat initial permission loading or a refresh as revoked access", async () => {
    options = undefined;
    await render(ADMIN_ROUTES.scan);
    options = allOptions;
    await render(ADMIN_ROUTES.scan);
    expect(container.querySelector('[role="status"]')).toBeNull();

    options = undefined;
    await render(ADMIN_ROUTES.scan);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Loading your responsibilities");
    expect(container.textContent).not.toContain("scan access was removed");
    expect(links()).toEqual(["Dashboard"]);

    options = allOptions;
    await render(ADMIN_ROUTES.scan);
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(links()).toEqual(["Dashboard", "Check-in", "Food", "Points"]);

    options = { ...allOptions, events: [] };
    await render(ADMIN_ROUTES.scan);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("scan access was removed");
  });

  it("retains the revocation notice after permissions are restored and navigation changes", async () => {
    await render(ADMIN_ROUTES.scan);
    options = { ...allOptions, events: [] };
    await render(ADMIN_ROUTES.scan);
    options = allOptions;
    await render(ADMIN_ROUTES.scan);
    await click('nav a[href="/admin/scan/check-in"]');
    expect(path()).toBe(ADMIN_ROUTES.scanCheckIn);
    expect(links()).toEqual(["Dashboard", "Check-in", "Food", "Points"]);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("scan access was removed");
  });

  it("rejects a stale selected event even when another event remains assigned", async () => {
    await render(`${ADMIN_ROUTES.scanPoints}?event=event-1`);
    expect(path()).toBe("/admin/scan/points?event=event-1");
    options = { ...allOptions, events: [{ ...event, eventId: "other-event" as GenericId<"events"> }] };
    await render(`${ADMIN_ROUTES.scanPoints}?event=event-1`);
    expect(path()).toBe(ADMIN_ROUTES.scan);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("current permissions");
    expect(links()).toContain("Points");
  });

  it("clears the staff layout immediately on account deactivation", async () => {
    await render(ADMIN_ROUTES.scanFood);
    await render(ADMIN_ROUTES.scanFood, auth({ isAuthenticated: false, sessionToken: null, staff: null }));
    expect(path()).toBe(ADMIN_ROUTES.login);
    expect(container.querySelector("nav")).toBeNull();
    expect(container.textContent).not.toContain("Avery");
  });

  it("clears an authenticated account's destination when its session ends", async () => {
    await render("/admin/applications?status=waitlisted", auth({ staff: { ...staff, role: "reviewer" } }));
    await render("/admin/applications?status=waitlisted", auth({ isAuthenticated: false, sessionToken: null, staff: null }));
    expect(path()).toBe(ADMIN_ROUTES.login);
    expect(container.querySelector("output")?.getAttribute("data-state")).toBe("null");
    await render(ADMIN_ROUTES.login, auth({ staff: { ...staff, role: "admin" } }));
    expect(path()).toBe(ADMIN_ROUTES.applications);
  });

  it("remembers a session resolved after bootstrap across a later session refresh", async () => {
    const route = "/admin/applications?status=waitlisted";
    const loading = auth({ isLoading: true, isAuthenticated: false, sessionReady: false, sessionToken: null, staff: undefined });
    await render(route, loading);
    expect(path()).toBe(route);
    expect(container.querySelector("h1")).toBeNull();

    await render(route, auth({ staff: { ...staff, role: "reviewer" } }));
    expect(container.querySelector("h1")?.textContent).toBe("Applications queue");
    await render(route, { ...loading, sessionReady: true, sessionToken: "token" });
    expect(path()).toBe(route);
    expect(container.querySelector("h1")).toBeNull();

    await render(route, auth({ isAuthenticated: false, sessionToken: null, staff: null }));
    expect(path()).toBe(ADMIN_ROUTES.login);
    expect(container.querySelector("output")?.getAttribute("data-state")).toBe("null");
  });

  it("restores a signed-out visitor's full deep link after login", async () => {
    const route = "/admin/scan/points?event=event-1#scan";
    await render(route, auth({ isAuthenticated: false, sessionToken: null, staff: null }));
    expect(path()).toBe(ADMIN_ROUTES.login);
    expect(JSON.parse(container.querySelector("output")!.getAttribute("data-state")!)).toMatchObject({
      from: { pathname: ADMIN_ROUTES.scanPoints, search: "?event=event-1", hash: "#scan" },
    });

    await render(ADMIN_ROUTES.login);
    expect(path()).toBe(route);
    expect(container.querySelector("h1")?.textContent).toBe("Event points");
  });

  it("fails closed when a profile is missing despite an authenticated flag", async () => {
    await render(ADMIN_ROUTES.participants, auth({ staff: null }));
    expect(path()).toBe(ADMIN_ROUTES.login);
    expect(container.textContent).not.toContain("Coming soon");
  });

  it("preserves an authorized intended destination on login", async () => {
    await render({ pathname: ADMIN_ROUTES.login, state: { from: { pathname: ADMIN_ROUTES.scanPoints, search: "?event=event-1" } } });
    expect(path()).toBe("/admin/scan/points?event=event-1");
  });

  it("discards intended destinations that have lost access", async () => {
    options = { ...allOptions, events: [] };
    await render({ pathname: ADMIN_ROUTES.login, state: { from: { pathname: ADMIN_ROUTES.scanPoints } } });
    expect(path()).toBe(ADMIN_ROUTES.scan);
  });

  it("supports back and forward across permitted scan entry points", async () => {
    await render(ADMIN_ROUTES.scan);
    await click('nav a[href="/admin/scan/check-in"]');
    expect(path()).toBe(ADMIN_ROUTES.scanCheckIn);
    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Back")!.click());
    expect(path()).toBe(ADMIN_ROUTES.scan);
    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Forward")!.click());
    expect(path()).toBe(ADMIN_ROUTES.scanCheckIn);
  });

  it("labels each assigned event's reference schedule and keeps its points link", async () => {
    options = { ...allOptions, events: [
      { ...event, startsAt: Date.now() + 60_000, endsAt: Date.now() + 120_000 },
      { ...event, eventId: "past" as GenericId<"events">, name: "Past workshop", startsAt: Date.now() - 120_000, endsAt: Date.now() - 60_000 },
    ] };
    await render(ADMIN_ROUTES.scan);
    expect(container.textContent).toContain("Upcoming");
    expect(container.textContent).toContain("Ended");
    expect(container.querySelector('a[href="/admin/scan/points?event=past"]')).not.toBeNull();
  });
});
