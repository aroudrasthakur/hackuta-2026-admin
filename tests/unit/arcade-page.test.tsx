// @vitest-environment happy-dom
import { act } from "react";
import { toDateTimeInputValue } from "../../src/lib/staffLogFormat";
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

const NOW = 1_700_000_000_000;
const HOUR = 3_600_000;

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
  mutate.mockReset();
  mutate.mockResolvedValue({ ok: true });
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

  async function renderPage(value: AdminAuthContextValue = auth) {
    await act(async () => {
      root.render(
        <AdminAuthContext.Provider value={value}>
          <ArcadePage />
        </AdminAuthContext.Provider>,
      );
    });
  }

  function radio(index: number) {
    return container.querySelectorAll<HTMLInputElement>('input[name="arcade-mode"]')[index]!;
  }

  function dateInputs() {
    return Array.from(container.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]'));
  }

  async function click(element: Element) {
    await act(async () => {
      (element as HTMLElement).click();
    });
  }

  async function setValue(element: HTMLInputElement, value: string) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  async function submit() {
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
  }

  function switchNamed(label: string) {
    return container.querySelector<HTMLButtonElement>(`button[role="switch"][aria-label="${label}"]`)!;
  }

  it("asks non-admin staff to wait for access", async () => {
    await renderPage({ ...auth, staff: { ...auth.staff!, role: "volunteer" } as AdminAuthContextValue["staff"] });
    expect(container.textContent).toContain("Checking access");
    expect(container.querySelector("form")).toBeNull();
  });

  it("shows a loading state while the snapshot loads", async () => {
    query.mockReturnValue(undefined);
    await renderPage();
    expect(container.textContent).toContain("Loading arcade controls");
    expect(container.querySelector("#arcade-heading")?.textContent).toBe("Arcade");
  });

  it("shows scheduled open and close times without an update time", async () => {
    query.mockReturnValue({
      ...snapshot,
      settings: { ...snapshot.settings, mode: "scheduled", opensAt: NOW + HOUR, closesAt: NOW + 2 * HOUR, updatedAt: 0 },
      state: { status: "scheduled", opensAt: NOW + HOUR, closesAt: NOW + 2 * HOUR, nextChangeAt: NOW + HOUR },
      games: [{ ...snapshot.games[0], enabled: false }],
    });
    await renderPage();
    expect(container.textContent).toContain("Scheduled");
    expect(container.textContent).toContain("Opens:");
    expect(container.textContent).toContain("Closes:");
    expect(container.textContent).not.toContain("last changed");
    expect(container.textContent).toContain("Paused");
    expect(dateInputs().map((input) => input.value)).toEqual([
      toDateTimeInputValue(NOW + HOUR),
      toDateTimeInputValue(NOW + 2 * HOUR),
    ]);
  });

  it("shows a closed arcade", async () => {
    query.mockReturnValue({
      ...snapshot,
      settings: { ...snapshot.settings, mode: "off" },
      state: { status: "off", opensAt: null, closesAt: null, nextChangeAt: null },
    });
    await renderPage();
    expect(container.textContent).toContain("Closed");
    expect(dateInputs()).toHaveLength(0);
  });

  it("saves the arcade switched off", async () => {
    await renderPage();
    await click(radio(0));
    await submit();
    expect(mutate).toHaveBeenCalledWith({
      sessionToken: "token",
      mode: "off",
      launchEnabled: true,
      backupSignIn: false,
      opensAt: null,
      closesAt: null,
    });
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Arcade schedule saved");
  });

  it("saves open-now with toggled sign-in options and an auto-close time", async () => {
    await renderPage();
    await click(switchNamed("Profile launch button"));
    await click(switchNamed("Arcade backup sign-in"));
    await setValue(dateInputs()[0]!, toDateTimeInputValue(NOW + HOUR));
    await submit();
    expect(mutate).toHaveBeenCalledWith({
      sessionToken: "token",
      mode: "on",
      launchEnabled: false,
      backupSignIn: true,
      opensAt: null,
      closesAt: new Date(toDateTimeInputValue(NOW + HOUR)).getTime(),
    });
  });

  it("saves open-now without an auto-close time", async () => {
    await renderPage();
    await submit();
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ mode: "on", opensAt: null, closesAt: null }));
  });

  it("rejects an auto-close time in the past", async () => {
    await renderPage();
    await setValue(dateInputs()[0]!, toDateTimeInputValue(NOW - 2 * HOUR));
    await submit();
    expect(mutate).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("close in the future");
  });

  it("requires both times for a scheduled window", async () => {
    await renderPage();
    await click(radio(1));
    expect(dateInputs()).toHaveLength(2);
    await submit();
    expect(mutate).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Enter an open and close time");
  });

  it("saves a scheduled window", async () => {
    await renderPage();
    await click(radio(1));
    const [opens, closes] = dateInputs();
    await setValue(opens!, toDateTimeInputValue(NOW + HOUR));
    await setValue(closes!, toDateTimeInputValue(NOW + 3 * HOUR));
    await submit();
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "scheduled",
        opensAt: new Date(toDateTimeInputValue(NOW + HOUR)).getTime(),
        closesAt: new Date(toDateTimeInputValue(NOW + 3 * HOUR)).getTime(),
      }),
    );
  });

  it("rejects a scheduled window longer than 72 hours", async () => {
    await renderPage();
    await click(radio(1));
    const [opens, closes] = dateInputs();
    await setValue(opens!, toDateTimeInputValue(NOW + HOUR));
    await setValue(closes!, toDateTimeInputValue(NOW + 100 * HOUR));
    await submit();
    expect(mutate).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("72 hours");
  });

  it("shows an error when saving fails and ignores a second submit while saving", async () => {
    let reject: (error: Error) => void = () => {};
    mutate.mockReturnValue(new Promise((_, r) => { reject = r; }));
    await renderPage();
    await submit();
    expect(container.textContent).toContain("Saving…");
    await submit();
    expect(mutate).toHaveBeenCalledTimes(1);
    await act(async () => {
      reject(new Error("boom"));
    });
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).toContain("Save schedule");
  });

  it("resets the draft to the saved settings", async () => {
    await renderPage();
    await click(radio(0));
    expect(radio(0).checked).toBe(true);
    const reset = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Reset")!;
    await click(reset);
    expect(radio(2).checked).toBe(true);
  });

  it("pauses and re-enables a game", async () => {
    await renderPage();
    await click(switchNamed("Olympus Slots enabled"));
    expect(mutate).toHaveBeenCalledWith({ sessionToken: "token", key: "olympus-slots", enabled: false });
    expect(container.querySelector('[role="status"]')?.textContent).toBe("olympus-slots paused.");

    query.mockReturnValue({ ...snapshot, games: [{ ...snapshot.games[0], enabled: false }] });
    await renderPage();
    await click(switchNamed("Olympus Slots enabled"));
    expect(container.querySelector('[role="status"]')?.textContent).toBe("olympus-slots enabled.");
  });

  it("shows an error when a game switch fails", async () => {
    mutate.mockRejectedValue(new Error("nope"));
    await renderPage();
    await click(switchNamed("Olympus Slots enabled"));
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(switchNamed("Olympus Slots enabled").disabled).toBe(false);
  });
});
