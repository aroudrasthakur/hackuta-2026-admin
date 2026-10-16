// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResumePreview } from "../../src/components/ResumePreview";

vi.mock("../../src/components/ResumePdf", () => ({ default: ({ url, onClose }: { url: string; onClose: () => void }) => <div data-pdf-url={url}>PDF viewer<button onClick={onClose}>Close</button></div> }));
describe("resume preview modal", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
    vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); });
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });
  async function render() {
    await act(async () => root.render(<ResumePreview resume={{ status: "available", url: "https://example.com/resume.pdf", filename: "Resume.pdf" }} />));
  }
  it.each(["button", "escape"])("opens only on demand and restores focus after %s closes it", async (method) => {
    await render();
    expect(container.querySelector("[data-pdf-url]")).toBeNull();
    const trigger = container.querySelector("button")!;
    await act(async () => trigger.click());
    const dialog = container.querySelector("dialog")!;
    expect(dialog.open).toBe(true);
    expect(container.querySelector("[data-pdf-url]")?.getAttribute("data-pdf-url")).toBe("https://example.com/resume.pdf");
    expect(container.querySelectorAll("a")).toHaveLength(0);
    await act(async () => {
      if (method === "button") dialog.querySelector("button")!.click();
      else dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    expect(dialog.open).toBe(false);
    expect(container.querySelector("[data-pdf-url]")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
  it("explains unsupported files without offering a broken PDF preview", async () => {
    await act(async () => root.render(<ResumePreview resume={{ status: "available", url: "https://example.com/resume.docx", filename: "Resume.docx" }} />));
    expect(container.textContent).toContain("This file format is not supported.");
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
  });

});
