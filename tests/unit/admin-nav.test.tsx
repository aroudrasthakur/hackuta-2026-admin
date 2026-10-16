// @vitest-environment happy-dom
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AdminNav } from "../../src/components/AdminNav";
import { ADMIN_ROUTES } from "../../src/types/routes";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

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

describe("AdminNav", () => {
  it("marks the active route with aria-current=page for NavLink styling", async () => {
    await act(async () =>
      root.render(
        <StrictMode>
          <MemoryRouter initialEntries={[ADMIN_ROUTES.applications]}>
            <AdminNav />
          </MemoryRouter>
        </StrictMode>,
      ),
    );

    const link = container.querySelector("a.admin-topbar__link");
    expect(link?.getAttribute("aria-current")).toBe("page");
  });
});
