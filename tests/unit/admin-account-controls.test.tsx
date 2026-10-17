// @vitest-environment happy-dom
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAccountControls } from "../../src/components/AdminAccountControls";
import { AdminAuthContext, type AdminAuthContextValue } from "../../src/contexts/adminAuthContext";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

const staff = {
  adminId: "a1",
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
    signIn: vi.fn(),
    signOut: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.spyOn(window, "matchMedia").mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function renderControls(context: AdminAuthContextValue) {
  await act(async () =>
    root.render(
      <StrictMode>
        <MemoryRouter>
          <AdminAuthContext.Provider value={context}>
            <AdminAccountControls />
          </AdminAuthContext.Provider>
        </MemoryRouter>
      </StrictMode>,
    ),
  );
}

describe("AdminAccountControls", () => {
  it("exposes Sign out as a menuitem in compact mode", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);

    await renderControls(authContext());
    const trigger = container.querySelector(".admin-topbar__chip") as HTMLButtonElement;
    await act(async () => trigger.click());

    const menu = container.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    const signOut = menu?.querySelector('[role="menuitem"]');
    expect(signOut?.textContent).toBe("Sign out");
    expect(container.querySelector(".admin-topbar__sign-out")).toBeNull();
  });

  it("shows a standalone Sign out control on wide layouts", async () => {
    await renderControls(authContext());
    expect(container.querySelector(".admin-topbar__sign-out")?.textContent).toBe("Sign out");
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });
});
