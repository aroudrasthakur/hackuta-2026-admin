import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ponyfill = vi.hoisted(() => ({
  prepare: vi.fn(),
  instances: [] as unknown[],
}));

vi.mock("barcode-detector/ponyfill", () => ({
  BarcodeDetector: class {
    constructor(public options: unknown) {
      ponyfill.instances.push(this);
    }
    detect = vi.fn();
  },
  prepareZXingModule: ponyfill.prepare,
}));
vi.mock("zxing-wasm/reader/zxing_reader.wasm?url", () => ({ default: "/assets/zxing_reader-hash.wasm" }));

const { loadQrDetector, resetQrDetectorForTests } = await import("../../src/lib/qrDetector");

function stubNative(formats: () => Promise<readonly string[]>) {
  const created: unknown[] = [];
  class NativeDetector {
    static getSupportedFormats = formats;
    constructor(public options: unknown) {
      created.push(this);
    }
    detect = vi.fn();
  }
  vi.stubGlobal("BarcodeDetector", NativeDetector);
  return created;
}

beforeEach(() => {
  resetQrDetectorForTests();
  ponyfill.prepare.mockReset().mockResolvedValue({});
  ponyfill.instances.length = 0;
});
afterEach(() => vi.unstubAllGlobals());

describe("loadQrDetector", () => {
  it("uses the native detector when it reads QR codes", async () => {
    const created = stubNative(async () => ["ean_13", "qr_code"]);
    const detector = await loadQrDetector();
    expect(created).toEqual([detector]);
    expect(detector).toMatchObject({ options: { formats: ["qr_code"] } });
    expect(await loadQrDetector()).toBe(detector);
    expect(ponyfill.prepare).not.toHaveBeenCalled();
  });

  it.each([
    ["no BarcodeDetector", null],
    ["no QR support", async () => ["ean_13"]],
    ["a failing format query", async () => Promise.reject(new Error("unavailable"))],
  ] as const)("falls back to the bundled ZXing decoder with %s", async (_label, formats) => {
    if (formats) stubNative(formats);
    const detector = await loadQrDetector();
    expect(ponyfill.instances).toEqual([detector]);
    expect(detector).toMatchObject({ options: { formats: ["qr_code"] } });
    const [{ overrides, fireImmediately }] = ponyfill.prepare.mock.calls[0] as [{ overrides: { locateFile: (path: string, prefix: string) => string }; fireImmediately: boolean }];
    expect(fireImmediately).toBe(true);
    expect(overrides.locateFile("zxing_reader.wasm", "https://cdn.example/")).toBe("/assets/zxing_reader-hash.wasm");
    expect(overrides.locateFile("other.js", "/base/")).toBe("/base/other.js");
  });

  it("retries after a failed decoder load", async () => {
    ponyfill.prepare.mockRejectedValueOnce(new Error("wasm blocked"));
    await expect(loadQrDetector()).rejects.toThrow("wasm blocked");
    const detector = await loadQrDetector();
    expect(ponyfill.instances).toEqual([detector]);
    expect(ponyfill.prepare).toHaveBeenCalledTimes(2);
  });
});
