// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAuthContext, type AdminAuthContextValue } from "../../src/contexts/adminAuthContext";
import {
  cancelNotificationRef,
  listNotificationsAdminRef,
  publishNotificationNowRef,
  saveNotificationDraftRef,
  scheduleNotificationRef,
  type AdminNotificationRow,
} from "../../src/convex/adminApi";
import { toDateTimeInput } from "../../src/lib/shopFormat";
import { NotificationsPage } from "../../src/pages/admin/NotificationsPage";

type Paginated = { results: AdminNotificationRow[]; status: string; loadMore: ReturnType<typeof vi.fn> };

const mocks = vi.hoisted(() => ({
  mutations: new Map<unknown, ReturnType<typeof vi.fn>>(),
  paginated: new Map<unknown, Paginated>(),
  queryArgs: new Map<unknown, unknown>(),
}));

vi.mock("../../src/convex/reactBindings", () => ({
  useQuery: () => undefined,
  useMutation: (ref: unknown) => {
    if (!mocks.mutations.has(ref)) mocks.mutations.set(ref, vi.fn(async () => ({ ok: true })));
    return mocks.mutations.get(ref);
  },
  usePaginatedQuery: (ref: unknown, args: unknown) => {
    mocks.queryArgs.set(ref, args);
    return (
      mocks.paginated.get(ref) ?? {
        results: [],
        status: "Exhausted",
        loadMore: vi.fn(),
      }
    );
  },
}));

const now = Date.now();

function makeRow(overrides: Partial<AdminNotificationRow> = {}): AdminNotificationRow {
  return {
    notificationId: "notif-1" as AdminNotificationRow["notificationId"],
    title: "Lunch is Ready",
    message: "Head to the main atrium with your badge.",
    type: "general",
    status: "published",
    scheduledAt: null,
    publishedAt: now - 60_000,
    expiresAt: null,
    cancelledAt: null,
    expired: false,
    linkUrl: "/dashboard/schedule",
    linkLabel: "View schedule",
    relatedEvent: null,
    relatedFlashSale: null,
    createdBy: { adminId: "admin-1" as AdminNotificationRow["createdBy"]["adminId"], name: "Sam Admin" },
    updatedBy: null,
    createdAt: now - 60_000,
    updatedAt: now - 60_000,
    ...overrides,
  };
}

const sampleRows: AdminNotificationRow[] = [
  makeRow({
    notificationId: "notif-published" as AdminNotificationRow["notificationId"],
    title: "Lunch is Ready",
    type: "general",
    status: "published",
    publishedAt: now - 120_000,
  }),
  makeRow({
    notificationId: "notif-scheduled" as AdminNotificationRow["notificationId"],
    title: "AI Workshop",
    message: "Room 204 starts soon.",
    type: "event",
    status: "scheduled",
    scheduledAt: now + 3_600_000,
    publishedAt: null,
  }),
  makeRow({
    notificationId: "notif-sale" as AdminNotificationRow["notificationId"],
    title: "Shop Flash Sale",
    message: "T-shirts 25% off for one hour.",
    type: "flash_sale",
    status: "published",
    publishedAt: now - 30_000,
    relatedFlashSale: {
      flashSaleId: "sale-1" as NonNullable<AdminNotificationRow["relatedFlashSale"]>["flashSaleId"],
      title: "Shop Flash Sale",
    },
  }),
];

let container: HTMLDivElement;
let root: Root;

function auth(overrides: Partial<AdminAuthContextValue> = {}): AdminAuthContextValue {
  return {
    staff: { adminId: "admin", email: "a@example.com", name: "Sam", role: "admin", expiresAt: now + 60_000 },
    sessionToken: "session-token",
    authError: null,
    isLoading: false,
    sessionReady: true,
    isAuthenticated: true,
    signIn: vi.fn(),
    signOut: vi.fn(),
    ...overrides,
  };
}

function mutation(ref: unknown) {
  if (!mocks.mutations.has(ref)) mocks.mutations.set(ref, vi.fn(async () => ({ ok: true })));
  return mocks.mutations.get(ref)!;
}

function field(label: string) {
  const match = Array.from(container.querySelectorAll("label")).find((element) =>
    element.textContent?.trim().startsWith(label),
  );
  if (!match) throw new Error(`No field ${label}`);
  const control = match.htmlFor
    ? container.querySelector(`[id="${match.htmlFor}"]`)
    : match.querySelector("input, select, textarea");
  return control as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
}

async function type(label: string | HTMLElement, value: string) {
  const element = typeof label === "string" ? field(label) : (label as HTMLInputElement);
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(
      new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }),
    );
  });
}

function button(name: string) {
  const match = Array.from(container.querySelectorAll("button")).find(
    (element) =>
      element.getAttribute("aria-label") === name || element.textContent?.trim() === name,
  );
  if (!match) throw new Error(`No button ${name}`);
  return match;
}

async function click(name: string) {
  await act(async () => button(name).click());
}

async function renderPage(context = auth()) {
  await act(async () =>
    root.render(
      <AdminAuthContext.Provider value={context}>
        <MemoryRouter initialEntries={["/admin/notifications"]}>
          <Routes>
            <Route path="/admin/notifications" element={<NotificationsPage />} />
          </Routes>
        </MemoryRouter>
      </AdminAuthContext.Provider>,
    ),
  );
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.mutations.clear();
  mocks.paginated.clear();
  mocks.queryArgs.clear();
  mocks.paginated.set(listNotificationsAdminRef, {
    results: sampleRows,
    status: "Exhausted",
    loadMore: vi.fn(),
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("NotificationsPage", () => {
  it("updates the live participant preview, saves drafts, schedules, and confirms before Send Now", async () => {
    await renderPage();

    await type("Title", "Hardware Lab Open");
    await type("Notification type", "reminder");
    await type("Message", "Pick up Arduino kits at Table 4.");
    await type("Link URL (optional)", "/dashboard/schedule");
    await type("Link label (optional)", "Lab hours");

    const preview = container.querySelector('[aria-label="Live participant preview"]');
    expect(preview?.textContent).toContain("Hardware Lab Open");
    expect(preview?.textContent).toContain("Reminder");
    expect(preview?.textContent).toContain("Pick up Arduino kits at Table 4.");
    expect(preview?.textContent).toContain("Lab hours (/dashboard/schedule)");

    // Save as draft
    await click("Save as draft");
    expect(mutation(saveNotificationDraftRef)).toHaveBeenCalledWith({
      sessionToken: "session-token",
      title: "Hardware Lab Open",
      message: "Pick up Arduino kits at Table 4.",
      type: "reminder",
      linkUrl: "/dashboard/schedule",
      linkLabel: "Lab hours",
      expiresAt: null,
    });

    // Compose another and Send Now (must require confirmation dialog first)
    await type("Title", "Demos Starting Now");
    await type("Notification type", "important");
    await type("Message", "Report to your judging table immediately.");
    await click("Send Now");

    expect(mutation(publishNotificationNowRef)).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Send notification now?");

    await click("Confirm & Send Now");
    expect(mutation(publishNotificationNowRef)).toHaveBeenCalledWith({
      sessionToken: "session-token",
      title: "Demos Starting Now",
      message: "Report to your judging table immediately.",
      type: "important",
      linkUrl: null,
      linkLabel: null,
      expiresAt: null,
    });

    // Schedule for future delivery
    const futureStr = toDateTimeInput(now + 2 * 3_600_000);
    await type("Title", "Closing Ceremony");
    await type("Notification type", "event");
    await type("Message", "Awards start at 4 PM.");
    await type("Schedule for (when scheduling)", futureStr);
    await click("Schedule");

    expect(mutation(scheduleNotificationRef)).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionToken: "session-token",
        title: "Closing Ceremony",
        message: "Awards start at 4 PM.",
        type: "event",
      }),
    );
  });

  it("supports searching, filtering, viewing published details, and editing or cancelling scheduled notifications", async () => {
    await renderPage();

    expect(container.textContent).toContain("Lunch is Ready");
    expect(container.textContent).toContain("AI Workshop");
    expect(container.textContent).toContain("Shop Flash Sale");

    // View published notification details
    await click("View Lunch is Ready");
    expect(container.textContent).toContain(
      "Published notifications are locked so participant history stays accurate.",
    );
    await click("Copy to new draft");
    expect((field("Title") as HTMLInputElement).value).toBe("Lunch is Ready");

    // Edit scheduled notification
    await click("Edit AI Workshop");
    expect(container.textContent).toContain("Edit scheduled notification");
    expect((field("Title") as HTMLInputElement).value).toBe("AI Workshop");

    // Cancel scheduled notification
    await click("Cancel AI Workshop");
    expect(container.textContent).toContain("Cancel “AI Workshop”?");
    await click("Confirm cancel");
    expect(mutation(cancelNotificationRef)).toHaveBeenCalledWith({
      sessionToken: "session-token",
      notificationId: "notif-scheduled",
    });

    // Filter by type and status
    await type(container.querySelector('[aria-label="Filter by type"]') as HTMLElement, "flash_sale");
    expect(mocks.queryArgs.get(listNotificationsAdminRef)).toMatchObject({
      sessionToken: "session-token",
      type: "flash_sale",
    });

    await type(container.querySelector('[aria-label="Filter by status"]') as HTMLElement, "scheduled");
    expect(mocks.queryArgs.get(listNotificationsAdminRef)).toMatchObject({
      sessionToken: "session-token",
      type: "flash_sale",
      status: "scheduled",
    });

    // Clear filters and search form submission
    await click("Clear filters");
    const searchInput = container.querySelector('input[type="search"]') as HTMLInputElement;
    await type(searchInput, "Lunch");
    await click("Search");
    expect(mocks.queryArgs.get(listNotificationsAdminRef)).toMatchObject({
      sessionToken: "session-token",
      search: "Lunch",
    });
    await type(searchInput, "");
  });

  it("validates composer inputs, handles mutation failures, and supports pagination and detail dialog actions", async () => {
    const loadMore = vi.fn();
    mocks.paginated.set(listNotificationsAdminRef, {
      results: [
        makeRow({
          notificationId: "notif-draft" as AdminNotificationRow["notificationId"],
          title: "Draft Item",
          status: "draft",
          publishedAt: null,
          expiresAt: now + 3_600_000,
          relatedEvent: {
            eventId: "evt-1" as NonNullable<AdminNotificationRow["relatedEvent"]>["eventId"],
            name: "Opening Ceremony",
          },
          updatedBy: { adminId: "admin-1" as AdminNotificationRow["createdBy"]["adminId"], name: "Sam Admin" },
        }),
        makeRow({
          notificationId: "notif-cancelled" as AdminNotificationRow["notificationId"],
          title: "Cancelled Item",
          status: "cancelled",
          publishedAt: null,
          cancelledAt: now - 10_000,
          expired: true,
        }),
      ],
      status: "CanLoadMore",
      loadMore,
    });

    await renderPage();

    // Validation errors on empty submit
    await click("Send Now");
    expect(container.textContent).toContain("Enter a notification title.");
    expect(container.textContent).toContain("Enter a notification message.");

    // Invalid link URL and link label without URL
    await type("Title", "Test");
    await type("Message", "Body");
    await type("Link label (optional)", "Orphan label");
    await click("Save as draft");
    expect(container.textContent).toContain("Add a link URL before setting a link label.");

    await type("Link URL (optional)", "javascript:alert(1)");
    await click("Save as draft");
    expect(container.textContent).toContain("Enter a valid link URL");

    // Past schedule validation
    await type("Link URL (optional)", "");
    await type("Link label (optional)", "");
    await type("Schedule for (when scheduling)", toDateTimeInput(now - 60_000));
    await click("Schedule");
    expect(container.textContent).toContain("Choose a future date and time for scheduled delivery.");

    // View draft details & click Edit notification from inside dialog
    await click("View Draft Item");
    expect(container.textContent).toContain("Opening Ceremony");
    await click("Edit notification");
    expect((field("Title") as HTMLInputElement).value).toBe("Draft Item");

    // View cancelled notification details & close
    await click("View Cancelled Item");
    expect(container.textContent).toContain("Cancelled at");
    await click("Close");

    // Load more pagination
    await click("Load more notifications");
    expect(loadMore).toHaveBeenCalledWith(25);

    // Mutation error handling on Save as draft, Schedule, Send Now, and Cancel
    mutation(saveNotificationDraftRef).mockRejectedValueOnce(new Error("Draft save failed"));
    await click("Save as draft");
    expect(container.textContent).toContain("We couldn't save this draft. Please try again.");

    mutation(scheduleNotificationRef).mockRejectedValueOnce(new Error("Schedule failed"));
    await type("Schedule for (when scheduling)", toDateTimeInput(now + 3_600_000));
    await click("Schedule");
    expect(container.textContent).toContain(
      "The expiration time must be after the scheduled delivery time.",
    );

    await type("Expires at (optional)", "");
    await click("Schedule");
    expect(container.textContent).toContain(
      "We couldn't schedule this notification. Please try again.",
    );

    mutation(publishNotificationNowRef).mockRejectedValueOnce(new Error("Publish failed"));
    await click("Send Now");
    await click("Confirm & Send Now");
    expect(container.textContent).toContain("We couldn't publish this notification. Please try again.");

    mutation(cancelNotificationRef).mockRejectedValueOnce(new Error("Cancel failed"));
    await click("Cancel Draft Item");
    await click("Confirm cancel");
    expect(container.textContent).toContain("We couldn't cancel this notification. Please try again.");
  });

  it("renders loading and empty states when non-admin or when no rows match", async () => {
    mocks.paginated.set(listNotificationsAdminRef, {
      results: [],
      status: "Exhausted",
      loadMore: vi.fn(),
    });
    await renderPage();
    expect(container.textContent).toContain("No notifications yet.");

    await renderPage(auth({ sessionToken: null }));
    expect(container.textContent).toContain("Verifying administrator access…");
  });
});
