// @vitest-environment happy-dom
import { act, StrictMode, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { GenericId } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationDecisionControls } from "../../src/components/ApplicationDecisionControls";
import { setApplicationDecisionRef, type ApplicationDetail } from "../../src/convex/adminApi";
import { ADMIN_ERROR_MESSAGES, adminError } from "../../shared/admin/errors";

const mocks = vi.hoisted(() => ({ mutationHook: vi.fn(), finalize: vi.fn() }));
vi.mock("../../src/convex/reactBindings", () => ({
  ConvexProvider: ({ children }: { children: ReactNode }) => children,
  useMutation: mocks.mutationHook,
  useQuery: vi.fn(),
  usePaginatedQuery: vi.fn(),
}));

function detail(overrides: Partial<ApplicationDetail> = {}): ApplicationDetail {
  return {
    application: {
      _id: "application-a" as GenericId<"applications">,
      _creationTime: 1,
      authUserId: "user" as GenericId<"users">,
      email: "taylor@example.com",
      createdAt: 1,
      formSubmitted: true,
      submittedAt: 1,
    },
    reviewStatus: "under_review",
    reviewActivity: {
      reviewedBy: null,
      currentReviewerName: null,
      startedAt: null,
      lastActiveAt: null,
      isFinal: false,
      isStale: false,
      activeReviewStaleMs: 30 * 60 * 1000,
    },
    resume: { status: "none", url: null, filename: null },
    pendingDecision: null,
    ...overrides,
  };
}

describe("ApplicationDecisionControls", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mocks.mutationHook.mockReset().mockReturnValue(mocks.finalize);
    mocks.finalize.mockReset().mockResolvedValue({ logId: "log", duplicate: false });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function renderControls(props: Partial<Parameters<typeof ApplicationDecisionControls>[0]> = {}) {
    await act(async () =>
      root.render(
        <StrictMode>
          <ApplicationDecisionControls
            detail={detail()}
            sessionToken="session-token"
            {...props}
          />
        </StrictMode>,
      ),
    );
  }

  function button(name: string) {
    return Array.from(container.querySelectorAll("button")).find((el) => el.textContent === name);
  }

  async function choose(name: string) {
    if (!button(name)) {
      await act(async () => button("Change Decision")!.click());
    }
    await act(async () => button(name)!.click());
  }

  it("starts from one Change Decision button", async () => {
    await renderControls();
    expect(button("Change Decision")).toBeDefined();
    expect(button("Accept")).toBeUndefined();
    expect(button("Reject")).toBeUndefined();
    expect(button("Waitlist")).toBeUndefined();
  });

  it("does not call the backend when only selecting a decision", async () => {
    await renderControls();
    await choose("Accept");
    expect(container.textContent).toContain("Confirm acceptance");
    expect(mocks.mutationHook).toHaveBeenCalledWith(setApplicationDecisionRef);
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it("finalizes only after confirmation and supports cancel", async () => {
    await renderControls();
    for (const decision of ["Accept", "Reject"]) {
      await choose(decision);
      await act(async () => button("Cancel")!.click());
      expect(button(decision)).toBeDefined();
      expect(button("Cancel")).toBeUndefined();
      expect(mocks.finalize).not.toHaveBeenCalled();
    }

    await choose("Waitlist");
    await act(async () => button("Confirm waitlist")!.click());
    expect(mocks.finalize).toHaveBeenCalledExactlyOnceWith({
      sessionToken: "session-token",
      applicationId: "application-a",
      decision: "waitlisted",
    });
  });

  it.each([
    ["Accept", "Confirm acceptance", "accepted", "Acceptance queued."],
    ["Reject", "Confirm rejection", "rejected", "Rejection queued."],
    ["Waitlist", "Confirm waitlist", "waitlisted", "Waitlist choice queued."],
  ] as const)("%s sends one decision and shows the queue notice", async (choice, confirm, decision, message) => {
    await renderControls();
    await choose(choice);
    expect(mocks.finalize).not.toHaveBeenCalled();

    await act(async () => button(confirm)!.click());
    expect(mocks.finalize).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ decision }));
    expect(container.textContent).toContain(message);
    expect(container.textContent).toContain("until an admin sends the email.");
  });

  it("shows the queued decision without treating it as released", async () => {
    await renderControls({
      detail: detail({
        pendingDecision: { decision: "accepted", status: "queued", queuedAt: 1 },
      }),
    });
    expect(container.textContent).toContain("Queued: Accepted — not released");
  });

  it("sends only one request while finalization is pending", async () => {
    let resolveDecision!: (result: { logId: string; duplicate: boolean }) => void;
    mocks.finalize.mockReturnValue(
      new Promise((resolve) => {
        resolveDecision = resolve;
      }),
    );
    await renderControls();
    await choose("Accept");

    const confirm = button("Confirm acceptance")!;
    await act(async () => confirm.click());
    await act(async () => confirm.click());
    expect(mocks.finalize).toHaveBeenCalledExactlyOnceWith({
      sessionToken: "session-token",
      applicationId: "application-a",
      decision: "accepted",
    });
    expect(button("Finalizing…")!.disabled).toBe(true);
    expect(button("Cancel")!.disabled).toBe(true);
    await act(async () => button("Finalizing…")!.click());
    expect(mocks.finalize).toHaveBeenCalledTimes(1);

    await act(async () => resolveDecision({ logId: "accepted-log", duplicate: false }));
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Acceptance queued");
  });

  it("shows the server error and keeps the confirmation open", async () => {
    mocks.finalize.mockRejectedValue(adminError("REVIEW_FINALIZED"));
    await renderControls();
    await choose("Reject");
    await act(async () => button("Confirm rejection")!.click());

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      ADMIN_ERROR_MESSAGES.REVIEW_FINALIZED,
    );
    expect(button("Confirm rejection")).toBeDefined();
  });

  it.each([
    ["a non-Error failure", "boom"],
    ["a redacted Convex server error", new Error("[CONVEX M(admin/x)] [Request ID: abc123] Server Error")],
  ])("shows a fallback message for %s", async (_label, failure) => {
    mocks.finalize.mockRejectedValue(failure);
    await renderControls();
    await choose("Accept");
    await act(async () => button("Confirm acceptance")!.click());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "We couldn't save this decision. Please try again.",
    );
  });

  it("hides decision actions when another organizer holds the active claim", async () => {
    await renderControls({ blockedByOther: true });
    expect(button("Change Decision")).toBeUndefined();
    expect(container.textContent).toContain("another organizer holds the active review claim");
  });

  it("hides controls after a final decision", async () => {
    await renderControls({
      detail: detail({
        reviewStatus: "accepted",
        reviewActivity: {
          ...detail().reviewActivity,
          isFinal: true,
        },
      }),
    });
    expect(container.querySelector('section[aria-label="Application decision"]')).toBeNull();
  });

  it("offers only confirmed acceptance for a waitlisted applicant", async () => {
    await renderControls({ detail: detail({ reviewStatus: "waitlisted", reviewActivity: { ...detail().reviewActivity, isFinal: true } }) });
    expect(button("Reject")).toBeUndefined();
    expect(button("Waitlist")).toBeUndefined();
    await act(async () => button("Accept from waitlist")!.click());
    expect(mocks.finalize).not.toHaveBeenCalled();
    await act(async () => button("Confirm acceptance")!.click());
    expect(mocks.finalize).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ decision: "accepted" }));
  });

  it("focuses confirmation, restores the selected choice on cancel, and identifies the applicant", async () => {
    await renderControls();
    await act(async () => button("Change Decision")!.click());
    button("Reject")!.focus();
    await act(async () => button("Reject")!.click());
    expect(document.activeElement).toBe(button("Confirm rejection"));
    expect(container.textContent).toContain("taylor@example.com");
    await act(async () => button("Cancel")!.click());
    expect(document.activeElement).toBe(button("Reject"));
  });

  it("retains and focuses completion after the live query reports a final decision", async () => {
    await renderControls();
    await choose("Accept");
    await act(async () => button("Confirm acceptance")!.click());
    await renderControls({ detail: detail({ reviewStatus: "accepted", reviewActivity: { ...detail().reviewActivity, isFinal: true } }) });
    const notice = container.querySelector('[role="status"]');
    expect(notice?.textContent).toContain("Acceptance queued");
    expect(document.activeElement).toBe(notice);
    expect(button("Accept")).toBeUndefined();
  });
});
