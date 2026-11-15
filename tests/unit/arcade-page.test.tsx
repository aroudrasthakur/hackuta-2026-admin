// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAuthContext, type AdminAuthContextValue } from "../../src/contexts/adminAuthContext";
import { getArcadeAdminRef, updateArcadeGameRef, updateArcadeSettingsRef } from "../../src/convex/arcadeApi";
import { ArcadePage } from "../../src/pages/admin/ArcadePage";

const query = vi.hoisted(() => vi.fn());
const mutate = vi.hoisted(() => vi.fn());

vi.mock("../../src/convex/reactBindings", () => ({
  useQuery: query,
  useMutation: (ref: unknown) => {
    if (ref === updateArcadeSettingsRef || ref === updateArcadeGameRef) return mutate;
    return vi.fn();
  },
}));

vi.mock("../../src/hooks/useNow", () => ({ useNow: () => 1_700_000_000_000 }));

const snapshot = {
  serverNow: 1_700_000_000_000,
  settings: {
    mode: "on" as const,
    launchEnabled: true,
    backupSignIn: false,
    updatedAt: 1_699_000_000_000,
  },
  state: { status: "on" as const, opensAt: null, closesAt: null, nextChangeAt: null },
  games: [
    { key: "olympus-slots", name: "Olympus Slots", order: 1, enabled: true, updatedAt: 1_699_000_000_000 },
  ],
};

let container: HTMLDivElement;
let root: Root;

const auth: AdminAuthContextValue = {
  staff: {
    adminId: "a1",
    email: "a@hackuta.dev",
    name: "Admin",
    role: "admin",
    canCheckIn: false,
    canFoodCheckIn: false,
    expiresAt: Date.now() + 3_600_000,
  },
  sessionToken: "token",
  authError: null,
  isLoading: false,
  sessionReady: true,
  isAuthenticated: true,
  signIn: vi.fn(),
  signOut: vi.fn(),
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  query.mockImplementation((ref) => (ref === getArcadeAdminRef ? snapshot : undefined));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("ArcadePage", () => {
  it("renders live status and games for administrators", async () => {
    await act(async () => {
      root.render(
        <AdminAuthContext.Provider value={auth}>
          <ArcadePage />
        </AdminAuthContext.Provider>,
      );
    });
    expect(container.querySelector("#arcade-heading")?.textContent).toBe("Arcade");
    expect(container.textContent).toContain("Live status");
    expect(container.textContent).toContain("Olympus Slots");
    expect(container.textContent).toContain("Save schedule");
  });
});