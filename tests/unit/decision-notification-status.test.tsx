// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GenericId } from "convex/values";
import { DecisionNotificationStatus } from "../../src/components/DecisionNotificationStatus";
import type { ApplicationDetail } from "../../src/convex/adminApi";
import { NOTIFICATION_ATTEMPT_STALE_MS } from "../../shared/admin/decisionNotification";

const mocks = vi.hoisted(() => ({ retry: vi.fn(), check: vi.fn() }));
vi.mock("../../src/convex/reactBindings", () => ({ useMutation: () => mocks.retry, useAction: () => mocks.check }));

const detail: ApplicationDetail = {
  application: { _id: "app" as GenericId<"applications">, _creationTime: 1, authUserId: "user" as GenericId<"users">, email: "taylor@example.com", createdAt: 1 },
  reviewStatus: "accepted",
  reviewActivity: { reviewedBy: null, currentReviewerName: null, startedAt: null, lastActiveAt: null, isFinal: true, isStale: false, activeReviewStaleMs: 30 * 60_000 },
  resume: { status: "none", url: null, filename: null },
};

describe("decision notification status", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mocks.retry.mockReset().mockResolvedValue(null);
    mocks.check.mockReset().mockResolvedValue(null);
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); });
  function button(text: string) { return Array.from(container.querySelectorAll("button")).find((el) => el.textContent === text)!; }
  async function render(status?: NonNullable<ApplicationDetail["notification"]>["status"], serviceId?: string) {
    const value = { ...detail };
    if (status) value.notification = { status, logId: "log" as GenericId<"applicationReviewLogs">, attempt: 1, requestedBy: "staff" as GenericId<"admins">, recipient: "taylor@example.com", updatedAt: Date.now(), ...(serviceId ? { serviceId } : {}) };
    await act(async () => root.render(<DecisionNotificationStatus detail={value} sessionToken="session" />));
  }
  it.each([undefined, "failed", "unknown"] as const)("requires explicit confirmation before resending %s", async (status) => {
    await render(status);
    await act(async () => button("Resend decision email").click());
    expect(container.textContent).toContain("may receive a duplicate email");
    expect(container.textContent).toContain("taylor@example.com");
    expect(document.activeElement).toBe(button("Confirm resend"));
    expect(mocks.retry).not.toHaveBeenCalled();
    await act(async () => button("Confirm resend").click());
    expect(mocks.retry).toHaveBeenCalledExactlyOnceWith({ sessionToken: "session", applicationId: "app" });
  });
  it("checks a queued email without offering a resend", async () => {
    await render("queued", "service-1");
    expect(container.textContent).toContain("Sending has not yet been confirmed");
    expect(button("Resend decision email")).toBeUndefined();
    await act(async () => button("Check email status").click());
    expect(mocks.check).toHaveBeenCalledExactlyOnceWith({ sessionToken: "session", applicationId: "app" });
  });
  it("keeps the confirmation available when a resend fails", async () => {
    mocks.retry.mockRejectedValueOnce(new Error("Unable to schedule"));
    await render("failed");
    await act(async () => button("Resend decision email").click());
    await act(async () => button("Confirm resend").click());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Unable to schedule");
    expect(button("Confirm resend").disabled).toBe(false);
  });
  it.each(["scheduled", "sending", "sent", "unavailable"] as const)("explains %s without implying delivery", async (status) => {
    await render(status);
    expect(container.querySelector('[role="status"]')?.textContent).toBeTruthy();
  });

  it("offers manual recovery when a sending attempt stops completing", async () => {
    vi.useFakeTimers();
    await render("sending");
    expect(button("Resend decision email")).toBeUndefined();
    await act(async () => { vi.advanceTimersByTime(NOTIFICATION_ATTEMPT_STALE_MS + 15_000); });
    expect(container.textContent).toContain("Its outcome is unknown");
    expect(button("Resend decision email")).toBeDefined();
    expect(mocks.retry).not.toHaveBeenCalled();
  });
});
