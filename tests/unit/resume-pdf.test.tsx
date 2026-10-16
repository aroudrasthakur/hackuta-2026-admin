// @vitest-environment happy-dom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ResumePdf from "../../src/components/ResumePdf";

const mocks = vi.hoisted(() => ({ document: {} as Record<string, unknown>, page: {} as Record<string, unknown> }));
vi.mock("react-pdf", () => ({
  pdfjs: { GlobalWorkerOptions: {} },
  Document: (props: ComponentProps<typeof import("react-pdf").Document>) => {
    mocks.document = props as Record<string, unknown>;
    return <div>{props.children}</div>;
  },
  Page: (props: ComponentProps<typeof import("react-pdf").Page>) => {
    mocks.page = props as Record<string, unknown>;
    return <div data-page={props.pageNumber} data-width={props.width} />;
  },
}));

describe("resume PDF controls and recovery", () => {
  let container: HTMLDivElement;
  let root: Root;
  const disconnect = vi.fn();
  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.stubGlobal("ResizeObserver", class {
      callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) { this.callback = callback; }
      observe(element: Element) { this.callback([{ contentRect: { width: 600 }, target: element } as ResizeObserverEntry], this as unknown as ResizeObserver); }
      disconnect = disconnect;
    });
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root.render(<ResumePdf url="https://example.com/resume.pdf" onClose={vi.fn()} />));
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
  const click = async (name: string) => {
    const button = Array.from(container.querySelectorAll("button")).find((b) => (b.getAttribute("aria-label") || b.textContent) === name)!;
    await act(async () => button.click());
  };
  async function loaded() {
    await act(async () => (mocks.document.onLoadSuccess as (pdf: { numPages: number }) => void)({ numPages: 2 }));
  }
  it("loads the existing URL and supports bounded page navigation", async () => {
    expect(mocks.document.file).toBe("https://example.com/resume.pdf");
    await loaded();
    expect(container.textContent).toContain("Page 1 of 2");
    expect(container.querySelector("button")?.disabled).toBe(true);
    await click("Next");
    expect(mocks.page.pageNumber).toBe(2);
    expect(container.textContent).toContain("Page 2 of 2");
    await click("Previous");
    expect(mocks.page.pageNumber).toBe(1);
    expect(container.querySelectorAll("a, iframe, object, embed")).toHaveLength(0);
    expect(mocks.page.renderAnnotationLayer).toBe(false);
  });
  it("fits the available width, zooms, and resets zoom", async () => {
    await loaded();
    expect(mocks.page.width).toBe(568);
    await click("Zoom in"); expect(mocks.page.width).toBe(710);
    await click("Zoom out"); expect(mocks.page.width).toBe(568);
    await click("Zoom out"); expect(mocks.page.width).toBe(426);
    await click("Fit width");
    for (let i = 0; i < 4; i++) await click("Zoom in");
    expect(container.textContent).toContain("200%");
    await click("Fit width"); expect(mocks.page.width).toBe(568);
  });
  it.each(["onLoadError", "onSourceError", "onPassword"])("shows a recoverable error for %s", async (callback) => {
    await act(async () => (mocks.document[callback] as () => void)());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Unable to load this resume");
    await click("Try again");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await loaded(); expect(container.textContent).toContain("Page 1 of 2");
  });
  it.each(["onLoadError", "onRenderError"])("reports page errors from %s", async (callback) => {
    await loaded();
    await act(async () => (mocks.page[callback] as () => void)());
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });
});
