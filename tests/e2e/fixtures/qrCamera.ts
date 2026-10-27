import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Page } from "@playwright/test";
import { prepareZXingModule, writeBarcode } from "zxing-wasm/writer";

const require = createRequire(import.meta.url);

/** QR code SVG for `value`, generated locally with the same ZXing build the app decodes with. */
export async function qrCodeSvg(value: string) {
  await prepareZXingModule({
    overrides: { wasmBinary: readFileSync(require.resolve("zxing-wasm/writer/zxing_writer.wasm")) },
    fireImmediately: true,
  });
  const result = await writeBarcode(value, { format: "QRCode", scale: 8 });
  if (result.error) throw new Error(result.error);
  return result.svg;
}

type QrWindow = Window & { qrShown?: { id: number; image: HTMLImageElement } | null; qrNextId?: number };

/**
 * Replaces the camera with a canvas stream that shows whatever `scanQr` puts
 * in front of it (blank until then). Once the app stops a stream that showed
 * the current code, the code is taken away so it cannot be read twice.
 */
export async function installQrCamera(page: Page) {
  await page.addInitScript(() => {
    const qrWindow = window as QrWindow;
    qrWindow.qrShown = null;
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 480;
      canvas.height = 480;
      const context = canvas.getContext("2d")!;
      const stream = canvas.captureStream(10);
      const drawnIds = new Set<number>();
      const draw = () => {
        const shown = qrWindow.qrShown;
        if (stream.getTracks().every((track) => track.readyState === "ended")) {
          clearInterval(interval);
          if (shown && drawnIds.has(shown.id)) qrWindow.qrShown = null;
          return;
        }
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        if (shown) {
          context.drawImage(shown.image, 60, 60, 360, 360);
          drawnIds.add(shown.id);
        }
      };
      const interval = setInterval(draw, 50);
      draw();
      return stream;
    };
  });
}

/**
 * Shows `value` as a QR code to the camera installed by `installQrCamera`,
 * starting the camera if it isn't already running, and waits until it is read.
 */
export async function scanQr(page: Page, value: string) {
  const svg = await qrCodeSvg(value);
  await page.evaluate(async (source) => {
    const qrWindow = window as QrWindow;
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
    await image.decode();
    qrWindow.qrNextId = (qrWindow.qrNextId ?? 0) + 1;
    qrWindow.qrShown = { id: qrWindow.qrNextId, image };
  }, svg);
  const startButton = page.getByRole("button", { name: /^(Scan with camera|Try camera again)$/ });
  if (await startButton.isVisible()) await startButton.click();
  await page.waitForFunction(() => (window as QrWindow).qrShown === null, undefined, { timeout: 15_000 });
}

/**
 * Replaces the camera with a canvas stream showing `svg`, so the real decoder
 * reads a real QR code. The stream's tracks are exposed as `window.scanTracks`.
 */
export async function showQrToCamera(page: Page, svg: string) {
  await page.addInitScript((source) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 480;
      canvas.height = 480;
      const context = canvas.getContext("2d")!;
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
      await image.decode();
      const draw = () => {
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 60, 60, 360, 360);
      };
      draw();
      setInterval(draw, 100);
      const stream = canvas.captureStream(10);
      (window as unknown as { scanTracks: MediaStreamTrack[] }).scanTracks = stream.getTracks();
      return stream;
    };
  }, svg);
}
