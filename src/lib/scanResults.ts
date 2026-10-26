import { adminErrorCode, GENERIC_ERROR_MESSAGE } from "../../shared/admin/errors";
import { logAdminError } from "../../shared/admin/logAdminError";
import type {
  AwardEventPointsResult,
  CheckInResult,
  FoodCheckInResult,
  QrScanPreview,
} from "../convex/adminApi";

/** Backend scan purposes, matching `resolveQrForScan`. */
export type ScanPurpose = "check_in" | "food_check_in" | "point_scan";

export type ScanOutcome = {
  /** `duplicate` means nothing changed because the action was already done. */
  tone: "success" | "duplicate" | "error";
  title: string;
  detail: string;
};

const QR_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

/** Participant QR codes hold a 64-character hex token. Whitespace and letter case from manual entry are forgiven. */
export function normalizeQrToken(raw: string): string | null {
  const token = raw.replace(/\s+/g, "").toLowerCase();
  return QR_TOKEN_PATTERN.test(token) ? token : null;
}

/** Thrown when the device is offline or the server does not answer in time. */
export class ScanNetworkError extends Error {
  constructor(message = "Scan request did not reach the server") {
    super(message);
    this.name = "ScanNetworkError";
  }
}

export const SCAN_REQUEST_TIMEOUT_MS = 15_000;

/**
 * Runs a scan request, failing fast while offline and after a timeout. Every
 * scan mutation is idempotent, so a request that lands after the timeout only
 * makes the next attempt report "already done".
 */
export async function withScanTimeout<T>(run: () => Promise<T>, timeoutMs = SCAN_REQUEST_TIMEOUT_MS): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new ScanNetworkError("Device is offline");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ScanNetworkError("Scan request timed out")), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export function formatScanTime(timestamp: number) {
  return timeFormatter.format(timestamp);
}

export const INVALID_QR_OUTCOME: ScanOutcome = {
  tone: "error",
  title: "Not a participant QR code",
  detail: "This code isn't a HackUTA participant QR code. Ask the participant to open their QR code in the participant portal, or check the code and try again.",
};

const OUTCOMES = {
  qr_not_found: {
    tone: "error",
    title: "Participant not found",
    detail: "No participant matches this QR code. Ask them to reopen their QR code in the participant portal, then scan again.",
  },
  participant_not_eligible: {
    tone: "error",
    title: "Participant not eligible",
    detail: "This person isn't an accepted participant, so no action is allowed. Direct them to the registration desk.",
  },
  not_authorized: {
    tone: "error",
    title: "Permission required",
    detail: "Your account doesn't currently have permission for this scan. Return to the dashboard or contact an administrator.",
  },
  event_denied: {
    tone: "error",
    title: "Event not assigned",
    detail: "You're no longer assigned to this event, so no points were awarded. Choose another event or contact an administrator.",
  },
  event_inactive: {
    tone: "error",
    title: "Event not active",
    detail: "This event has ended or was turned off, so no points were awarded. Contact an administrator if this is unexpected.",
  },
  self_purchase_denied: {
    tone: "error",
    title: "Can't sell to yourself",
    detail: "Volunteers can't complete shop purchases for their own account. Ask another shop volunteer to help.",
  },
  rate_limited: {
    tone: "error",
    title: "Too many scans",
    detail: "Scanning is paused briefly after many attempts or failed scans. Wait a minute, then try again.",
  },
  network: {
    tone: "error",
    title: "Connection problem",
    detail: "We couldn't reach the server. Check your Wi-Fi or data and try again. If the scan already went through, trying again shows it as already done.",
  },
  session_expired: {
    tone: "error",
    title: "Session expired",
    detail: "Your session has expired. Sign in again to keep scanning.",
  },
  unexpected: {
    tone: "error",
    title: "Scan failed",
    detail: GENERIC_ERROR_MESSAGE,
  },
} as const satisfies Record<string, ScanOutcome>;

export type ScanFailureStatus = keyof typeof OUTCOMES;

export function scanFailureOutcome(status: ScanFailureStatus): ScanOutcome {
  return OUTCOMES[status];
}

/** Maps a thrown error (network, expired session, revoked role) to a message. Unknown errors are logged. */
export function scanErrorOutcome(caught: unknown, context: string): ScanOutcome {
  if (caught instanceof ScanNetworkError) return OUTCOMES.network;
  const code = adminErrorCode(caught);
  if (code === "NOT_AUTHENTICATED") return OUTCOMES.session_expired;
  if (code === "VOLUNTEER_ONLY" || code === "NOT_AUTHORIZED" || code === "CAPABILITY_DENIED" || code === "ACCOUNT_INACTIVE") {
    return OUTCOMES.not_authorized;
  }
  if (caught instanceof TypeError) return OUTCOMES.network;
  logAdminError(context, caught, { source: "volunteerScan" });
  return OUTCOMES.unexpected;
}

export type ScanPreview = Extract<QrScanPreview, { status: "ok" }>;

/** Preview results that end the flow before confirmation. Null only for an actionable `ok` preview. */
export function previewOutcome(preview: QrScanPreview): ScanOutcome | null {
  if (preview.status !== "ok") return OUTCOMES[preview.status];
  const { participant } = preview;
  if (preview.purpose === "check_in" && preview.participant.checkedIn) {
    return alreadyCheckedIn(participant.name, preview.participant.checkedInAt);
  }
  if (preview.purpose === "food_check_in" && preview.participant.foodCheckedIn) {
    return alreadyRedeemed(participant.name, preview.participant.foodCheckedInAt);
  }
  if (preview.purpose === "point_scan" && preview.alreadyAwarded) {
    return alreadyAwarded(participant.name, preview.event.name);
  }
  return null;
}

function alreadyCheckedIn(name: string, at: number | null): ScanOutcome {
  return {
    tone: "duplicate",
    title: "Already checked in",
    detail: `${name} already checked in${at === null ? "" : ` at ${formatScanTime(at)}`}. Nothing was changed.`,
  };
}

function alreadyRedeemed(name: string, at: number | null): ScanOutcome {
  return {
    tone: "duplicate",
    title: "Food already redeemed",
    detail: `${name} already received food${at === null ? "" : ` at ${formatScanTime(at)}`}. Nothing was changed.`,
  };
}

function alreadyAwarded(name: string, eventName: string): ScanOutcome {
  return {
    tone: "duplicate",
    title: "Points already awarded",
    detail: `${name} already received points for ${eventName}. Nothing was changed.`,
  };
}

export function checkInOutcome(result: CheckInResult, name: string): ScanOutcome {
  if (result.status === "success") return { tone: "success", title: "Checked in", detail: `${name} is checked in.` };
  if (result.status === "already_checked_in") return alreadyCheckedIn(name, result.checkedInAt);
  return OUTCOMES[result.status];
}

export function foodOutcome(result: FoodCheckInResult, name: string): ScanOutcome {
  if (result.status === "success") return { tone: "success", title: "Food redeemed", detail: `${name} can receive food now.` };
  if (result.status === "already_food_checked_in") return alreadyRedeemed(name, result.foodCheckedInAt);
  return OUTCOMES[result.status];
}

export function awardOutcome(result: AwardEventPointsResult, name: string, eventName: string): ScanOutcome {
  if (result.status === "success") {
    return {
      tone: "success",
      title: `${result.pointsAwarded} points awarded`,
      detail: `${name} received ${result.pointsAwarded} points for ${eventName}.`,
    };
  }
  if (result.status === "already_awarded") return alreadyAwarded(name, eventName);
  if (result.status === "participant_not_checked_in") {
    return {
      tone: "error",
      title: "Not checked in yet",
      detail: `${name} must check in at the front desk before receiving event points. No points were awarded.`,
    };
  }
  return OUTCOMES[result.status];
}
