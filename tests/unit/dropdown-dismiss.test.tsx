// @vitest-environment happy-dom
import { useRef, useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDropdownDismiss } from "../../src/components/useDropdownDismiss";

function Harness({ open, onClose }: { open: boolean; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useDropdownDismiss(containerRef, open, onClose);
  return (
    <div ref={containerRef} data-testid="menu">
      <button type="button">Inside</button>
    </div>
  );
}

describe("useDropdownDismiss", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onClose = vi.fn();

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    onClose.mockReset();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("closes on an outside click or Escape, and ignores inside clicks and other keys", async () => {
    await act(async () => {
      root.render(<Harness open onClose={onClose} />);
    });

    const inside = container.querySelector("button")!;
    await act(async () => {
      inside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("does not listen while the menu is closed", async () => {
    function Closed() {
      const [open, setOpen] = useState(false);
      return <Harness open={open} onClose={() => setOpen(false)} />;
    }
    await act(async () => {
      root.render(<Closed />);
    });
    await act(async () => {
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
