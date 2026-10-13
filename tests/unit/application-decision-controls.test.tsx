// @vitest-environment happy-dom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { GenericId } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationDecisionControls } from "../../src/components/ApplicationDecisionControls";
import { setApplicationDecisionRef, type ApplicationDetail } from "../../src/convex/adminApi";

const mocks = vi.hoisted(() => ({ mutationHook: vi.fn(), finalize: vi.fn() }));
vi.mock("convex/react", () => ({
  useMutation: mocks.mutationHook,
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

  it("does not call the backend when only selecting a decision", async () => {
    await renderControls();
    await act(async () => button("Accept")!.click());
    expect(container.textContent).toContain("Confirm acceptance");
    expect(mocks.mutationHook).toHaveBeenCalledWith(setApplicationDecisionRef);
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it("finalizes only after confirmation and supports cancel", async () => {
    await renderControls();
    await act(async () => button("Reject")!.click());
    await act(async () => button("Cancel")!.click());
    expect(container.textContent).toContain("Accept");
    expect(mocks.finalize).not.toHaveBeenCalled();

    await act(async () => button("Waitlist")!.click());
    await act(async () => button("Confirm waitlist")!.click());
    expect(mocks.finalize).toHaveBeenCalledExactlyOnceWith({
      sessionToken: "session-token",
      applicationId: "application-a",
      decision: "waitlisted",
    });
  });

  it.each([
    ["Accept", "Confirm acceptance", "accepted", "Application accepted."],
    ["Reject", "Confirm rejection", "rejected", "Application rejected."],
    ["Waitlist", "Confirm waitlist", "waitlisted", "Application waitlisted."],
  ] as const)("%s sends one decision and shows the email notice", async (choice, confirm, decision, message) => {
    await renderControls();
    await act(async () => button(choice)!.click());
    expect(mocks.finalize).not.toHaveBeenCalled();

    await act(async () => button(confirm)!.click());
    expect(mocks.finalize).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ decision }));
    expect(container.textContent).toContain(message);
    expect(container.textContent).toContain("will receive an email shortly");
  });

  it("sends only one request when confirm is clicked twice", async () => {
    let resolve!: (value: unknown) => void;
    mocks.finalize.mockReturnValue(new Promise((done) => (resolve = done)));
    await renderControls();
    await act(async () => button("Accept")!.click());

    const confirm = button("Confirm acceptance")!;
    await act(async () => confirm.click());
    await act(async () => confirm.click());
    expect(button("Finalizing…")?.disabled).toBe(true);
    expect(button("Cancel")?.disabled).toBe(true);
    await act(async () => button("Cancel")!.click());

    await act(async () => resolve({ logId: "log", duplicate: false }));
    expect(mocks.finalize).toHaveBeenCalledTimes(1);
  });

  it("shows the server error and keeps the confirmation open", async () => {
    mocks.finalize.mockRejectedValue(new Error("This application already has a final decision."));
    await renderControls();
    await act(async () => button("Reject")!.click());
    await act(async () => button("Confirm rejection")!.click());

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "This application already has a final decision.",
    );
    expect(button("Confirm rejection")).toBeDefined();
  });

  it("shows a fallback message for a non-Error failure", async () => {
    mocks.finalize.mockRejectedValue("boom");
    await renderControls();
    await act(async () => button("Accept")!.click());
    await act(async () => button("Confirm acceptance")!.click());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Unable to finalize decision.");
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
});
