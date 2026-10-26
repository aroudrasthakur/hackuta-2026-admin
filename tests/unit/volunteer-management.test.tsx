// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAuthContext, type AdminAuthContextValue } from "../../src/contexts/adminAuthContext";
import {
  createEventRef,
  getVolunteerRef,
  listEventsRef,
  listStaffConfigLogsRef,
  listVolunteerActionLogsRef,
  listVolunteersRef,
  restoreVolunteerRef,
  revokeVolunteerRef,
  setEventActiveRef,
  setEventPointsRef,
  setVolunteerCapabilitiesRef,
  setVolunteerEventAccessRef,
  updateEventRef,
  type AdminEventRow,
  type StaffConfigLogRow,
  type VolunteerActionLogRow,
  type VolunteerRow,
} from "../../src/convex/adminApi";
import {
  formatPointsDelta,
  fromDateTimeInputValue,
  toDateTimeInputValue,
  volunteerPermissions,
} from "../../src/lib/staffLogFormat";
import { EventsPage } from "../../src/pages/admin/EventsPage";
import { VolunteerDetailPage } from "../../src/pages/admin/VolunteerDetailPage";
import { VolunteersPage } from "../../src/pages/admin/VolunteersPage";
import { ADMIN_ERROR_MESSAGES, adminError } from "../../shared/admin/errors";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  paginatedQuery: vi.fn(),
  useMutation: vi.fn(),
  mutations: new Map<unknown, ReturnType<typeof vi.fn>>(),
  loadMore: vi.fn(),
}));

vi.mock("../../src/convex/reactBindings", () => ({
  useQuery: mocks.query,
  usePaginatedQuery: mocks.paginatedQuery,
  useMutation: mocks.useMutation,
}));
vi.mock("../../shared/admin/logAdminError", () => ({ logAdminError: vi.fn() }));

type Id<T extends string> = import("convex/values").GenericId<T>;
const volunteerId = "volunteer-1" as Id<"admins">;
const workshopId = "event-workshop" as Id<"events">;
const panelId = "event-panel" as Id<"events">;
const START = new Date(2026, 9, 25, 10, 0).getTime();

function volunteer(overrides: Partial<VolunteerRow> = {}): VolunteerRow {
  return {
    adminId: volunteerId,
    name: "Val Volunteer",
    email: "val@example.com",
    active: true,
    participant: null,
    canCheckIn: true,
    canFoodCheckIn: false,
    events: [{ eventId: workshopId, name: "Workshop", active: true }],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function event(overrides: Partial<AdminEventRow> = {}): AdminEventRow {
  return {
    eventId: workshopId,
    name: "Workshop",
    description: null,
    pointsAwarded: 25,
    startsAt: START,
    endsAt: START + 3_600_000,
    active: true,
    pointsLocked: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function actionLog(overrides: Partial<VolunteerActionLogRow> = {}): VolunteerActionLogRow {
  return {
    logId: "log-1" as VolunteerActionLogRow["logId"],
    actor: { adminId: volunteerId, name: "Val Volunteer" },
    action: "point_scan",
    participant: { participantId: "participant-1" as Id<"participants">, name: "Riley Ready" },
    event: { eventId: workshopId, name: "Workshop" },
    pointsDelta: 25,
    reason: null,
    createdAt: START,
    ...overrides,
  } as VolunteerActionLogRow;
}

function configLog(overrides: Partial<StaffConfigLogRow> = {}): StaffConfigLogRow {
  return {
    logId: "config-1" as StaffConfigLogRow["logId"],
    actor: { adminId: "admin-1" as Id<"admins">, name: "Ada Admin" },
    action: "volunteer_event_access_updated",
    target: { adminId: volunteerId, name: "Val Volunteer" },
    event: null,
    participant: null,
    details: { addedEventIds: [panelId], removedEventIds: [] },
    createdAt: START,
    ...overrides,
  } as StaffConfigLogRow;
}

const adminAuth: AdminAuthContextValue = {
  sessionToken: "session-token",
  staff: { adminId: "admin-1", email: "admin@example.com", name: "Ada Admin", role: "admin", expiresAt: Date.now() + 60_000 },
  authError: null,
  isLoading: false,
  isAuthenticated: true,
  sessionReady: true,
  signIn: vi.fn(),
  signOut: vi.fn(),
};

let container: HTMLDivElement;
let root: Root;
let currentVolunteer: VolunteerRow | null | undefined;
let currentEvents: AdminEventRow[] | undefined;
let paginated: Map<unknown, { results: unknown[]; status: string }>;

function mutation(ref: unknown, implementation: (...args: never[]) => unknown = async () => ({ ok: true })) {
  const fn = vi.fn(implementation);
  mocks.mutations.set(ref, fn);
  return fn;
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  currentVolunteer = volunteer();
  currentEvents = [event(), event({ eventId: panelId, name: "Panel", pointsAwarded: 10, active: false, pointsLocked: true })];
  paginated = new Map([
    [listVolunteersRef, { results: [volunteer()], status: "Exhausted" }],
    [listVolunteerActionLogsRef, { results: [actionLog()], status: "Exhausted" }],
    [listStaffConfigLogsRef, { results: [configLog()], status: "Exhausted" }],
  ]);
  vi.spyOn(Date, "now").mockReturnValue(START + 60_000);
  mocks.query.mockReset().mockImplementation((ref) => {
    if (ref === getVolunteerRef) return currentVolunteer;
    throw new Error("Unexpected query reference");
  });
  mocks.paginatedQuery.mockReset().mockImplementation((ref) => ({
    ...(ref === listEventsRef && !paginated.has(ref)
      ? { results: currentEvents ?? [], status: currentEvents ? "Exhausted" : "LoadingFirstPage" }
      : paginated.get(ref)),
    loadMore: mocks.loadMore,
  }));
  mocks.loadMore.mockReset();
  mocks.mutations.clear();
  mocks.useMutation.mockReset().mockImplementation((ref) => mocks.mutations.get(ref) ?? vi.fn(async () => ({ ok: true })));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function render(node: ReactNode, path = "/", auth = adminAuth) {
  await act(async () => root.render(
    <MemoryRouter initialEntries={[path]}>
      <AdminAuthContext.Provider value={auth}>{node}</AdminAuthContext.Provider>
    </MemoryRouter>,
  ));
}

const renderDetail = (auth = adminAuth) => render(
  <Routes><Route path="/admin/volunteers/:volunteerAdminId" element={<VolunteerDetailPage />} /></Routes>,
  `/admin/volunteers/${volunteerId}`,
  auth,
);

const text = () => container.textContent ?? "";
const button = (name: string) => Array.from(container.querySelectorAll("button")).find((element) => element.textContent?.trim() === name);

async function click(name: string) {
  const element = button(name);
  if (!element) throw new Error(`Missing button ${name}`);
  await act(async () => element.click());
}

function field(label: string) {
  const element = Array.from(container.querySelectorAll("label")).find((candidate) => candidate.textContent?.includes(label))
    ?.querySelector("input, textarea, select") as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | undefined;
  if (!element) throw new Error(`Missing field ${label}`);
  return element;
}

async function fill(label: string, value: string) {
  const element = field(label);
  await act(async () => {
    const prototype = Object.getPrototypeOf(element) as object;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function toggle(label: string) {
  await act(async () => (field(label) as HTMLInputElement).click());
}

async function submit(form: Element | null) {
  if (!form) throw new Error("Missing form");
  await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}

describe("log formatting", () => {
  it("summarizes permissions and point changes", () => {
    expect(volunteerPermissions({ canCheckIn: true, canFoodCheckIn: true })).toBe("Check-in, Food");
    expect(volunteerPermissions({ canCheckIn: false, canFoodCheckIn: false })).toBe("None");
    expect(formatPointsDelta(5)).toBe("+5");
    expect(formatPointsDelta(-3)).toBe("-3");
    expect(formatPointsDelta(null)).toBe("—");
  });

  it("round-trips datetime-local values and rejects blanks", () => {
    expect(toDateTimeInputValue(START)).toBe("2026-10-25T10:00");
    expect(fromDateTimeInputValue("2026-10-25T10:00")).toBe(START);
    expect(fromDateTimeInputValue("")).toBeNull();
    expect(fromDateTimeInputValue("not a date")).toBeNull();
  });
});

describe("VolunteersPage", () => {
  it("lists every volunteer with links to their own page and the shared activity log", async () => {
    paginated.set(listVolunteersRef, {
      results: [volunteer(), volunteer({ adminId: "volunteer-2" as Id<"admins">, name: "Rey Revoked", active: false, canCheckIn: false, events: [] })],
      status: "CanLoadMore",
    });
    await render(<VolunteersPage />);
    const rows = Array.from(container.querySelectorAll("table"))[0]!.querySelectorAll("tbody tr");
    expect(Array.from(rows, (row) => row.textContent)).toEqual([
      "Val Volunteerval@example.comActiveCheck-inWorkshop",
      "Rey Revokedval@example.comRevokedNoneNone",
    ]);
    expect(container.querySelector(`a[href="/admin/volunteers/${volunteerId}"]`)?.textContent).toBe("Val Volunteer");
    expect(text()).toContain("Activity log");
    expect(text()).toContain("Riley Ready");
    expect(text()).toContain("+25");
    await click("Load more volunteers");
    expect(mocks.loadMore).toHaveBeenCalledWith(25);
  });

  it("explains how to add the first volunteer and shows loading states", async () => {
    paginated.set(listVolunteersRef, { results: [], status: "Exhausted" });
    paginated.set(listVolunteerActionLogsRef, { results: [], status: "LoadingFirstPage" });
    await render(<VolunteersPage />);
    expect(text()).toContain("No volunteers yet");
    expect(text()).toContain("Loading activity…");
  });

  it("waits for administrator access before querying", async () => {
    await render(<VolunteersPage />, "/", { ...adminAuth, staff: { ...adminAuth.staff!, role: "reviewer" } });
    expect(text()).toContain("Verifying administrator access…");
    expect(mocks.paginatedQuery).not.toHaveBeenCalled();
  });
});

describe("VolunteerActivityLog", () => {
  it("filters by action and links staff except for admin adjustments", async () => {
    paginated.set(listVolunteerActionLogsRef, {
      results: [
        actionLog(),
        actionLog({ logId: "log-2" as VolunteerActionLogRow["logId"], action: "admin_adjust", actor: { adminId: "admin-1" as Id<"admins">, name: "Ada Admin" }, event: null, pointsDelta: -5, reason: "Duplicate" }),
      ],
      status: "LoadingMore",
    });
    await render(<VolunteersPage />);
    expect(text()).toContain("Reason: Duplicate");
    expect(text()).toContain("-5");
    expect(Array.from(container.querySelectorAll("a"), (link) => link.textContent)).not.toContain("Ada Admin");
    expect(button("Loading activity…")?.disabled).toBe(true);

    await fill("Action", "check_in");
    expect(mocks.paginatedQuery).toHaveBeenLastCalledWith(listVolunteerActionLogsRef, { sessionToken: "session-token", action: "check_in" }, { initialNumItems: 25 });
    paginated.set(listVolunteerActionLogsRef, { results: [], status: "Exhausted" });
    await fill("Action", "food_check_in");
    expect(text()).toContain("No activity matches this action.");
  });
});

describe("VolunteerDetailPage", () => {
  it("shows the volunteer's own log, history, and summary", async () => {
    await renderDetail();
    expect(container.querySelector("h1")?.textContent).toBe("Val Volunteer");
    expect(text()).toContain("Val Volunteer's activity");
    expect(mocks.paginatedQuery).toHaveBeenCalledWith(
      listVolunteerActionLogsRef, { sessionToken: "session-token", volunteerAdminId: volunteerId }, { initialNumItems: 25 },
    );
    expect(mocks.paginatedQuery).toHaveBeenCalledWith(
      listStaffConfigLogsRef, { sessionToken: "session-token", targetAdminId: volunteerId }, { initialNumItems: 10 },
    );
    expect(text()).toContain("Event assignments changed by Ada Admin · 1 added, 0 removed");
    expect(Array.from(container.querySelectorAll("thead th"), (cell) => cell.textContent)).not.toContain("Staff");
  });

  it("assigns and unassigns events", async () => {
    const save = mutation(setVolunteerEventAccessRef, async () => ({ ok: true, added: 1, removed: 1 }));
    await renderDetail();
    expect(button("Save event assignments")?.disabled).toBe(true);
    expect(field("Workshop").closest("label")?.textContent).toBe("Workshop · 25 pointsActive");
    expect(field("Panel").closest("label")?.textContent).toBe("Panel · 10 pointsSwitched off");
    await toggle("Panel");
    await toggle("Workshop");
    await submit(container.querySelector('form[aria-labelledby="volunteer-events-heading"]'));
    expect(save).toHaveBeenCalledWith({ sessionToken: "session-token", volunteerAdminId: volunteerId, eventIds: [panelId] });
    currentVolunteer = volunteer({ events: [{ eventId: panelId, name: "Panel", active: false }] });
    await renderDetail();
    expect(text()).toContain("Event assignments saved (1 added, 1 removed).");
    expect((field("Panel") as HTMLInputElement).checked).toBe(true);
    expect(button("Save event assignments")?.disabled).toBe(true);
  });

  it("reports assignment failures and links to Events when none exist", async () => {
    mutation(setVolunteerEventAccessRef, async () => { throw adminError("ACCOUNT_INACTIVE"); });
    await renderDetail();
    await toggle("Panel");
    await submit(container.querySelector('form[aria-labelledby="volunteer-events-heading"]'));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(ADMIN_ERROR_MESSAGES.ACCOUNT_INACTIVE);

    currentEvents = [];
    currentVolunteer = volunteer({ active: false, events: [] });
    await renderDetail();
    expect(container.querySelector('a[href="/admin/events"]')?.textContent).toBe("Create an event");
    expect(text()).toContain("Restore this volunteer's access before assigning new events.");
  });

  it("saves scan permissions and reports failures", async () => {
    const save = mutation(setVolunteerCapabilitiesRef, async () => ({ ok: true, changed: true }));
    await renderDetail();
    await toggle("Can redeem participant food");
    await submit(container.querySelector('form[aria-labelledby="volunteer-permissions-heading"]'));
    expect(save).toHaveBeenCalledWith({ sessionToken: "session-token", volunteerAdminId: volunteerId, canCheckIn: true, canFoodCheckIn: true });
    currentVolunteer = volunteer({ canFoodCheckIn: true });
    await renderDetail();
    expect(text()).toContain("Scan permissions saved.");

    save.mockRejectedValueOnce(new Error("offline"));
    await toggle("Can check participants in");
    await submit(container.querySelector('form[aria-labelledby="volunteer-permissions-heading"]'));
    expect(text()).toContain("Scan permissions were not changed. Please try again.");
  });

  it("revokes after confirmation and restores", async () => {
    const revoke = mutation(revokeVolunteerRef);
    const restore = mutation(restoreVolunteerRef);
    await renderDetail();
    await click("Revoke volunteer access");
    await click("Cancel");
    expect(revoke).not.toHaveBeenCalled();
    await click("Revoke volunteer access");
    await click("Confirm revoke");
    expect(revoke).toHaveBeenCalledWith({ sessionToken: "session-token", volunteerAdminId: volunteerId });
    currentVolunteer = volunteer({ active: false });
    await renderDetail();
    expect(text()).toContain("Access revoked and the volunteer was signed out.");
    restore.mockRejectedValueOnce(new Error("offline"));
    await click("Restore volunteer access");
    expect(text()).toContain("Volunteer access was not changed.");
    await click("Restore volunteer access");
    expect(text()).toContain("Access restored. The volunteer must sign in again.");
  });

  it("summarizes permission history and paginates it", async () => {
    paginated.set(listStaffConfigLogsRef, {
      results: [
        configLog({ action: "volunteer_capabilities_updated", details: { after: { canCheckIn: false, canFoodCheckIn: true } } }),
        configLog({ logId: "config-2" as StaffConfigLogRow["logId"], action: "volunteer_revoked", details: null }),
      ],
      status: "CanLoadMore",
    });
    await renderDetail();
    expect(text()).toContain("Scan permissions changed by Ada Admin · Now: Food");
    expect(text()).toContain("Access revoked by Ada Admin");
    await click("Load more history");
    expect(mocks.loadMore).toHaveBeenCalledWith(10);
  });

  it("handles loading, missing volunteers, empty history, and non-admins", async () => {
    currentVolunteer = undefined;
    await renderDetail();
    expect(text()).toContain("Loading volunteer…");

    currentVolunteer = null;
    await renderDetail();
    expect(text()).toContain("Volunteer not found");

    currentVolunteer = volunteer();
    paginated.set(listStaffConfigLogsRef, { results: [], status: "Exhausted" });
    await renderDetail();
    expect(text()).toContain("No account changes recorded yet.");

    mocks.query.mockClear();
    await renderDetail({ ...adminAuth, sessionToken: null });
    expect(text()).toContain("Verifying administrator access…");
    expect(mocks.query).not.toHaveBeenCalled();
  });
});

describe("EventsPage", () => {
  const formOf = (heading: string) => Array.from(container.querySelectorAll("form"))
    .find((form) => form.closest("section, li")?.querySelector("h2")?.textContent === heading) ?? null;

  it("lists events with status, schedule, and points, and pages through them", async () => {
    paginated.set(listEventsRef, {
      results: [
        event({ description: "Intro to Convex" }),
        event({ eventId: panelId, name: "Panel", active: false }),
        event({ eventId: "event-later" as Id<"events">, name: "Later", startsAt: START + 3_600_000, endsAt: START + 7_200_000 }),
        event({ eventId: "event-past" as Id<"events">, name: "Past", startsAt: START - 7_200_000, endsAt: START }),
      ],
      status: "CanLoadMore",
    });
    await render(<EventsPage />);
    expect(mocks.paginatedQuery).toHaveBeenCalledWith(listEventsRef, { sessionToken: "session-token" }, { initialNumItems: 25 });
    const items = Array.from(container.querySelectorAll('ul[aria-label="Events"] > li'));
    expect(items).toHaveLength(4);
    expect(items[0]!.textContent).toContain("Intro to Convex");
    expect(items[0]!.textContent).toContain("25 points");
    expect(items[0]!.textContent).toContain("Active");
    expect(items[1]!.textContent).toContain("Switched off");
    expect(items[2]!.textContent).toContain("Upcoming");
    expect(items[3]!.textContent).toContain("Ended");
    await click("Load more events");
    expect(mocks.loadMore).toHaveBeenCalledWith(25);
  });

  it("validates and creates an event", async () => {
    const create = mutation(createEventRef, async () => ({ ok: true, eventId: "event-new" }));
    await render(<EventsPage />);
    await click("Add event");
    const form = () => formOf("Add event");

    await submit(form());
    expect(text()).toContain("Enter an event name.");
    await fill("Event name", "  Opening ceremony ");
    await fill("Points per participant", "0");
    await submit(form());
    expect(text()).toContain("Points must be a whole number from 1 to 100,000.");
    await fill("Points per participant", "100001");
    await submit(form());
    expect(text()).toContain("Points must be a whole number from 1 to 100,000.");
    await fill("Event name", "n".repeat(121));
    await fill("Points per participant", "15");
    await submit(form());
    expect(text()).toContain("Keep the event name under 120 characters.");
    await fill("Event name", "  Opening ceremony ");
    await fill("Description (optional)", "d".repeat(2_001));
    await submit(form());
    expect(text()).toContain("Keep the description under 2000 characters.");
    await fill("Description (optional)", "");
    await fill("Points per participant", "15");
    await submit(form());
    expect(text()).toContain("Enter a start and end time.");
    await fill("Starts", "2026-10-25T12:00");
    await fill("Ends", "2026-10-25T11:00");
    await submit(form());
    expect(text()).toContain("The event must end after it starts.");
    expect(create).not.toHaveBeenCalled();

    await fill("Ends", "2026-10-25T13:00");
    await submit(form());
    expect(create).toHaveBeenCalledWith({
      sessionToken: "session-token",
      name: "Opening ceremony",
      pointsAwarded: 15,
      startsAt: new Date(2026, 9, 25, 12, 0).getTime(),
      endsAt: new Date(2026, 9, 25, 13, 0).getTime(),
    });
    expect(text()).toContain("“Opening ceremony” was created and switched on.");
    expect(formOf("Add event")).toBeNull();
  });

  it("keeps the form open with the server message when creation fails", async () => {
    mutation(createEventRef, async () => { throw adminError("INVALID_EVENT"); });
    await render(<EventsPage />);
    await click("Add event");
    await fill("Event name", "Hack");
    await fill("Description (optional)", "Details");
    await fill("Points per participant", "5");
    await fill("Starts", "2026-10-25T12:00");
    await fill("Ends", "2026-10-25T13:00");
    await submit(formOf("Add event"));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(ADMIN_ERROR_MESSAGES.INVALID_EVENT);
    await click("Cancel");
    expect(formOf("Add event")).toBeNull();
  });

  it("edits the schedule separately from points and locks points once awarded", async () => {
    const update = mutation(updateEventRef, async () => ({ ok: true, changed: true }));
    const setPoints = mutation(setEventPointsRef, async () => ({ ok: true, changed: true }));
    await render(<EventsPage />);
    await click("Edit Panel");
    expect((field("Points per participant") as HTMLInputElement).disabled).toBe(true);
    expect(text()).toContain("Points are locked because participants have already received them.");
    await click("Cancel");

    await click("Edit Workshop");
    expect(field("Event name").value).toBe("Workshop");
    expect(field("Starts").value).toBe("2026-10-25T10:00");
    await fill("Event name", "Workshop II");
    await submit(formOf("Edit Workshop"));
    expect(setPoints).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      sessionToken: "session-token",
      eventId: workshopId,
      name: "Workshop II",
      startsAt: START,
      endsAt: START + 3_600_000,
    });
    expect(text()).toContain("“Workshop II” was updated.");

    await click("Edit Workshop");
    await fill("Points per participant", "40");
    await submit(formOf("Edit Workshop"));
    expect(setPoints).toHaveBeenCalledWith({ sessionToken: "session-token", eventId: workshopId, pointsAwarded: 40 });
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("shows update failures inside the edit form and skips the schedule when points are locked", async () => {
    const update = mutation(updateEventRef, async () => { throw adminError("INVALID_EVENT"); });
    mutation(setEventPointsRef, async () => { throw adminError("EVENT_POINTS_LOCKED"); });
    await render(<EventsPage />);
    await click("Edit Workshop");
    await submit(formOf("Edit Workshop"));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(ADMIN_ERROR_MESSAGES.INVALID_EVENT);

    update.mockClear();
    await fill("Points per participant", "40");
    await submit(formOf("Edit Workshop"));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(ADMIN_ERROR_MESSAGES.EVENT_POINTS_LOCKED);
    expect(update).not.toHaveBeenCalled();
  });

  it("switches events off and on", async () => {
    const setActive = mutation(setEventActiveRef, async () => ({ ok: true, changed: true }));
    await render(<EventsPage />);
    await click("Switch off Workshop");
    expect(setActive).toHaveBeenCalledWith({ sessionToken: "session-token", eventId: workshopId, active: false });
    expect(text()).toContain("“Workshop” is switched off. Volunteers can no longer award its points.");
    await click("Switch on Panel");
    expect(setActive).toHaveBeenLastCalledWith({ sessionToken: "session-token", eventId: panelId, active: true });
    expect(text()).toContain("“Panel” is switched on. Points can be awarded during its scheduled time.");

    setActive.mockRejectedValueOnce(new Error("offline"));
    await click("Switch off Workshop");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("The event status was not changed. Please try again.");
  });

  it("shows loading, empty, and access states", async () => {
    currentEvents = undefined;
    await render(<EventsPage />);
    expect(text()).toContain("Loading events…");
    currentEvents = [];
    await render(<EventsPage />);
    expect(text()).toContain("No events yet");
    mocks.paginatedQuery.mockClear();
    await render(<EventsPage />, "/", { ...adminAuth, staff: null });
    expect(text()).toContain("Verifying administrator access…");
    expect(mocks.paginatedQuery).not.toHaveBeenCalled();
  });
});
