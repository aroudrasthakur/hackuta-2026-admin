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
import { UserFacingError } from "../../src/lib/userFacingError";
import {
  ADMIN_ERROR_MESSAGES,
  adminError,
  GENERIC_ERROR_MESSAGE,
  SIGN_IN_FAILED_MESSAGE,
} from "../../shared/admin/errors";

vi.mock("../../src/components/SignInStormBackdrop", () => ({
  SignInStormBackdrop: ({ active }: { active?: boolean }) => (
    <div data-testid="storm-backdrop" data-active={active ? "true" : "false"} />
  ),
}));

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
  useAction: () => vi.fn(),
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
  staff.expiresAt = Date.now() + 60_000;
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
  vi.useRealTimers();
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
    staff: signedIn ? initial.staff ?? staff : null,
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
  it.each(["/admin/login", "/admin/applications", "/admin/applications/app-1", "/admin/decision-emails", "/"])(
    "sends volunteers from %s to their own landing page without review queries", async (path) => {
      await renderApp(path, authContext({ staff: { ...staff, role: "volunteer" } }));
      expect(currentPath()).toBe("/volunteer");
      expect(container.querySelector("h1")?.textContent).toBe("Volunteer access");
      expect(container.textContent).toContain("Not assigned");
      expect(container.querySelector('nav[aria-label="Admin"]')).toBeNull();
      expect(mocks.query).not.toHaveBeenCalled();
      expect(mocks.paginatedQuery).not.toHaveBeenCalled();
    },
  );

  it("shows volunteer capabilities and permits signing out", async () => {
    const context = authContext({ staff: { ...staff, role: "volunteer", canCheckIn: true, canFoodCheckIn: true } });
    await renderApp("/volunteer", context);
    expect(Array.from(container.querySelectorAll("dd"), (node) => node.textContent)).toEqual(["Enabled", "Enabled"]);
    await act(async () => button("Sign out")!.click());
    expect(currentPath()).toBe("/admin/login");
    expect(context.signOut).toHaveBeenCalledOnce();
  });

  it.each(["reviewer", "admin"] as const)("redirects a %s away from volunteer operations", async (role) => {
    await renderApp("/volunteer", authContext({ staff: { ...staff, role } }));
    expect(currentPath()).toBe("/admin/applications");
  });

  it("sends a signed-out volunteer visitor to login", async () => {
    await renderApp("/volunteer", authContext({ staff: null, isAuthenticated: false, sessionToken: null }));
    expect(currentPath()).toBe("/admin/login");
  });
  it.each(["/", "/admin", "/unknown"])("sends %s to the applications page", async (path) => {
    await renderApp(path, authContext());
    expect(currentPath()).toBe("/admin/applications");
    expect(container.textContent).toContain("Jordan Reviewer");
    expect(container.textContent).toContain("Reviewer");
    expect(container.querySelector('nav[aria-label="Admin"]')?.textContent).toContain("Decision emails");
    expect(container.textContent).toMatch(/Jordan Reviewer\s*·\s*Reviewer/);
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

  it("disables sign-out while the request is pending", async () => {
    let finish!: () => void;
    const context = authContext({ signOut: vi.fn(() => new Promise<void>((resolve) => { finish = resolve; })) });
    await renderApp("/admin/applications", context);
    await act(async () => button("Sign out")!.click());
    expect(button("Signing out…")?.disabled).toBe(true);
    await act(async () => button("Signing out…")!.click());
    expect(context.signOut).toHaveBeenCalledOnce();
    await act(async () => finish());
    expect(currentPath()).toBe("/admin/login");
  });

  it("allows retrying a failed sign-out", async () => {
    const signOut = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    await renderApp("/admin/applications", authContext({ signOut }));
    await act(async () => button("Sign out")!.click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Unable to sign out");
    expect(button("Sign out")?.disabled).toBe(false);
    expect(currentPath()).toBe("/admin/applications");
    await act(async () => button("Sign out")!.click());
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
    const context = signedOut({
      signIn: vi.fn().mockRejectedValue(new UserFacingError(ADMIN_ERROR_MESSAGES.INVALID_CREDENTIALS)),
    });
    await renderApp("/admin/login", context);
    await submitLogin();
    expect(container.textContent).toContain(ADMIN_ERROR_MESSAGES.INVALID_CREDENTIALS);
    expect(currentPath()).toBe("/admin/login");
    expect(button("Sign in")?.disabled).toBe(false);
  });

  it.each([["a non-Error failure", "nope"], ["a raw network error", new TypeError("Failed to fetch")]])(
    "shows a fallback for %s",
    async (_label, failure) => {
      await renderApp("/admin/login", signedOut({ signIn: vi.fn().mockRejectedValue(failure) }));
      await submitLogin();
      expect(container.textContent).toContain(SIGN_IN_FAILED_MESSAGE);
      expect(container.textContent).not.toContain("Failed to fetch");
    },
  );
});

describe("applications dashboard", () => {
  const summary = {
    applicationId: "app-1",
    applicantName: "Taylor Student",
    school: "UT Arlington",
    submittedAt: 1_700_000_000_000,
    reviewStatus: "under_review" as const,
    currentReviewerName: "Jordan Reviewer",
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
    expect(container.textContent).toContain("In review");
    expect(container.textContent).toContain("Need review");
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
        <output data-testid="auth-error">{auth.authError ?? ""}</output>
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
  const authErrorText = () => container.querySelector('[data-testid="auth-error"]')!.textContent;
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
    expect(container.dataset.error).toMatch(/couldn't start your session/);
  });

  it.each([
    [Response.json({ code: "ACCOUNT_INACTIVE", error: "x" }, { status: 403 }), ADMIN_ERROR_MESSAGES.ACCOUNT_INACTIVE],
    [Response.json({ error: "Raw server detail" }, { status: 500 }), SIGN_IN_FAILED_MESSAGE],
    [Response.json({ code: "UNKNOWN", error: "Raw server detail" }, { status: 401 }), SIGN_IN_FAILED_MESSAGE],
    [new Response("Internal Server Error", { status: 500 }), SIGN_IN_FAILED_MESSAGE],
  ])("maps the sign-in API error %#", async (response, message) => {
    stubApi({
      "/api/admin/session-token": () => new Response(null, { status: 401 }),
      "/api/admin/sign-in": () => response,
    });
    mocks.query.mockReturnValue(undefined);
    await render(<AdminAuthProvider><Probe /></AdminAuthProvider>);
    await act(async () => button("in")!.click());
    expect(container.dataset.error).toBe(message);
  });

  it("clears the session after a successful sign-out", async () => {
    stubApi({
      "/api/admin/session-token": () => new Response(token),
      "/api/admin/sign-out": () => Response.json({ ok: true }),
    });
    mocks.query.mockImplementation((_ref, args) => args === "skip" ? undefined : staff);
    await render(<AdminAuthProvider><Probe /></AdminAuthProvider>);
    expect(state().token).toBe(token);

    await act(async () => button("out")!.click());
    expect(state().token).toBeNull();
    expect(state().authed).toBe(false);
  });

  it.each([
    ["network failure", () => Promise.reject(new Error("offline"))],
    ["HTTP failure", () => Promise.resolve(new Response(null, { status: 503 }))],
  ] as const)("keeps the session and allows retrying sign-out after a %s", async (_label, failure) => {
    const signOutRequest = vi.fn<() => Promise<Response>>()
      .mockImplementationOnce(failure)
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const fetchMock = stubApi({
      "/api/admin/session-token": () => new Response(token),
      "/api/admin/sign-out": signOutRequest,
    });
    mocks.query.mockImplementation((ref, args) => {
      if (ref === getCurrentStaffRef) return args === "skip" ? undefined : staff;
      return [];
    });
    await render(
      <AdminAuthProvider>
        <MemoryRouter initialEntries={["/admin/applications"]}>
          <App />
          <CurrentPath />
        </MemoryRouter>
      </AdminAuthProvider>,
    );

    await act(async () => button("Sign out")!.click());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Unable to sign out. Please try again.");
    expect(currentPath()).toBe("/admin/applications");
    expect(button("Sign out")?.disabled).toBe(false);
    expect(mocks.query.mock.calls.filter(([ref]) => ref === getCurrentStaffRef).at(-1)?.[1]).toEqual({ sessionToken: token });

    await act(async () => button("Sign out")!.click());
    expect(signOutRequest).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/sign-out", { method: "POST", credentials: "include" });
    expect(currentPath()).toBe("/admin/login");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(mocks.query.mock.calls.filter(([ref]) => ref === getCurrentStaffRef).at(-1)?.[1]).toBe("skip");
  });

  it("requires the provider and keeps the developer error out of the page", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    await render(<ErrorBoundary><Probe /></ErrorBoundary>);
    expect(container.textContent).toContain(GENERIC_ERROR_MESSAGE);
    expect(container.textContent).not.toContain("useAdminAuth must be used within AdminAuthProvider");
    expect(consoleError).toHaveBeenCalledWith(
      "Uncaught render error",
      expect.objectContaining({ message: "useAdminAuth must be used within AdminAuthProvider" }),
      expect.anything(),
    );
  });

  it("shows the catalog message for a coded error in the boundary", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    function Thrower(): ReactNode {
      throw adminError("ADMIN_ONLY");
    }
    await render(<ErrorBoundary><Thrower /></ErrorBoundary>);
    expect(container.textContent).toContain(ADMIN_ERROR_MESSAGES.ADMIN_ONLY);
    expect(container.textContent).not.toContain("{");
  });

  it("tells the organizer when a live session expires", async () => {
    stubApi({ "/api/admin/session-token": () => new Response(token) });
    mocks.query.mockReturnValue(staff);
    await render(<AdminAuthProvider><Probe /></AdminAuthProvider>);
    expect(state().authed).toBe(true);
    expect(authErrorText()).toBe("");

    mocks.query.mockReturnValue(null);
    await render(<AdminAuthProvider><Probe /></AdminAuthProvider>);
    expect(authErrorText()).toBe(ADMIN_ERROR_MESSAGES.NOT_AUTHENTICATED);
    expect(state().token).toBeNull();
    expect(state().authed).toBe(false);
  });

  it("discards an already invalid cookie session on startup", async () => {
    stubApi({ "/api/admin/session-token": () => new Response(token) });
    mocks.query.mockImplementation((_ref, args) => args === "skip" ? undefined : null);
    await render(<AdminAuthProvider><Probe /></AdminAuthProvider>);
    expect(state()).toEqual({ token: null, ready: true, loading: false, authed: false });
    expect(authErrorText()).toBe(ADMIN_ERROR_MESSAGES.NOT_AUTHENTICATED);
  });

  it("returns a quiet volunteer tab to login at expiry without another query update", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    const volunteer = { ...staff, role: "volunteer", expiresAt: Date.now() + 1000 };
    stubApi({ "/api/admin/session-token": () => new Response(token) });
    mocks.query.mockImplementation((_ref, args) => args === "skip" ? undefined : volunteer);
    await render(<AdminAuthProvider><MemoryRouter initialEntries={["/volunteer"]}><App /><CurrentPath /></MemoryRouter></AdminAuthProvider>);
    expect(currentPath()).toBe("/volunteer");
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(currentPath()).toBe("/admin/login");
    expect(container.textContent).toContain(ADMIN_ERROR_MESSAGES.NOT_AUTHENTICATED);
    expect(mocks.query).toHaveBeenLastCalledWith(getCurrentStaffRef, "skip");
  });

  it.each(["focus", "visibilitychange"])("checks expiry on %s when returning from a suspended tab", async (event) => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    const expiresAt = Date.now() + 1000;
    stubApi({ "/api/admin/session-token": () => new Response(token) });
    mocks.query.mockImplementation((_ref, args) => args === "skip" ? undefined : { ...staff, expiresAt });
    await render(<AdminAuthProvider><Probe /></AdminAuthProvider>);
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(state().authed).toBe(true);
    vi.setSystemTime(expiresAt);
    await act(async () => {
      (event === "focus" ? window : document).dispatchEvent(new Event(event));
    });
    expect(state().token).toBeNull();
    expect(authErrorText()).toBe(ADMIN_ERROR_MESSAGES.NOT_AUTHENTICATED);
  });

  it("returns a volunteer to login after server revocation", async () => {
    stubApi({ "/api/admin/session-token": () => new Response(token) });
    mocks.query.mockReturnValue({ ...staff, role: "volunteer" });
    const app = <AdminAuthProvider><MemoryRouter initialEntries={["/volunteer"]}><App /><CurrentPath /></MemoryRouter></AdminAuthProvider>;
    await render(app);
    expect(currentPath()).toBe("/volunteer");
    mocks.query.mockReturnValue(null);
    // Re-render the existing provider so it observes the reactive server update.
    await render(<AdminAuthProvider><MemoryRouter initialEntries={["/volunteer"]}><App /><CurrentPath /></MemoryRouter></AdminAuthProvider>);
    expect(currentPath()).toBe("/admin/login");
    expect(container.textContent).toContain(ADMIN_ERROR_MESSAGES.NOT_AUTHENTICATED);
  });

  it("hides network details when the session check fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    stubApi({ "/api/admin/session-token": () => Promise.reject(new TypeError("Failed to fetch")) });
    mocks.query.mockReturnValue(undefined);
    await render(<AdminAuthProvider><Probe /></AdminAuthProvider>);
    expect(authErrorText()).toBe("We couldn't check your sign-in status. Refresh the page to try again.");
    expect(state().ready).toBe(true);
    expect(consoleError).toHaveBeenCalledWith("Unable to initialize organizer authentication", {
      source: "AdminAuthProvider.bootstrap",
      convexRequestId: null,
      errorName: "TypeError",
      errorMessage: "Failed to fetch",
    });
  });

  it("keeps the local dev sign-in hint for developers", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("VITE_DEV_AUTH_BYPASS", "true");
    try {
      stubApi({
        "/api/admin/dev-sign-in": () =>
          Response.json({ error: "Set ADMIN_DEV_AUTH_EMAIL and ADMIN_DEV_AUTH_PASSWORD in .env.local." }, { status: 503 }),
      });
      mocks.query.mockReturnValue(undefined);
      await render(<AdminAuthProvider><Probe /></AdminAuthProvider>);
      expect(authErrorText()).toBe("Set ADMIN_DEV_AUTH_EMAIL and ADMIN_DEV_AUTH_PASSWORD in .env.local.");
    } finally {
      vi.unstubAllEnvs();
    }
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
      pendingDecision: null,
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
    [adminError("REVIEW_CLAIMED"), ADMIN_ERROR_MESSAGES.REVIEW_CLAIMED],
    [new Error("[CONVEX M(admin/x)] [Request ID: abc] Server Error"), "We couldn't start the review. Please try again."],
    ["x", "We couldn't start the review. Please try again."],
  ])("shows the claim error %#", async (failure, message) => {
    mocks.mutation.mockRejectedValue(failure);
    await renderControls(detail());
    await act(async () => button("Start review")!.click());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(message);
    expect(container.textContent).not.toContain("Review started.");
  });
});
