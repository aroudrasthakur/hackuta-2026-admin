// @vitest-environment happy-dom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GenericId } from "convex/values";
import { AdminAuthContext, type AdminAuthContextValue } from "../../src/contexts/adminAuthContext";
import { listMyScanOptionsRef, type VolunteerScanOptions } from "../../src/convex/adminApi";
import { VolunteerDashboardPage } from "../../src/pages/admin/VolunteerDashboardPage";
import { VolunteerActionCard } from "../../src/components/volunteer/VolunteerActionCard";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("../../src/convex/reactBindings", () => ({
  useQuery: mocks.query,
}));

vi.mock("../../src/hooks/useNow", () => ({
  useNow: () => 1_700_000_000_000,
}));

let options: VolunteerScanOptions | undefined;
let container: HTMLDivElement;
let root: Root;

function auth(overrides: Partial<AdminAuthContextValue> = {}): AdminAuthContextValue {
  return {
    staff: {
      adminId: "volunteer",
      email: "v@example.com",
      name: "Avery Stone",
      role: "volunteer",
      canCheckIn: true,
      canFoodCheckIn: true,
      canRedeemShop: false,
      expiresAt: Date.now() + 60_000,
    },
    sessionToken: "session",
    authError: null,
    isLoading: false,
    sessionReady: true,
    isAuthenticated: true,
    signIn: vi.fn(),
    signOut: vi.fn(),
    ...overrides,
  };
}

async function render(ui: ReactElement, context = auth()) {
  await act(async () =>
    root.render(
      <AdminAuthContext.Provider value={context}>
        <MemoryRouter>{ui}</MemoryRouter>
      </AdminAuthContext.Provider>,
    ),
  );
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  options = {
    canCheckIn: true,
    canFoodCheckIn: true,
    canRedeemShop: false,
    events: [
      {
        eventId: "event-1" as GenericId<"events">,
        name: "Workshop",
        pointsAwarded: 25,
        startsAt: 1_699_000_000_000,
        endsAt: 1_701_000_000_000,
      },
    ],
  };
  mocks.query.mockImplementation((ref: unknown) => (ref === listMyScanOptionsRef ? options : undefined));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("VolunteerActionCard", () => {
  it("renders icon, title, description, and navigates", async () => {
    await render(
      <VolunteerActionCard
        to="/admin/scan/check-in"
        title="Participant Check-in"
        description="Confirm arrival."
        icon={<span data-testid="icon">✓</span>}
      />,
    );
    const link = container.querySelector("a.volunteer-action-card");
    expect(link?.getAttribute("href")).toBe("/admin/scan/check-in");
    expect(link?.textContent).toContain("Participant Check-in");
    expect(link?.textContent).toContain("Confirm arrival.");
    expect(container.querySelector('[data-testid="icon"]')).not.toBeNull();
  });
});

describe("VolunteerDashboardPage UI", () => {
  it("greets the volunteer and shows only permitted actions", async () => {
    await render(<VolunteerDashboardPage />);
    expect(container.querySelector("h1")?.textContent).toMatch(/Avery/);
    expect(container.textContent).toContain("Your responsibilities");
    expect(container.textContent).toContain("Participant Check-in");
    expect(container.textContent).toContain("Food Distribution");
    expect(container.textContent).toContain("Event Points");
    expect(container.textContent).not.toContain("Shop Redemption");
    expect(container.textContent).toContain("Workshop");
    expect(container.textContent).toContain("25 pts");
  });

  it("shows a helpful empty state when no capabilities are granted", async () => {
    options = { canCheckIn: false, canFoodCheckIn: false, canRedeemShop: false, events: [] };
    await render(
      <VolunteerDashboardPage />,
      auth({
        staff: {
          adminId: "volunteer",
          email: "v@example.com",
          name: "Riley",
          role: "volunteer",
          canCheckIn: false,
          canFoodCheckIn: false,
          canRedeemShop: false,
          expiresAt: Date.now() + 60_000,
        },
      }),
    );
    expect(container.textContent).toContain("No responsibilities assigned yet");
    expect(container.querySelector(".volunteer-action-card")).toBeNull();
  });

  it("shows a loading state while access is unresolved", async () => {
    options = undefined;
    await render(<VolunteerDashboardPage />);
    expect(container.textContent).toContain("Loading your responsibilities");
  });
});
