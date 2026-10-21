// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AdminAuthContext,
  type AdminAuthContextValue,
} from "../../src/contexts/adminAuthContext";
import {
  listDecisionEmailQueueRef,
  releaseDecisionEmailsRef,
  retryFailedDecisionEmailsRef,
  setDecisionEmailHoldRef,
  type DecisionEmailQueue,
} from "../../src/convex/adminApi";
import { DecisionEmailQueuePage } from "../../src/pages/admin/DecisionEmailQueuePage";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  releaseAction: vi.fn(),
  holdMutation: vi.fn(),
  retryMutation: vi.fn(),
}));

vi.mock("../../src/convex/reactBindings", () => ({
  ConvexProvider: ({ children }: { children: unknown }) => children,
  useQuery: mocks.query,
  useMutation: (ref: unknown) => {
    if (ref === setDecisionEmailHoldRef) return mocks.holdMutation;
    if (ref === retryFailedDecisionEmailsRef) return mocks.retryMutation;
    throw new Error(`Unexpected mutation ref: ${String(ref)}`);
  },
  useAction: (ref: unknown) => {
    if (ref === releaseDecisionEmailsRef) return mocks.releaseAction;
    throw new Error(`Unexpected action ref: ${String(ref)}`);
  },
  usePaginatedQuery: vi.fn(),
}));

function staffContext(role: "reviewer" | "admin"): AdminAuthContextValue {
  return {
    staff: {
      adminId: "staff-1",
      email: "staff@hackuta.org",
      name: "Staff",
      role,
      expiresAt: Date.now() + 60_000,
    },
    sessionToken: "s".repeat(64),
    authError: null,
    isAuthenticated: true,
    isLoading: false,
    sessionReady: true,
    signIn: vi.fn(),
    signOut: vi.fn(),
  };
}

function sampleQueue(overrides: Partial<DecisionEmailQueue> = {}): DecisionEmailQueue {
  const base: DecisionEmailQueue = {
    counts: { queued: 1, held: 1, sending: 0, failed: 1, sent: 1 },
    active: [
      {
        itemId: "item-queued" as DecisionEmailQueue["active"][number]["itemId"],
        applicationId: "app-1" as DecisionEmailQueue["active"][number]["applicationId"],
        decision: "accepted",
        recipientEmail: "taylor@example.com",
        applicantName: "Taylor Student",
        status: "queued",
        queuedAt: 1_700_000_000_000,
        sentAt: null,
        errorMessage: null,
      },
      {
        itemId: "item-held" as DecisionEmailQueue["active"][number]["itemId"],
        applicationId: "app-2" as DecisionEmailQueue["active"][number]["applicationId"],
        decision: "rejected",
        recipientEmail: "sam@example.com",
        applicantName: "Sam Lee",
        status: "held",
        queuedAt: 1_700_000_000_000,
        sentAt: null,
        errorMessage: null,
      },
      {
        itemId: "item-failed" as DecisionEmailQueue["active"][number]["itemId"],
        applicationId: "app-3" as DecisionEmailQueue["active"][number]["applicationId"],
        decision: "waitlisted",
        recipientEmail: "alex@example.com",
        applicantName: "Alex Chen",
        status: "failed",
        queuedAt: 1_700_000_000_000,
        sentAt: null,
        errorMessage: "Mailer rejected",
      },
    ],
    sent: [
      {
        itemId: "item-sent" as DecisionEmailQueue["sent"][number]["itemId"],
        applicationId: "app-4" as DecisionEmailQueue["sent"][number]["applicationId"],
        decision: "accepted",
        recipientEmail: "done@example.com",
        applicantName: "Done Applicant",
        status: "sent",
        queuedAt: 1_700_000_000_000,
        sentAt: 1_700_000_100_000,
        errorMessage: null,
      },
    ],
  };
  return { ...base, ...overrides };
}

describe("DecisionEmailQueuePage", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mocks.query.mockReset();
    mocks.releaseAction.mockReset().mockResolvedValue({ sent: 1, failed: 0, total: 1 });
    mocks.holdMutation.mockReset().mockResolvedValue({ status: "held" });
    mocks.retryMutation.mockReset().mockResolvedValue({ retried: 1 });
    mocks.query.mockImplementation((ref) => {
      if (ref === listDecisionEmailQueueRef) return sampleQueue();
      return undefined;
    });

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function renderPage(role: "reviewer" | "admin") {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <AdminAuthContext.Provider value={staffContext(role)}>
            <DecisionEmailQueuePage />
          </AdminAuthContext.Provider>
        </MemoryRouter>,
      );
    });
  }

  function button(name: string) {
    return Array.from(container.querySelectorAll("button")).find((el) => el.textContent === name);
  }

  it("shows loading until the queue query resolves", async () => {
    mocks.query.mockReturnValue(undefined);
    await renderPage("admin");
    expect(container.textContent).toContain("Loading decision emails");
  });

  it("renders queue rows and recently sent for an admin", async () => {
    await renderPage("admin");
    expect(container.textContent).toContain("Taylor Student");
    expect(container.textContent).toContain("Rejected");
    expect(container.textContent).toContain("Waitlisted");
    expect(container.textContent).toContain("Mailer rejected");
    expect(container.textContent).toContain("Done Applicant");
    expect(button("Send selected")).toBeDefined();
    expect(button("Send all queued")).toBeDefined();
    expect(button("Retry failed")).toBeDefined();
  });

  it("hides send controls for reviewers", async () => {
    await renderPage("reviewer");
    expect(container.textContent).toContain("An admin releases these emails");
    expect(button("Send selected")).toBeUndefined();
    expect(button("Hold")).toBeUndefined();
  });

  it("shows empty-state copy when nothing is waiting or sent", async () => {
    mocks.query.mockReturnValue(
      sampleQueue({
        active: [],
        sent: [],
        counts: { queued: 0, held: 0, sending: 0, failed: 0, sent: 0 },
      }),
    );
    await renderPage("admin");
    expect(container.textContent).toContain("No decision emails are waiting");
    expect(container.textContent).toContain("No decision emails have been sent yet");
  });

  it("sends selected rows and shows a success notice", async () => {
    await renderPage("admin");
    const checkbox = container.querySelector(
      'input[type="checkbox"][aria-label="Select Taylor Student"]',
    ) as HTMLInputElement;
    await act(async () => checkbox.click());
    await act(async () => button("Send selected")!.click());
    await act(async () => Promise.resolve());

    expect(mocks.releaseAction).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionToken: "s".repeat(64),
        itemIds: ["item-queued"],
      }),
    );
    expect(container.textContent).toContain("Sent 1 of 1");
  });

  it("sends all queued rows", async () => {
    await renderPage("admin");
    await act(async () => button("Send all queued")!.click());
    await act(async () => Promise.resolve());
    expect(mocks.releaseAction).toHaveBeenCalledWith({ sessionToken: "s".repeat(64) });
  });

  it("surfaces send failures", async () => {
    mocks.releaseAction.mockRejectedValue(new Error("network"));
    await renderPage("admin");
    await act(async () => button("Send all queued")!.click());
    await act(async () => Promise.resolve());
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/couldn't send/i);
  });

  it("toggles hold on a queued row", async () => {
    await renderPage("admin");
    const holdButtons = Array.from(container.querySelectorAll("button")).filter(
      (el) => el.textContent === "Hold" || el.textContent === "Unhold",
    );
    await act(async () => holdButtons[0]!.click());
    await act(async () => Promise.resolve());
    expect(mocks.holdMutation).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: "item-queued", held: true }),
    );
  });

  it("retries failed rows", async () => {
    await renderPage("admin");
    await act(async () => button("Retry failed")!.click());
    await act(async () => Promise.resolve());
    expect(mocks.retryMutation).toHaveBeenCalledWith({ sessionToken: "s".repeat(64) });
    expect(container.textContent).toContain("returned to the queue");
  });

  it("disables admin send actions while a release is in progress", async () => {
    mocks.query.mockReturnValue(
      sampleQueue({
        counts: { queued: 1, held: 0, sending: 1, failed: 0, sent: 0 },
      }),
    );
    await renderPage("admin");
    expect(button("Send selected")?.disabled).toBe(true);
    expect(button("Send all queued")?.disabled).toBe(true);
    expect(button("Retry failed")?.disabled).toBe(true);
  });

  it("ignores a second send while the first release is still running", async () => {
    let resolveRelease: (value: { sent: number; failed: number; total: number }) => void;
    mocks.releaseAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRelease = resolve;
        }),
    );
    await renderPage("admin");
    await act(async () => button("Send all queued")!.click());
    await act(async () => button("Send all queued")!.click());
    expect(mocks.releaseAction).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveRelease!({ sent: 1, failed: 0, total: 1 });
      await Promise.resolve();
    });
  });

  it("unholds a held row", async () => {
    await renderPage("admin");
    const unhold = Array.from(container.querySelectorAll("button")).find((el) => el.textContent === "Unhold");
    await act(async () => unhold!.click());
    await act(async () => Promise.resolve());
    expect(mocks.holdMutation).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: "item-held", held: false }),
    );
  });

  it("surfaces hold and retry failures", async () => {
    mocks.holdMutation.mockRejectedValue(new Error("hold failed"));
    mocks.retryMutation.mockRejectedValue(new Error("retry failed"));
    await renderPage("admin");
    const holdButton = Array.from(container.querySelectorAll("button")).find(
      (el) => el.textContent === "Hold",
    );
    await act(async () => holdButton!.click());
    await act(async () => Promise.resolve());
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/couldn't update/i);

    await act(async () => button("Retry failed")!.click());
    await act(async () => Promise.resolve());
    expect(container.textContent).toMatch(/couldn't retry/i);
  });
});
