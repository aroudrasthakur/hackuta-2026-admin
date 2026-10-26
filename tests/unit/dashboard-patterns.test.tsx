// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { within } from "@testing-library/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminPageHeader } from "../../src/components/AdminPageHeader";
import { AdminStatusBadge } from "../../src/components/AdminStatusBadge";
import { LoadingState } from "../../src/components/states/LoadingState";
import { EmptyState } from "../../src/components/states/EmptyState";
import { QueryErrorState } from "../../src/components/states/QueryErrorState";

describe("shared dashboard patterns", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
  async function render(children: ReactNode) { await act(async () => root.render(children)); }

  it("exposes a page heading and optional action without duplicating identity", async () => {
    await render(<AdminPageHeader id="page" title="Applications" description="Submitted applications" actions={<button>Export</button>} />);
    expect(within(container).getByRole("heading", { level: 1 }).id).toBe("page");
    expect(container.textContent).toContain("Submitted applications");
    expect(within(container).getByRole("button", { name: "Export" })).toBeDefined();
    await render(<AdminPageHeader id="page" title="Volunteers" />);
    expect(within(container).queryByRole("button")).toBeNull();
  });
  it("keeps status text available independently of tone", async () => {
    await render(<><AdminStatusBadge>Pending</AdminStatusBadge><AdminStatusBadge tone="negative" label="Delivery: Failed">Failed</AdminStatusBadge></>);
    expect(container.textContent).toBe("PendingFailed");
    expect(within(container).getByLabelText("Delivery: Failed").textContent).toBe("Failed");
  });
  it("announces loading once and hides decorative skeletons", async () => {
    await render(<LoadingState layout="rows" message="Loading applications…" />);
    expect(within(container).getAllByRole("status")).toHaveLength(1);
    expect(within(container).getByRole("status").textContent).toBe("Loading applications…");
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    await render(<LoadingState />);
    expect(within(container).getByRole("status").textContent).toBe("Loading…");
  });
  it("offers recovery and supports empty states with or without actions", async () => {
    const retry = vi.fn();
    await render(<QueryErrorState title="Unable to load applications" onRetry={retry} />);
    expect(within(container).getByRole("alert").textContent).toContain("Check your connection");
    await act(async () => within(container).getByRole("button", { name: "Try again" }).click());
    expect(retry).toHaveBeenCalledOnce();
    await render(<EmptyState title="No results" description="Try another filter" action={<button>Clear filters</button>} />);
    expect(within(container).getByRole("button").textContent).toBe("Clear filters");
    await render(<EmptyState title="No responsibilities" />);
    expect(within(container).queryByRole("button")).toBeNull();
  });
});
