// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAuthContext, type AdminAuthContextValue } from "../../src/contexts/adminAuthContext";
import {
  assignParticipantBadgeRef,
  getParticipantDetailsRef,
  listParticipantsRef,
  promoteParticipantToVolunteerRef,
  restoreVolunteerRef,
  revokeVolunteerRef,
  setParticipantPointsRef,
  type ParticipantDetails,
  type ParticipantRow,
} from "../../src/convex/adminApi";
import { ParticipantsPage } from "../../src/pages/admin/ParticipantsPage";
import { adminError } from "../../shared/admin/errors";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  paginatedQuery: vi.fn(),
  useMutation: vi.fn(),
  setPoints: vi.fn(),
  promote: vi.fn(),
  revoke: vi.fn(),
  restore: vi.fn(),
  assignBadge: vi.fn(),
  loadMore: vi.fn(),
}));

vi.mock("../../src/convex/reactBindings", () => ({
  useQuery: mocks.query,
  usePaginatedQuery: mocks.paginatedQuery,
  useMutation: mocks.useMutation,
}));

const row: ParticipantRow = {
  participantId: "participant-1" as ParticipantRow["participantId"],
  name: "Alex Accepted",
  email: "alex@example.com",
  points: 20,
  checkedInAt: null,
  foodCheckedInAt: null,
  badgeAssigned: false,
  volunteer: null,
};

function detail(overrides: Partial<ParticipantDetails> = {}): ParticipantDetails {
  return {
    participantId: row.participantId,
    name: row.name,
    email: row.email,
    acceptedAt: 100,
    points: 20,
    ledgerPoints: 20,
    pointsConsistent: true,
    checkedInAt: null,
    foodCheckedInAt: null,
    awards: [],
    badge: null,
    volunteer: null,
    ...overrides,
  };
}

const adminAuth: AdminAuthContextValue = {
  sessionToken: "session-token",
  staff: {
    adminId: "admin-1",
    email: "admin@example.com",
    name: "Admin",
    role: "admin",
    expiresAt: Date.now() + 60_000,
  },
  authError: null,
  isLoading: false,
  isAuthenticated: true,
  sessionReady: true,
  signIn: vi.fn().mockResolvedValue(undefined),
  signOut: vi.fn().mockResolvedValue(undefined),
};

let container: HTMLDivElement;
let root: Root;
let currentDetails: ParticipantDetails | null;
let currentRows: ParticipantRow[];
let paginationStatus: string;
let queryFailure: boolean;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  currentDetails = detail();
  currentRows = [row];
  paginationStatus = "Exhausted";
  queryFailure = false;
  mocks.query.mockReset().mockImplementation((ref, args) => {
    if (queryFailure && ref === getParticipantDetailsRef) throw new Error("details unavailable");
    if (ref === getParticipantDetailsRef && args !== "skip") return currentDetails;
    return undefined;
  });
  mocks.paginatedQuery.mockReset().mockImplementation(() => ({
    results: currentRows,
    status: paginationStatus,
    loadMore: mocks.loadMore,
  }));
  mocks.loadMore.mockReset();
  mocks.setPoints.mockReset().mockImplementation(async ({ points }: { points: number }) => {
    const previousPoints = currentDetails?.points ?? 0;
    currentDetails = currentDetails ? { ...currentDetails, points, ledgerPoints: points } : null;
    return {
      ok: true as const,
      changed: points !== previousPoints,
      previousPoints,
      newPoints: points,
      pointsDelta: points - previousPoints,
    };
  });
  mocks.promote.mockReset().mockImplementation(async () => ({
    ok: true as const,
    adminId: "volunteer-1" as never,
    email: "alex.staff@example.com",
  }));
  mocks.revoke.mockReset().mockResolvedValue({ ok: true });
  mocks.restore.mockReset().mockResolvedValue({ ok: true });
  mocks.assignBadge.mockReset().mockResolvedValue({ ok: true, replaced: true, assignedAt: 2 });
  mocks.useMutation.mockReset().mockImplementation((ref) => {
    if (ref === setParticipantPointsRef) return mocks.setPoints;
    if (ref === promoteParticipantToVolunteerRef) return mocks.promote;
    if (ref === revokeVolunteerRef) return mocks.revoke;
    if (ref === restoreVolunteerRef) return mocks.restore;
    if (ref === assignParticipantBadgeRef) return mocks.assignBadge;
    throw new Error("Unexpected mutation reference");
  });
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function render(node: ReactNode = (
  <MemoryRouter>
    <AdminAuthContext.Provider value={adminAuth}>
      <ParticipantsPage />
    </AdminAuthContext.Provider>
  </MemoryRouter>
)) {
  await act(async () => root.render(node));
}

function button(name: string) {
  return Array.from(container.querySelectorAll("button")).find((element) => element.textContent?.trim() === name);
}

function field(label: string) {
  const labels = Array.from(container.querySelectorAll("label"));
  const parent = labels.find((element) => element.textContent?.includes(label));
  const target = parent?.htmlFor ? container.querySelector(`[id="${parent.htmlFor}"]`) : parent?.querySelector("input, textarea, select");
  return target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | undefined;
}

async function click(name: string) {
  await act(async () => button(name)?.click());
}

async function fill(label: string, value: string) {
  const element = field(label);
  if (!element) throw new Error(`Missing field ${label}`);
  await act(async () => {
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function submit() {
  const form = container.querySelector("dialog form");
  if (!form) throw new Error("Expected a dialog form");
  await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}

async function openDetails() {
  await click("Alex Accepted");
  expect(container.querySelector("dialog[open]")).not.toBeNull();
}

describe("ParticipantsPage", () => {
  it("shows loading, empty, filtered-empty, and next-page roster states", async () => {
    paginationStatus = "LoadingFirstPage";
    currentRows = [];
    await render();
    expect(container.textContent).toContain("Loading participants");

    paginationStatus = "Exhausted";
    await render();
    expect(container.textContent).toContain("No participants yet");

    await fill("Search name or email", "nobody");
    await render();
    expect(container.textContent).toContain("No search results");

    paginationStatus = "CanLoadMore";
    await render();
    expect(container.textContent).toContain("No matches in the roster pages loaded");
    await click("Load more participants");
    expect(mocks.loadMore).toHaveBeenCalledWith(25);
  });

  it("passes search and each status filter to the backend paginator and clears them", async () => {
    await render();
    expect(mocks.paginatedQuery).toHaveBeenLastCalledWith(
      listParticipantsRef,
      { sessionToken: "session-token", search: "" },
      { initialNumItems: 25 },
    );
    await fill("Search name or email", "alex");
    const selects = container.querySelectorAll("select");
    await act(async () => {
      for (const [select, value] of [
        [selects[0], "checked"],
        [selects[1], "redeemed"],
        [selects[2], "active"],
      ] as const) {
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, value);
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    expect(mocks.paginatedQuery).toHaveBeenLastCalledWith(
      listParticipantsRef,
      {
        sessionToken: "session-token",
        search: "alex",
        checkedIn: true,
        foodRedeemed: true,
        volunteerStatus: "active",
      },
      { initialNumItems: 25 },
    );
    await click("Clear filters");
    expect((field("Search name or email") as HTMLInputElement).value).toBe("");
    expect(Array.from(container.querySelectorAll("select")).every((select) => select.value === "all")).toBe(true);
  });

  it("opens details, presents timestamps and awards, and restores focus on close", async () => {
    currentDetails = detail({
      checkedInAt: 1_735_689_600_000,
      foodCheckedInAt: 1_735_693_200_000,
      awards: [{
        eventId: "event-1" as ParticipantDetails["awards"][number]["eventId"],
        eventName: "Opening",
        pointsAwarded: 10,
        awardedAt: 1_735_689_600_000,
        awardedBy: {
          adminId: "admin-2" as ParticipantDetails["awards"][number]["awardedBy"]["adminId"],
          name: "Organizer",
        },
      }],
    });
    await render();
    const trigger = button("Alex Accepted")!;
    await openDetails();
    expect(container.textContent).toContain("Current points");
    expect(container.textContent).toContain("Opening · +10");
    expect(container.querySelectorAll("time")).toHaveLength(3);
    await click("Close");
    expect(container.querySelector("dialog[open]")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("replaces a badge with a reason without ever showing badge values", async () => {
    currentDetails = detail({
      checkedInAt: 1_735_689_600_000,
      badge: { assignedAt: 1_735_689_700_000, assignedBy: { adminId: "admin-2" as never, name: "Desk Volunteer" } },
    });
    await render();
    await openDetails();
    expect(container.textContent).toContain("by Desk Volunteer");
    await click("Replace badge");
    expect(container.textContent).toContain("current badge stops working immediately");
    await fill("Or enter the badge code", " HACKUTA-BADGE-0777 ");
    await click("Look up badge");
    expect(container.textContent).toContain("New badge scanned");
    expect(container.textContent).not.toContain("HACKUTA-BADGE-0777");

    await fill("Reason", "   ");
    await click("Confirm badge replacement");
    expect(mocks.assignBadge).not.toHaveBeenCalled();
    await fill("Reason", " Badge lost ");
    await click("Confirm badge replacement");
    expect(mocks.assignBadge).toHaveBeenCalledWith({
      sessionToken: "session-token",
      participantId: row.participantId,
      badgeQrCodeToken: " HACKUTA-BADGE-0777 ",
      reason: "Badge lost",
      expectedBadgeAssignedAt: 1_735_689_700_000,
    });
    expect(container.textContent).toContain("Badge replaced.");
    expect(container.textContent).toContain("old badge no longer works");
  });

  it("asks for the badge again when the server rejects it", async () => {
    currentDetails = detail({ checkedInAt: 5 });
    mocks.assignBadge.mockRejectedValueOnce(adminError("BADGE_IN_USE"));
    await render();
    await openDetails();
    expect(container.textContent).toContain("Checked in without a badge");
    await click("Assign badge");
    await fill("Or enter the badge code", "HACKUTA-BADGE-0002");
    await click("Look up badge");
    await fill("Reason", "Checked in before badges");
    await click("Confirm badge assignment");
    expect(mocks.assignBadge).toHaveBeenCalledWith(expect.objectContaining({ expectedBadgeAssignedAt: null }));
    expect(container.querySelector('[role="alert"]')?.textContent).toBeTruthy();
    expect(button("Look up badge")).toBeDefined();
  });

  it("offers no badge change before check-in", async () => {
    await render();
    await openDetails();
    expect(container.textContent).toContain("A badge is assigned at the check-in desk");
    expect(button("Assign badge")).toBeUndefined();
    expect(button("Replace badge")).toBeUndefined();
  });

  it("validates point balances and reasons without submitting invalid values", async () => {
    await render();
    await openDetails();
    await click("Edit Points");
    const target = field("New target balance") as HTMLInputElement;
    await fill("New target balance", "-1");
    await fill("Adjustment reason", "   ");
    await submit();
    expect(container.textContent).toContain("nonnegative whole-number balance");
    expect(mocks.setPoints).not.toHaveBeenCalled();

    await fill("New target balance", "21");
    await fill("Adjustment reason", "   ");
    await submit();
    expect(container.textContent).toContain("Enter a reason");
    expect(mocks.setPoints).not.toHaveBeenCalled();

    await fill("Adjustment reason", "x".repeat(201));
    await submit();
    expect(container.textContent).toContain("200 characters or fewer");
    expect(mocks.setPoints).not.toHaveBeenCalled();
    expect(target.max).toBe(String(Number.MAX_SAFE_INTEGER));
  });

  it("commits points only on success and refreshes the balance", async () => {
    await render();
    await openDetails();
    await click("Edit Points");
    await fill("New target balance", "42");
    await fill("Adjustment reason", "Correction");
    await submit();
    expect(mocks.setPoints).toHaveBeenCalledWith({
      sessionToken: "session-token",
      participantId: row.participantId,
      points: 42,
      reason: "Correction",
    });
    expect(container.textContent).toContain("Points updated from 20 to 42");
    expect(container.textContent).toContain("42");

    await click("Edit Points");
    await fill("New target balance", "42");
    await fill("Adjustment reason", "No change");
    await submit();
    expect(container.textContent).toContain("no adjustment was needed");
  });

  it("surfaces failed point requests and does not change the visible balance", async () => {
    mocks.setPoints.mockRejectedValueOnce(adminError("INVALID_POINTS"));
    await render();
    await openDetails();
    await click("Edit Points");
    await fill("New target balance", "50");
    await fill("Adjustment reason", "Correction");
    await click("Confirm points adjustment");
    expect(container.textContent).toContain("That point change isn't allowed.");
    expect(container.textContent).toContain("20");
    expect(container.textContent).not.toContain("Points updated");
  });

  it("validates promotion password and creates a separate staff account", async () => {
    await render();
    await openDetails();
    await click("Promote to Volunteer");
    expect(container.textContent).toContain("separate from participant login credentials");
    await fill("Initial password", "weak");
    await submit();
    expect(container.textContent).toContain("Password must be at least 8 characters");
    expect(mocks.promote).not.toHaveBeenCalled();

    await fill("Initial password", "StaffPassword1");
    await fill("Staff account email", "alex.staff@example.com");
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(container.textContent).toContain("New volunteers start with no access.");
    await submit();
    expect(mocks.promote).toHaveBeenCalledWith({
      sessionToken: expect.any(String),
      participantId: row.participantId,
      email: "alex.staff@example.com",
      name: row.name,
      password: "StaffPassword1",
    });
    expect(container.textContent).toContain("Volunteer staff account created");
    expect(container.textContent).toContain("They start with no access");
  });

  it("reports a promotion email conflict and keeps the form available to correct", async () => {
    mocks.promote.mockRejectedValueOnce(adminError("STAFF_ACCOUNT_EXISTS"));
    await render();
    await openDetails();
    await click("Promote to Volunteer");
    await fill("Initial password", "StaffPassword1");
    await submit();
    expect(container.textContent).toContain("A staff account already uses that email or participant.");
    expect(field("Staff account email")).toBeDefined();
  });

  it("shows linked volunteer status, confirms revocation, and supports restoration", async () => {
    currentDetails = detail({
      volunteer: {
        adminId: "volunteer-1" as ParticipantDetails["volunteer"] extends infer V ? V extends { adminId: infer I } ? I : never : never,
        name: "Alex Accepted",
        email: "alex.staff@example.com",
        active: true,
        canCheckIn: true,
        canFoodCheckIn: false,
      },
    });
    await render();
    await openDetails();
    expect(container.textContent).toContain("Access: Check-in");
    expect(container.querySelector('a[href="/admin/volunteers/volunteer-1"]')?.textContent).toBe("Manage access");
    await click("Revoke volunteer access");
    expect(container.textContent).toContain("Revoke this account?");
    await click("Cancel");
    expect(mocks.revoke).not.toHaveBeenCalled();
    await click("Revoke volunteer access");
    await click("Confirm revoke");
    expect(mocks.revoke).toHaveBeenCalledWith({
      sessionToken: "session-token",
      volunteerAdminId: "volunteer-1",
    });
    expect(container.textContent).toContain("Volunteer access revoked");

    currentDetails = detail({
      volunteer: {
        adminId: "volunteer-1" as ParticipantDetails["volunteer"] extends infer V ? V extends { adminId: infer I } ? I : never : never,
        name: "Alex Accepted",
        email: "alex.staff@example.com",
        active: false,
        canCheckIn: false,
        canFoodCheckIn: false,
      },
    });
    await render();
    await click("Restore volunteer access");
    expect(mocks.restore).toHaveBeenCalledWith({
      sessionToken: "session-token",
      volunteerAdminId: "volunteer-1",
    });
  });

  it("does not allow point edits for a balance inconsistent with its ledger", async () => {
    currentDetails = detail({ pointsConsistent: false, ledgerPoints: 0 });
    await render();
    await openDetails();
    expect(container.textContent).toContain("stored balance does not match the point ledger");
    expect((button("Edit Points") as HTMLButtonElement).disabled).toBe(true);
  });

  it("handles missing participant details and retryable query errors", async () => {
    currentDetails = null;
    await render();
    await openDetails();
    expect(container.textContent).toContain("no longer available or is not accepted");
    await click("Close details");

    queryFailure = true;
    await render();
    expect(container.textContent).toContain("Participants could not be loaded");
    queryFailure = false;
    await click("Retry");
    expect(container.textContent).toContain("Participants");
  });

  it("keeps pending actions disabled until the request settles", async () => {
    let finish!: (result: { ok: true; changed: boolean; previousPoints: number; newPoints: number; pointsDelta: number }) => void;
    mocks.setPoints.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await render();
    await openDetails();
    await click("Edit Points");
    await fill("New target balance", "24");
    await fill("Adjustment reason", "Correction");
    await submit();
    expect((button("Saving…") as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.setPoints).toHaveBeenCalledOnce();
    await act(async () => finish({
      ok: true,
      changed: true,
      previousPoints: 20,
      newPoints: 24,
      pointsDelta: 4,
    }));
    expect(container.textContent).toContain("Points updated from 20 to 24");
  });
});
