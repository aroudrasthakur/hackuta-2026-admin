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

type QrWindow = Window & {
  qrShown?: { id: number; image: HTMLImageElement } | null;
  qrNextId?: number;
  /** Camera streams requested and not yet seen as stopped. */
  qrLiveCameras?: number;
};

/**
 * Replaces the camera with a canvas stream that shows whatever `scanQr` puts
 * in front of it (blank until then). When the app stops a stream that showed
 * the current code while its preview is still on the page (the scanner read
 * it), the code is taken away so it cannot be read twice. A stream stopped
 * because its scanner unmounted or remounted leaves the code in place.
 */
export async function installQrCamera(page: Page) {
  await page.addInitScript(() => {
    const qrWindow = window as QrWindow;
    qrWindow.qrShown = null;
    qrWindow.qrLiveCameras = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      // Counted synchronously, so a camera the app is still starting counts as live.
      qrWindow.qrLiveCameras = (qrWindow.qrLiveCameras ?? 0) + 1;
      const canvas = document.createElement("canvas");
      canvas.width = 480;
      canvas.height = 480;
      const context = canvas.getContext("2d")!;
      const stream = canvas.captureStream(10);
      const drawnIds = new Set<number>();
      // A decode stops the tracks before the preview is cleared; an unmount
      // stops them after React has removed the preview from the document.
      let stoppedWhileShown = false;
      for (const track of stream.getTracks()) {
        const stopTrack = track.stop.bind(track);
        track.stop = () => {
          if (Array.from(document.querySelectorAll("video")).some((video) => video.srcObject === stream)) {
            stoppedWhileShown = true;
          }
          stopTrack();
        };
      }
      const draw = () => {
        const shown = qrWindow.qrShown;
        if (stream.getTracks().every((track) => track.readyState === "ended")) {
          clearInterval(interval);
          qrWindow.qrLiveCameras = Math.max(0, (qrWindow.qrLiveCameras ?? 1) - 1);
          if (shown && drawnIds.has(shown.id) && stoppedWhileShown) qrWindow.qrShown = null;
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
  // Pages may start the camera on their own (Scan next after a camera scan).
  // The start and stop buttons are one DOM node whose label flips with the
  // camera state, so a Playwright click resolved while it read "Scan with
  // camera" could land after it became "Stop camera" and stop the scan. Check
  // and click inside one page turn instead, only when no camera is running.
  await page.waitForFunction(
    () => {
      const qrWindow = window as QrWindow;
      if (qrWindow.qrShown === null) return true;
      if ((qrWindow.qrLiveCameras ?? 0) > 0) return false;
      const scanner = document.querySelector('[aria-label="Camera scanner"]');
      const start = Array.from(scanner?.querySelectorAll("button") ?? []).find((button) =>
        /^(Scan with camera|Try camera again)$/.test(button.textContent?.trim() ?? ""),
      );
      if (start && !start.disabled) start.click();
      return false;
    },
    undefined,
    { timeout: 15_000, polling: 100 },
  );
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
