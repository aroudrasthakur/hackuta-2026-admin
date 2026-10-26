import { useCallback, useEffect, useRef, useState } from "react";
import { loadQrDetector } from "../lib/qrDetector";

export type CameraStatus =
  | "idle"
  | "starting"
  | "scanning"
  | "paused"
  | "denied"
  | "no_camera"
  | "in_use"
  | "interrupted"
  | "unsupported"
  | "error";

/** Delay between decode attempts; one attempt runs at a time. */
export const QR_SCAN_INTERVAL_MS = 150;

/** Camera scanning needs HTTPS (or localhost) and `getUserMedia`. */
export function isCameraSupported() {
  return typeof window !== "undefined" && window.isSecureContext !== false &&
    typeof navigator.mediaDevices?.getUserMedia === "function";
}

function cameraErrorStatus(error: unknown): CameraStatus {
  const name = error instanceof Error || error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") return "no_camera";
  if (name === "NotReadableError" || name === "AbortError" || name === "TrackStartError") return "in_use";
  if (name === "NotSupportedError") return "unsupported";
  return "error";
}

/**
 * Owns at most one camera stream. The camera starts only from `start()`, and
 * each session reports at most one detection: the stream is released before
 * `onDetected` runs, so repeated frames cannot submit twice. Unmounting,
 * hiding the page, ending the track (unplugged camera or revoked permission),
 * or a camera permission change to `denied` all release the tracks.
 */
export function useQrCamera(onDetected: (rawValue: string) => void) {
  const [status, setStatus] = useState<CameraStatus>(() => (isCameraSupported() ? "idle" : "unsupported"));
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const permissionRef = useRef<PermissionStatus | null>(null);
  const onDetectedRef = useRef(onDetected);
  const mountedRef = useRef(true);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  const release = useCallback(() => {
    sessionRef.current += 1;
    clearTimeout(timerRef.current);
    if (permissionRef.current) permissionRef.current.onchange = null;
    permissionRef.current = null;
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
  }, []);

  const stop = useCallback((next: CameraStatus = "idle") => {
    release();
    if (mountedRef.current) setStatus(next);
  }, [release]);

  const start = useCallback(async () => {
    if (!isCameraSupported()) {
      setStatus("unsupported");
      return;
    }
    release();
    const session = sessionRef.current;
    const current = () => mountedRef.current && session === sessionRef.current;
    setStatus("starting");
    const detectorPromise = loadQrDetector();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" } } });
    } catch (error) {
      if (current()) setStatus(cameraErrorStatus(error));
      return;
    }
    if (!current()) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }
    streamRef.current = stream;
    for (const track of stream.getVideoTracks()) {
      track.addEventListener("ended", () => {
        if (session === sessionRef.current) stop("interrupted");
      });
    }
    void navigator.permissions?.query({ name: "camera" as PermissionName }).then((permission) => {
      if (session !== sessionRef.current) return;
      permissionRef.current = permission;
      permission.onchange = () => {
        if (permission.state === "denied" && session === sessionRef.current) stop("denied");
      };
    }, () => undefined);

    try {
      const video = videoRef.current;
      if (!video) throw new Error("Camera preview is not mounted");
      video.srcObject = stream;
      await video.play();
      const detector = await detectorPromise;
      if (!current()) return;
      setStatus("scanning");

      const tick = async () => {
        if (!current()) return;
        let rawValue: string | undefined;
        if (video.readyState >= 2) {
          try {
            rawValue = (await detector.detect(video)).find((code) => code.rawValue)?.rawValue;
          } catch {
            // A frame that fails to decode is skipped; the next attempt uses a fresh frame.
          }
        }
        if (!current()) return;
        if (rawValue) {
          stop("idle");
          onDetectedRef.current(rawValue);
          return;
        }
        timerRef.current = setTimeout(() => void tick(), QR_SCAN_INTERVAL_MS);
      };
      void tick();
    } catch (error) {
      if (current()) stop(cameraErrorStatus(error));
    }
  }, [release, stop]);

  useEffect(() => {
    mountedRef.current = true;
    const pause = () => {
      if (document.visibilityState === "hidden" && streamRef.current) stop("paused");
    };
    const leave = () => {
      if (streamRef.current) stop("paused");
    };
    document.addEventListener("visibilitychange", pause);
    window.addEventListener("pagehide", leave);
    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", pause);
      window.removeEventListener("pagehide", leave);
      release();
    };
  }, [release, stop]);

  return { status, videoRef, start, stop };
}
