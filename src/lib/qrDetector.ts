/** Minimal surface shared by the native `BarcodeDetector` and the ZXing ponyfill. */
export type QrDetector = {
  detect(source: HTMLVideoElement): Promise<ReadonlyArray<{ rawValue: string }>>;
};

type NativeBarcodeDetector = {
  new (options: { formats: string[] }): QrDetector;
  getSupportedFormats(): Promise<readonly string[]>;
};

let cached: Promise<QrDetector> | null = null;

async function nativeDetector(): Promise<QrDetector | null> {
  const Native = (globalThis as { BarcodeDetector?: NativeBarcodeDetector }).BarcodeDetector;
  if (!Native) return null;
  try {
    const formats = await Native.getSupportedFormats();
    return formats.includes("qr_code") ? new Native({ formats: ["qr_code"] }) : null;
  } catch {
    return null;
  }
}

/** ZXing WebAssembly decoder, served from this app rather than the library's default CDN. */
async function zxingDetector(): Promise<QrDetector> {
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import("barcode-detector/ponyfill"),
    import("zxing-wasm/reader/zxing_reader.wasm?url"),
  ]);
  await prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path),
    },
    fireImmediately: true,
  });
  return new BarcodeDetector({ formats: ["qr_code"] });
}

/**
 * Native detection where the browser supports QR codes (Chrome on Android),
 * otherwise the ZXing ponyfill (iOS Safari, Firefox). Loaded on first use and
 * shared; a failed load is retried on the next request.
 */
export function loadQrDetector(): Promise<QrDetector> {
  cached ??= (async () => (await nativeDetector()) ?? zxingDetector())().catch((error: unknown) => {
    cached = null;
    throw error;
  });
  return cached;
}

/** Test hook: forget the shared detector. */
export function resetQrDetectorForTests() {
  cached = null;
}
