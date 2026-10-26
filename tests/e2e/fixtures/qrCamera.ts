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
