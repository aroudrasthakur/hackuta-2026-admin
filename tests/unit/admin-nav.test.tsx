// @vitest-environment happy-dom
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AdminAccountControls } from "../../src/components/AdminAccountControls";
import { AdminAuthContext, type AdminAuthContextValue } from "../../src/contexts/adminAuthContext";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

const auth: AdminAuthContextValue = {
  staff: { adminId: "1", email: "a@b.com", name: "Staff", role: "reviewer", expiresAt: Date.now() + 60_000 },
  sessionToken: "token",
  authError: null,
  isAuthenticated: true,
  isLoading: false,
  sessionReady: true,
  signIn: async () => {},
  signOut: async () => {},
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("AdminLayout navigation", () => {
  it("does not render a separate Applications nav button in the top bar", async () => {
    await act(async () =>
      root.render(
        <StrictMode>
          <AdminAuthContext.Provider value={auth}>
            <MemoryRouter initialEntries={["/admin/applications"]}>
              <header className="admin-topbar admin-topbar--compact">
                <div className="admin-topbar__inner admin-topbar__inner--compact">
                  <div className="admin-topbar__brand">
                    <img src="/images/logos/hackuta-logo-240.webp" alt="HackUTA" className="admin-topbar__logo" />
                  </div>
                  <AdminAccountControls />
                </div>
              </header>
              <Routes>
                <Route path="/admin/applications" element={<div>Applications</div>} />
              </Routes>
            </MemoryRouter>
          </AdminAuthContext.Provider>
        </StrictMode>,
      ),
    );

    expect(container.querySelector('nav[aria-label="Admin"] a')).toBeNull();
    expect(container.querySelector('img.admin-topbar__logo[alt="HackUTA"]')).not.toBeNull();
  });
});
