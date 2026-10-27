// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const detector = vi.hoisted(() => ({ detect: vi.fn(), load: vi.fn() }));
vi.mock("../../src/lib/qrDetector", () => ({ loadQrDetector: detector.load }));

import type { ScanMode } from "../../src/components/volunteer/QrScanner";

const { QrScanner } = await import("../../src/components/volunteer/QrScanner");
const { isCameraSupported, QR_SCAN_INTERVAL_MS } = await import("../../src/hooks/useQrCamera");

const token = "ab".repeat(32);

class FakeTrack extends EventTarget {
  readyState: "live" | "ended" = "live";
  stop = vi.fn(() => {
    this.readyState = "ended";
  });
}

function fakeStream() {
  const track = new FakeTrack();
  return { track, stream: { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream };
}

const getUserMedia = vi.fn();
const readText = vi.fn();
let permission: { state: PermissionState; onchange: (() => void) | null };
let container: HTMLDivElement;
let root: Root;
let onScan: ReturnType<typeof vi.fn>;
const sources = new WeakMap<HTMLMediaElement, unknown>();

function defineNavigator(name: string, value: unknown) {
  Object.defineProperty(navigator, name, { value, configurable: true });
}

async function render(props: { autoStart?: boolean; mode?: ScanMode } = {}) {
  await act(async () => root.render(<QrScanner mode="registration" onScan={onScan} {...props} />));
}

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function button(name: string) {
  return Array.from(container.querySelectorAll("button")).find((element) => element.textContent === name);
}

async function click(name: string) {
  await act(async () => button(name)!.click());
  await flush();
}

const video = () => container.querySelector("video")!;
const message = () => container.querySelector('[role="status"], [role="alert"]')?.textContent;

async function typeCode(value: string) {
  const input = container.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submitCode() {
  await act(async () => container.querySelector("form")!.requestSubmit());
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  onScan = vi.fn();
  permission = { state: "granted", onchange: null };
  getUserMedia.mockReset();
  readText.mockReset();
  detector.detect.mockReset().mockResolvedValue([]);
  detector.load.mockReset().mockResolvedValue({ detect: detector.detect });
  defineNavigator("mediaDevices", { getUserMedia });
  defineNavigator("permissions", { query: vi.fn(async () => permission) });
  defineNavigator("clipboard", { readText });
  Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
    configurable: true,
    get() { return sources.get(this) ?? null; },
    set(value) { sources.set(this, value); },
  });
  Object.defineProperty(HTMLMediaElement.prototype, "readyState", { configurable: true, get: () => 4 });
  HTMLMediaElement.prototype.play = vi.fn(async () => undefined);
  HTMLMediaElement.prototype.pause = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("camera scanning", () => {
  it("starts only on request, reports one detection, and releases the camera", async () => {
    const { stream, track } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    detector.detect.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("bad frame")).mockResolvedValue([{ rawValue: token }]);
    await render();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(video().srcObject).toBeNull();

    await click("Scan with camera");
    expect(getUserMedia).toHaveBeenCalledWith({ audio: false, video: { facingMode: { ideal: "environment" } } });
    expect(video().srcObject).toBe(stream);
    expect(message()).toBe("Point the camera at the registration QR on the participant's phone.");
    expect(button("Stop camera and enter code")).toBeDefined();

    await flush(QR_SCAN_INTERVAL_MS * 3);
    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith(token, "camera");
    expect(track.stop).toHaveBeenCalled();
    expect(video().srcObject).toBeNull();
    await flush(QR_SCAN_INTERVAL_MS * 3);
    expect(detector.detect).toHaveBeenCalledTimes(3);
    expect(button("Scan with camera")).toBeDefined();
  });

  it("stops scanning when the volunteer switches to manual entry", async () => {
    const { stream, track } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    await render();
    await click("Scan with camera");
    await click("Stop camera and enter code");
    expect(track.stop).toHaveBeenCalled();
    await flush(QR_SCAN_INTERVAL_MS * 3);
    expect(detector.detect).toHaveBeenCalledTimes(1);
    expect(message()).toBeUndefined();
  });

  it("starts automatically only when asked to", async () => {
    getUserMedia.mockResolvedValue(fakeStream().stream);
    await render({ autoStart: true });
    await flush();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["NotAllowedError", "Camera access is blocked"],
    ["SecurityError", "Camera access is blocked"],
    ["NotFoundError", "No camera was found"],
    ["OverconstrainedError", "No camera was found"],
    ["NotReadableError", "in use by another app"],
    ["NotSupportedError", "isn't available here"],
    ["TypeError", "couldn't start"],
  ])("explains a %s from the camera", async (name, text) => {
    getUserMedia.mockRejectedValue(new DOMException("camera failed", name));
    await render();
    await click("Scan with camera");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(text);
    expect(container.querySelector("input")).not.toBeNull();
  });

  it("offers a retry when the QR reader cannot load", async () => {
    const { stream, track } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    detector.load.mockRejectedValue(new Error("wasm blocked"));
    await render();
    await click("Scan with camera");
    expect(message()).toContain("QR reader couldn't start");
    expect(track.stop).toHaveBeenCalled();
    expect(button("Try camera again")).toBeDefined();
  });

  it("reports a camera that ends or loses permission", async () => {
    const first = fakeStream();
    getUserMedia.mockResolvedValue(first.stream);
    await render();
    await click("Scan with camera");
    await act(async () => first.track.dispatchEvent(new Event("ended")));
    expect(message()).toContain("The camera stopped");

    const second = fakeStream();
    getUserMedia.mockResolvedValue(second.stream);
    await click("Try camera again");
    permission.state = "denied";
    await act(async () => permission.onchange?.());
    expect(second.track.stop).toHaveBeenCalled();
    expect(message()).toContain("Camera access is blocked");
  });

  it("ignores a permission change that still allows the camera", async () => {
    getUserMedia.mockResolvedValue(fakeStream().stream);
    await render();
    await click("Scan with camera");
    await act(async () => permission.onchange?.());
    expect(message()).toBe("Point the camera at the registration QR on the participant's phone.");
  });

  it("pauses when the page is hidden or left", async () => {
    const first = fakeStream();
    getUserMedia.mockResolvedValue(first.stream);
    await render();
    await click("Scan with camera");
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(first.track.stop).not.toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(first.track.stop).toHaveBeenCalled();
    expect(message()).toContain("turned off while this page was in the background");

    const second = fakeStream();
    getUserMedia.mockResolvedValue(second.stream);
    await click("Try camera again");
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    expect(second.track.stop).toHaveBeenCalled();
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });

  it("releases a camera that opens after the scanner unmounts", async () => {
    const { stream, track } = fakeStream();
    let resolveStream!: (value: MediaStream) => void;
    getUserMedia.mockReturnValue(new Promise((resolve) => { resolveStream = resolve; }));
    await render();
    await act(async () => button("Scan with camera")!.click());
    await act(async () => root.unmount());
    await act(async () => resolveStream(stream));
    expect(track.stop).toHaveBeenCalled();
    root = createRoot(container);
  });

  it("releases tracks on unmount and ignores late permission results", async () => {
    const { stream, track } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    let resolvePermission!: (value: typeof permission) => void;
    defineNavigator("permissions", { query: () => new Promise((resolve) => { resolvePermission = resolve; }) });
    await render();
    await click("Scan with camera");
    await act(async () => root.unmount());
    expect(track.stop).toHaveBeenCalled();
    await act(async () => resolvePermission(permission));
    expect(permission.onchange).toBeNull();
    root = createRoot(container);
  });

  it("stops quietly if the scanner unmounts while the QR reader loads", async () => {
    const { stream, track } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    let resolveDetector!: (value: unknown) => void;
    detector.load.mockReturnValue(new Promise((resolve) => { resolveDetector = resolve; }));
    await render();
    await act(async () => button("Scan with camera")!.click());
    await flush();
    await act(async () => root.unmount());
    await act(async () => resolveDetector({ detect: detector.detect }));
    expect(track.stop).toHaveBeenCalled();
    expect(detector.detect).not.toHaveBeenCalled();
    root = createRoot(container);
  });

  it("waits for video frames before decoding", async () => {
    Object.defineProperty(HTMLMediaElement.prototype, "readyState", { configurable: true, get: () => 0 });
    getUserMedia.mockResolvedValue(fakeStream().stream);
    await render();
    await click("Scan with camera");
    await flush(QR_SCAN_INTERVAL_MS * 2);
    expect(detector.detect).not.toHaveBeenCalled();
  });

  it("ignores a decode that finishes after scanning stopped", async () => {
    getUserMedia.mockResolvedValue(fakeStream().stream);
    let resolveDetect!: (value: unknown) => void;
    detector.detect.mockReturnValue(new Promise((resolve) => { resolveDetect = resolve; }));
    await render();
    await click("Scan with camera");
    await click("Stop camera and enter code");
    await act(async () => resolveDetect([{ rawValue: token }]));
    expect(onScan).not.toHaveBeenCalled();
  });

  it("falls back to manual entry without camera support", async () => {
    defineNavigator("mediaDevices", undefined);
    expect(isCameraSupported()).toBe(false);
    await render();
    expect(message()).toContain("isn't available here");
    expect(button("Scan with camera")).toBeUndefined();
    expect(container.querySelector("input")).not.toBeNull();
  });

  it("works without the Permissions API", async () => {
    defineNavigator("permissions", undefined);
    getUserMedia.mockResolvedValue(fakeStream().stream);
    await render();
    await click("Scan with camera");
    expect(message()).toBe("Point the camera at the registration QR on the participant's phone.");
  });

  it("tolerates a Permissions API that rejects camera queries", async () => {
    defineNavigator("permissions", { query: () => Promise.reject(new TypeError("camera is not a permission name")) });
    getUserMedia.mockResolvedValue(fakeStream().stream);
    await render();
    await click("Scan with camera");
    expect(message()).toBe("Point the camera at the registration QR on the participant's phone.");
  });

  it("reports support changing after render", async () => {
    await render();
    defineNavigator("mediaDevices", undefined);
    await click("Scan with camera");
    expect(message()).toContain("isn't available here");
  });
});

describe("manual entry", () => {
  it("validates before submitting and clears the field after", async () => {
    await render();
    await submitCode();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Enter the registration code.");
    await typeCode("not-a-code");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await submitCode();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("isn't a registration code");
    expect(container.querySelector("input")!.getAttribute("aria-invalid")).toBe("true");
    expect(onScan).not.toHaveBeenCalled();

    await typeCode(` ${token.toUpperCase()} `);
    await submitCode();
    expect(onScan).toHaveBeenCalledWith(` ${token.toUpperCase()} `, "manual");
    expect(container.querySelector("input")!.value).toBe("");
  });

  it("labels badge mode and accepts opaque printed badge values", async () => {
    await render({ mode: "badge" });
    expect(container.textContent).toContain("Or enter the badge code");
    expect(button("Look up badge")).toBeDefined();
    await submitCode();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Enter the badge code.");
    await typeCode("x".repeat(257));
    await submitCode();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("isn't a badge code");
    expect(onScan).not.toHaveBeenCalled();
    await typeCode(" HACKUTA-BADGE-0001 ");
    await submitCode();
    expect(onScan).toHaveBeenCalledWith(" HACKUTA-BADGE-0001 ", "manual");
  });

  it("stops the camera when a code is entered", async () => {
    const { stream, track } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    await render();
    await click("Scan with camera");
    await typeCode(token);
    await submitCode();
    expect(track.stop).toHaveBeenCalled();
    expect(onScan).toHaveBeenCalledTimes(1);
  });

  it("pastes and submits a code from the clipboard", async () => {
    readText.mockResolvedValue(`${token}\n`);
    await render();
    await click("Paste code");
    expect(onScan).toHaveBeenCalledWith(`${token}\n`, "manual");
  });

  it("keeps an invalid pasted value for correction", async () => {
    readText.mockResolvedValue("  hello ");
    await render();
    await click("Paste code");
    expect(container.querySelector("input")!.value).toBe("hello");
    expect(onScan).not.toHaveBeenCalled();
  });

  it("explains when the clipboard cannot be read", async () => {
    readText.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    await render();
    await click("Paste code");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Long-press the code field");
  });

  it("hides Paste when the clipboard API is unavailable", async () => {
    defineNavigator("clipboard", undefined);
    await render();
    expect(button("Paste code")).toBeUndefined();
  });
});
