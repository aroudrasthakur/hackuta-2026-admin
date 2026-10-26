// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminLayout } from "../../src/layouts/AdminLayout";

vi.mock("../../src/components/StormPageFrame", () => ({
  StormPageFrame: ({ children }: { children: unknown }) => <div>{children}</div>,
}));
vi.mock("../../src/components/AdminAccountControls", () => ({
  AdminAccountControls: () => <div data-testid="account-controls" />,
}));
vi.mock("../../src/components/HackUtaLogo", () => ({
  HackUtaLogo: () => <div data-testid="logo" />,
}));
vi.mock("../../src/hooks/useAdminAuth", () => ({
  useAdminAuth: () => ({ staff: { role: "reviewer" } }),
}));
vi.mock("../../src/hooks/useVolunteerAccess", () => ({ useVolunteerAccess: () => undefined }));

describe("AdminLayout tabs", () => {
  let container: HTMLDivElement;
  let root: Root;

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

  async function renderAt(path: string) {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/admin" element={<AdminLayout />}>
              <Route path="applications" element={<div>Apps</div>} />
              <Route path="applications/:id" element={<div>Review</div>} />
              <Route path="decision-emails" element={<div>Emails</div>} />
            </Route>
          </Routes>
        </MemoryRouter>,
      );
    });
  }

  function tab(name: string) {
    return Array.from(container.querySelectorAll('[role="tab"]')).find((el) => el.textContent === name);
  }

  it("marks Applications active on the list and review routes", async () => {
    await renderAt("/admin/applications");
    expect(tab("Applications")?.getAttribute("aria-selected")).toBe("true");
    expect(tab("Decision emails")?.getAttribute("aria-selected")).toBe("false");

    await renderAt("/admin/applications/app-123");
    expect(tab("Applications")?.getAttribute("aria-selected")).toBe("true");
  });

  it("marks Decision emails active on the queue route", async () => {
    await renderAt("/admin/decision-emails");
    expect(tab("Decision emails")?.getAttribute("aria-selected")).toBe("true");
    expect(tab("Applications")?.getAttribute("aria-selected")).toBe("false");
  });
});
