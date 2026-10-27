import { useEffect, useId, useState, type FormEvent } from "react";
import { useQrCamera, type CameraStatus } from "../../hooks/useQrCamera";
import { normalizeBadgeQr, normalizeRegistrationQr } from "../../../shared/admin/qrValues";
import { scanPrimaryButtonClass, scanSecondaryButtonClass } from "../../lib/scanButtonClasses";
import { CameraIcon } from "./VolunteerIcons";

export type ScanSource = "camera" | "manual";

/** Which code the volunteer should be scanning: the portal registration QR or the printed badge. */
export type ScanMode = "registration" | "badge";

const MODES = {
  registration: {
    aim: "Point the camera at the registration QR on the participant's phone.",
    label: "Or enter the registration code",
    hint: "From the participant portal. Use a handheld scanner, or paste a code read by another QR app.",
    empty: "Enter the registration code.",
    invalid: "That isn't a registration code. Registration codes are 64 letters (a–f) and numbers from the participant portal.",
    submit: "Look up registration",
    normalize: normalizeRegistrationQr,
  },
  badge: {
    aim: "Point the camera at the QR code printed on the participant's badge.",
    label: "Or enter the badge code",
    hint: "Printed on the badge. Use a handheld scanner, or paste a code read by another QR app.",
    empty: "Enter the badge code.",
    invalid: "That isn't a badge code. Scan or enter the code printed on the badge (up to 256 characters).",
    submit: "Look up badge",
    normalize: normalizeBadgeQr,
  },
} as const;

const CAMERA_MESSAGES: Partial<Record<CameraStatus, string>> = {
  starting: "Starting camera…",
  paused: "The camera turned off while this page was in the background. Start it again when you're ready.",
  denied: "Camera access is blocked. Allow camera access for this site in your browser settings, then try again, or enter the code below.",
  no_camera: "No camera was found on this device. Enter the code below.",
  in_use: "The camera is in use by another app or tab. Close it and try again, or enter the code below.",
  interrupted: "The camera stopped. It may have been disconnected or its permission removed. Try again, or enter the code below.",
  unsupported: "Camera scanning isn't available here. It needs a secure (HTTPS) connection in a browser such as Safari or Chrome. Enter the code below instead.",
  error: "The camera or QR reader couldn't start. Try again, or enter the code below.",
};

const PROBLEM_STATUSES = new Set<CameraStatus>(["denied", "no_camera", "in_use", "interrupted", "unsupported", "error", "paused"]);

const OVERLAY_TITLE: Partial<Record<CameraStatus, string>> = {
  starting: "Preparing camera",
  denied: "Camera permission needed",
  no_camera: "Camera unavailable",
  in_use: "Camera in use",
  interrupted: "Camera stopped",
  unsupported: "Camera unavailable",
  error: "Camera unavailable",
  paused: "Camera paused",
};

/**
 * Camera or manual QR entry for one kind of code. Reports one raw value per
 * scan; the camera stops before `onScan` runs. Set `autoStart` only after the
 * volunteer asked for the camera (for example, Scan next after a camera scan).
 */
export function QrScanner({
  mode,
  onScan,
  autoStart = false,
}: {
  mode: ScanMode;
  onScan: (rawValue: string, source: ScanSource) => void;
  autoStart?: boolean;
}) {
  const copy = MODES[mode];
  const { status, videoRef, start, stop } = useQrCamera((rawValue) => onScan(rawValue, "camera"));
  const [code, setCode] = useState("");
  const [entryError, setEntryError] = useState<string | null>(null);
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const cameraActive = status === "starting" || status === "scanning";
  const showViewport = cameraActive || PROBLEM_STATUSES.has(status);
  const canPaste = typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function";

  useEffect(() => {
    if (autoStart) void start();
  }, [autoStart, start]);

  const submit = (value: string) => {
    if (!value.trim()) {
      setEntryError(copy.empty);
      return;
    }
    if (!copy.normalize(value)) {
      setEntryError(copy.invalid);
      return;
    }
    setEntryError(null);
    setCode("");
    stop();
    onScan(value, "manual");
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit(code);
  };

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setCode(text.trim());
      submit(text);
    } catch {
      setEntryError("Couldn't read the clipboard. Long-press the code field and choose Paste.");
    }
  };

  const message = status === "scanning" ? copy.aim : CAMERA_MESSAGES[status];
  const focusManual = () => {
    stop();
    document.getElementById(inputId)?.focus();
  };

  return (
    <div className="space-y-5">
      <section aria-label="Camera scanner" className="volunteer-camera">
        <div
          className={`volunteer-camera__viewport${showViewport ? "" : " volunteer-camera__viewport--idle"}`}
        >
          <video
            ref={videoRef}
            className="volunteer-camera__video"
            muted
            playsInline
            aria-label="Camera preview"
          />
          <div className="volunteer-camera__frame" aria-hidden="true">
            <span className="volunteer-camera__corner volunteer-camera__corner--tl" />
            <span className="volunteer-camera__corner volunteer-camera__corner--tr" />
            <span className="volunteer-camera__corner volunteer-camera__corner--bl" />
            <span className="volunteer-camera__corner volunteer-camera__corner--br" />
          </div>
          {status !== "scanning" && showViewport ? (
            <div className="volunteer-camera__overlay" role={PROBLEM_STATUSES.has(status) ? "alert" : "status"}>
              <CameraIcon className="h-8 w-8" />
              <p className="volunteer-camera__overlay-title">
                {OVERLAY_TITLE[status] ?? "Camera ready when enabled"}
              </p>
              {message ? <p className="volunteer-camera__overlay-copy">{message}</p> : null}
              {PROBLEM_STATUSES.has(status) ? (
                <>
                  <p className="volunteer-camera__hint">
                    Tip: close other apps using the camera, then retry, or continue with manual entry below.
                  </p>
                  <button type="button" className={scanSecondaryButtonClass} onClick={focusManual}>
                    Use manual entry
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
        {status === "scanning" && message ? (
          <p role="status" className="volunteer-camera__caption">{message}</p>
        ) : null}
        {!showViewport && message ? (
          <p
            role={PROBLEM_STATUSES.has(status) ? "alert" : "status"}
            className={PROBLEM_STATUSES.has(status) ? "admin-callout admin-callout--alert text-base" : "admin-callout text-base"}
          >
            {message}
          </p>
        ) : null}
        {cameraActive ? (
          <button type="button" className={scanSecondaryButtonClass} onClick={() => stop()}>
            Stop camera and enter code
          </button>
        ) : status !== "unsupported" ? (
          <button type="button" className={scanPrimaryButtonClass} onClick={() => void start()}>
            {status === "idle" ? "Scan with camera" : "Try camera again"}
          </button>
        ) : null}
      </section>

      <form onSubmit={onSubmit} className="volunteer-manual-entry" noValidate>
        <label htmlFor={inputId} className="block text-base font-semibold text-night">
          {copy.label}
        </label>
        <p id={hintId} className="text-sm text-ocean">{copy.hint}</p>
        <input
          id={inputId}
          className="admin-field__control min-h-14 font-mono text-base"
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
            setEntryError(null);
          }}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          aria-invalid={entryError ? true : undefined}
          aria-describedby={entryError ? `${hintId} ${errorId}` : hintId}
        />
        {entryError ? <p id={errorId} role="alert" className="text-sm font-semibold text-red-800">{entryError}</p> : null}
        <div className="volunteer-manual-entry__actions">
          <button type="submit" className={scanPrimaryButtonClass}>{copy.submit}</button>
          {canPaste ? (
            <button type="button" className={scanSecondaryButtonClass} onClick={() => void paste()}>Paste code</button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
