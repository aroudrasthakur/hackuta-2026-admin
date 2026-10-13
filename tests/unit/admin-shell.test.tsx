// @vitest-environment happy-dom
import { act, StrictMode, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { GenericId } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../src/App";
import { ApplicationReviewControls } from "../../src/components/ApplicationReviewControls";
import { ErrorBoundary } from "../../src/components/ErrorBoundary";
import { AdminAuthProvider } from "../../src/contexts/AdminAuthProvider";
import { AdminAuthContext, type AdminAuthContextValue } from "../../src/contexts/adminAuthContext";
import {
  getCurrentStaffRef,
  listSubmittedApplicationsRef,
  logApplicationReviewActionRef,
  type ApplicationDetail,
} from "../../src/convex/adminApi";
import { useAdminAuth } from "../../src/hooks/useAdminAuth";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  paginatedQuery: vi.fn(),
  mutationHook: vi.fn(),
  mutation: vi.fn(),
}));
vi.mock("../../src/convex/reactBindings", () => ({
  ConvexProvider: ({ children }: { children: unknown }) => children,
  useQuery: mocks.query,
  usePaginatedQuery: mocks.paginatedQuery,
  useMutation: mocks.mutationHook,
}));

const staff = {
  adminId: "staff-1",
  email: "staff@hackuta.org",
  name: "Jordan Reviewer",
  role: "reviewer" as const,
  expiresAt: Date.now() + 60_000,
};

function authContext(overrides: Partial<AdminAuthContextValue> = {}): AdminAuthContextValue {
  return {
    staff,
    sessionToken: "s".repeat(64),
    isAuthenticated: true,
    isLoading: false,
    sessionReady: true,
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.query.mockReset().mockReturnValue([]);
  mocks.paginatedQuery.mockReset().mockReturnValue({ results: [], status: "Exhausted", loadMore: vi.fn() });
  mocks.mutation.mockReset().mockResolvedValue(null);
  mocks.mutationHook.mockReset().mockReturnValue(mocks.mutation);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function render(node: ReactNode) {
  await act(async () => root.render(<StrictMode>{node}</StrictMode>));
}

function CurrentPath() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

/** Context whose signIn/signOut mocks also flip the signed-in state, like the real provider. */
function LiveAuth({ initial, children }: { initial: AdminAuthContextValue; children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(initial.isAuthenticated);
  const value: AdminAuthContextValue = {
    ...initial,
    staff: signedIn ? staff : null,
    isAuthenticated: signedIn,
    sessionToken: signedIn ? (initial.sessionToken ?? "s".repeat(64)) : null,
    signIn: async (email, password) => {
      await initial.signIn(email, password);
      setSignedIn(true);
    },
    signOut: async () => {
      await initial.signOut();
      setSignedIn(false);
    },
  };
  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

async function renderApp(path: string, context: AdminAuthContextValue) {
  await render(
    <LiveAuth initial={context}>
      <MemoryRouter initialEntries={[path]}>
        <App />
        <CurrentPath />
      </MemoryRouter>
    </LiveAuth>,
  );
}

const currentPath = () => container.querySelector('[data-testid="path"]')?.textContent;
const button = (name: string) =>
  Array.from(container.querySelectorAll("button")).find((el) => el.textContent === name);

async function typeInto(name: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submitLogin() {
  await act(async () => {
    container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

describe("app routes", () => {
  it.each(["/", "/admin", "/unknown"])("sends %s to the applications page", async (path) => {
    await renderApp(path, authContext());
    expect(currentPath()).toBe("/admin/applications");
    expect(container.textContent).toContain("Signed in as Jordan Reviewer (reviewer)");
    expect(container.querySelector('nav[aria-label="Admin"] a')?.textContent).toBe("Applications");
  });

  it("sends signed-out visitors to sign-in", async () => {
    await renderApp("/admin/applications", authContext({ staff: null, isAuthenticated: false, sessionToken: null }));
    expect(currentPath()).toBe("/admin/login");
    expect(container.textContent).toContain("Organizer sign-in");
  });

  it("waits while the session is checked", async () => {
    await renderApp("/admin/applications", authContext({ sessionReady: false, isLoading: true }));
    expect(container.textContent).toContain("Verifying organizer session…");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("signs out and returns to sign-in", async () => {
    const context = authContext();
    await renderApp("/admin/applications", context);
    await act(async () => button("Sign out")!.click());
    expect(context.signOut).toHaveBeenCalledOnce();
    expect(currentPath()).toBe("/admin/login");
  });
});

describe("sign-in page", () => {
  const signedOut = (overrides: Partial<AdminAuthContextValue> = {}) =>
    authContext({ staff: null, isAuthenticated: false, sessionToken: null, ...overrides });

  it("shows a loading state while the session is checked", async () => {
    await renderApp("/admin/login", signedOut({ isLoading: true }));
    expect(container.textContent).toContain("Checking session…");
  });

  it("skips sign-in when already signed in", async () => {
    await renderApp("/admin/login", authContext());
    expect(currentPath()).toBe("/admin/applications");
  });

  it("signs in with a trimmed email and opens applications", async () => {
    const context = signedOut();
    await renderApp("/admin/login", context);
    await typeInto("email", "  staff@hackuta.org ");
    await typeInto("password", "SecurePass1");
    await submitLogin();
    expect(context.signIn).toHaveBeenCalledExactlyOnceWith("staff@hackuta.org", "SecurePass1");
    expect(currentPath()).toBe("/admin/applications");
  });

  it("shows the sign-in error and stays on the page", async () => {
    const context = signedOut({ signIn: vi.fn().mockRejectedValue(new Error("Invalid email or password.")) });
    await renderApp("/admin/login", context);
    await submitLogin();
    expect(container.textContent).toContain("Invalid email or password.");
    expect(currentPath()).toBe("/admin/login");
    expect(button("Sign in")?.disabled).toBe(false);
  });

  it("shows a fallback for a non-Error failure", async () => {
    await renderApp("/admin/login", signedOut({ signIn: vi.fn().mockRejectedValue("nope") }));
    await submitLogin();
    expect(container.textContent).toContain("Sign-in failed. Please try again.");
  });
});

describe("applications dashboard", () => {
  const summary = {
    applicationId: "app-1",
    applicantName: "Taylor Student",
    school: "UT Arlington",
    submittedAt: 1_700_000_000_000,
    reviewStatus: "under_review",
    currentReviewerName: null,
  };

  it("shows a loading state, then an empty state", async () => {
    mocks.query.mockReturnValue(undefined);
    await renderApp("/admin/applications", authContext());
    expect(container.textContent).toContain("Loading applications…");

    mocks.query.mockReturnValue([]);
    await renderApp("/admin/applications", authContext({ sessionToken: "t".repeat(64) }));
    expect(container.textContent).toContain("No submitted applications");
  });

  it("lists applications with a review link and never records activity", async () => {
    mocks.query.mockReturnValue([summary, { ...summary, applicationId: "app-2", reviewStatus: null }]);
    await renderApp("/admin/applications", authContext());

    expect(mocks.query).toHaveBeenCalledWith(listSubmittedApplicationsRef, { sessionToken: "s".repeat(64) });
    expect(container.querySelectorAll("article")).toHaveLength(2);
    expect(container.textContent).toContain("Under Review");
    expect(container.textContent).toContain("Unreviewed");
    expect(container.querySelector('a[href="/admin/applications/app-1"]')).not.toBeNull();
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("contains a query failure in the dashboard", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.query.mockImplementation(() => {
      throw new Error("Not authenticated");
    });
    await renderApp("/admin/applications", authContext());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Unable to load applications");
    expect(container.textContent).not.toContain("Not authenticated");
  });

  it("waits for a session token before querying", async () => {
    await render(
      <AdminAuthContext.Provider value={authContext({ sessionToken: null })}>
        <MemoryRouter initialEntries={["/admin/applications"]}>
          <App />
        </MemoryRouter>
      </AdminAuthContext.Provider>,
    );
    expect(container.textContent).toContain("Verifying organizer session…");
    expect(mocks.query).not.toHaveBeenCalled();
  });
});

describe("AdminAuthProvider", () => {
  function Probe() {
    const auth = useAdminAuth();
    return (
      <div>
        <output data-testid="state">
          {JSON.stringify({
            token: auth.sessionToken,
            ready: auth.sessionReady,
            loading: auth.isLoading,
            authed: auth.isAuthenticated,
          })}
        </output>
        <button type="button" onClick={() => void auth.signIn("a@hackuta.org", "pw").catch((e: Error) => {
          container.dataset.error = e.message;
        })}>
          in
        </button>
        <button type="button" onClick={() => void auth.signOut()}>
          out
        </button>
      </div>
    );
  }

  const state = () => JSON.parse(container.querySelector('[data-testid="state"]')!.textContent!);
  const token = "k".repeat(64);

  function stubApi(routes: Record<string, () => Response | Promise<Response>>) {
    const fetchMock = vi.fn(async (url: string) => routes[url]!());
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("loads the session from the cookie and looks up the staff profile", async () => {
    stubApi({ "/api/admin/session-token": () => new Response(token) });
    mocks.query.mockImplementation((_ref, args) => (args === "skip" ? undefined : staff));
    await render(<AdminAuthProvider><Probe /></AdminAuthProvider>);

    expect(state()).toEqual({ token, ready: true, loading: false, authed: true });
    expect(mocks.query).toHaveBeenLastCalledWith(getCurrentStaffRef, { sessionToken: token });
  });

  it("is signed out when there is no session cookie", async () => {
    stubApi({ "/api/admin/session-token": () => new Response(null, { status: 401 }) });
    mocks.query.mockReturnValue(undefined);
    await render(<AdminAuthProvider><Probe /></AdminAuthProvider>);

    expect(state()).toEqual({ token: null, ready: true, loading: false, authed: false });
    expect(mocks.query).toHaveBeenLastCalledWith(getCurrentStaffRef, "skip");
  });

  it("ignores a token that is too short", async () => {
    stubApi({ "/api/admin/session-token": () => new Response(" short ") });
    mocks.query.mockReturnValue(undefined);
    await render(<AdminAuthProvider><Probe /></AdminAuthProvider>);
    expect(state().token).toBeNull();
  });

  it("stores the new session after signing in", async () => {
    let cookie: string | null = null;
    const fetchMock = stubApi({
      "/api/admin/session-token": () => (cookie ? new Response(cookie) : new Response(null, { status: 401 })),
      "/api/admin/sign-in": () => {
        cookie = token;
        return Response.json({ ok: true, expiresAt: 5 });
      },
    });
    mocks.query.mockReturnValue(undefined);
    await render(<AdminAuthProvider><Probe /></AdminAuthProvider>);

    await act(async () => button("in")!.click());
    expect(state().token).toBe(token);
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/sign-in", expect.objectContaining({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ email: "a@hackuta.org", password: "pw" }),
    }));
  });

  it("reports a sign-in that sets no cookie", async () => {
    stubApi({
      "/api/admin/session-token": () => new Response(null, { status: 401 }),
      "/api/admin/sign-in": () => Response.json({ ok: true }),
    });
    mocks.query.mockReturnValue(undefined);
    await render(<AdminAuthProvider><Probe /></AdminAuthProvider>);
    await act(async () => button("in")!.click());
    expect(container.dataset.error).toMatch(/no session cookie/);
  });

  it.each([
    [{ error: "This account is inactive." }, "This account is inactive."],
    [{}, "Sign-in failed."],
  ])("passes on the sign-in API error %#", async (body, message) => {
    stubApi({
      "/api/admin/session-token": () => new Response(null, { status: 401 }),
      "/api/admin/sign-in": () => Response.json(body, { status: 403 }),
    });
    mocks.query.mockReturnValue(undefined);
    await render(<AdminAuthProvider><Probe /></AdminAuthProvider>);
    await act(async () => button("in")!.click());
    expect(container.dataset.error).toBe(message);
  });

  it("clears the session on sign-out even if the API call fails", async () => {
    stubApi({
      "/api/admin/session-token": () => new Response(token),
      "/api/admin/sign-out": () => Promise.reject(new Error("offline")),
    });
    mocks.query.mockReturnValue(staff);
    await render(<AdminAuthProvider><Probe /></AdminAuthProvider>);
    expect(state().token).toBe(token);

    await act(async () => button("out")!.click());
    expect(state().token).toBeNull();
  });

  it("requires the provider", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await render(<ErrorBoundary><Probe /></ErrorBoundary>);
    expect(container.textContent).toContain("useAdminAuth must be used within AdminAuthProvider");
    expect(container.textContent).toContain("Something went wrong");
  });
});

describe("review claim controls", () => {
  function detail(activity: Partial<ApplicationDetail["reviewActivity"]> = {}, reviewStatus: ApplicationDetail["reviewStatus"] = "under_review"): ApplicationDetail {
    return {
      application: {
        _id: "app-1" as GenericId<"applications">,
        _creationTime: 1,
        authUserId: "user" as GenericId<"users">,
        email: "taylor@example.com",
        createdAt: 1,
        formSubmitted: true,
      },
      reviewStatus,
      reviewActivity: {
        reviewedBy: null,
        currentReviewerName: null,
        startedAt: null,
        lastActiveAt: null,
        isFinal: false,
        isStale: false,
        activeReviewStaleMs: 1,
        ...activity,
      },
      resume: { status: "none", url: null, filename: null },
    };
  }

  const renderControls = (d: ApplicationDetail) =>
    render(<ApplicationReviewControls detail={d} sessionToken="tok" staffAdminId="staff-1" />);

  it("starts a review on an unclaimed application", async () => {
    await renderControls(detail());
    await act(async () => button("Start review")!.click());
    expect(mocks.mutationHook).toHaveBeenCalledWith(logApplicationReviewActionRef);
    expect(mocks.mutation).toHaveBeenCalledExactlyOnceWith({
      sessionToken: "tok",
      applicationId: "app-1",
      action: "started_review",
    });
    expect(container.textContent).toContain("Review started.");
  });

  it("lets the current reviewer refresh their claim", async () => {
    await renderControls(detail({ reviewedBy: "staff-1" as GenericId<"admins">, currentReviewerName: "Jordan Reviewer" }));
    expect(container.textContent).toContain("You are the current reviewer.");
    await act(async () => button("Refresh review activity")!.click());
    expect(container.textContent).toContain("Review activity refreshed.");
  });

  it("hides the start button while someone else is reviewing", async () => {
    await renderControls(detail({ reviewedBy: "staff-2" as GenericId<"admins">, currentReviewerName: "Riley" }));
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Riley is currently reviewing this application.");
    expect(button("Start review")).toBeUndefined();
  });

  it("allows taking over a stale claim", async () => {
    await renderControls(detail({ reviewedBy: "staff-2" as GenericId<"admins">, currentReviewerName: "Riley", isStale: true }));
    expect(container.textContent).toContain("The previous review session for Riley is stale");
    expect(button("Start review")).toBeDefined();
  });

  it("shows a final-decision notice instead of controls", async () => {
    await renderControls(detail({ isFinal: true }, "accepted"));
    expect(container.textContent).toContain("cannot be returned to active review");
    expect(container.querySelector("button")).toBeNull();
  });

  it.each([
    [new Error("Application is already being reviewed by another organizer."), "Application is already being reviewed by another organizer."],
    ["x", "Unable to start review."],
  ])("shows the claim error %#", async (failure, message) => {
    mocks.mutation.mockRejectedValue(failure);
    await renderControls(detail());
    await act(async () => button("Start review")!.click());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(message);
    expect(container.textContent).not.toContain("Review started.");
  });
});
