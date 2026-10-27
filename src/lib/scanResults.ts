import { adminErrorCode, GENERIC_ERROR_MESSAGE } from "../../shared/admin/errors";
import { logAdminError } from "../../shared/admin/logAdminError";
import type {
  AwardEventPointsResult,
  BadgeCheckInPreview,
  CheckInWithBadgeResult,
  MealRedemptionResult,
  QrScanPreview,
  RegistrationCheckInPreview,
} from "../convex/adminApi";

/** Badge scan purposes, matching `resolveQrForScan`. Check-in has its own flow. */
export type ScanPurpose = "food_check_in" | "point_scan";

export type ScanOutcome = {
  /** `duplicate` means nothing changed because the action was already done. */
  tone: "success" | "duplicate" | "error";
  title: string;
  detail: string;
};

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
  title: "Not a badge QR code",
  detail: "This code couldn't be read as a HackUTA badge. Scan the QR code printed on the participant's badge and try again.",
};

const OUTCOMES = {
  participant_ineligible: {
    tone: "error",
    title: "Participant not eligible",
    detail: "This person isn't an accepted participant, so no action is allowed. Direct them to the registration desk.",
  },
  meal_not_active: {
    tone: "error", title: "Meal not available",
    detail: "This meal was disabled or removed, or no meal was selected. Choose an available meal before scanning again.",
  },
  meal_not_started: {
    tone: "error", title: "Meal has not started",
    detail: "This meal's serving window has not started. Check the selected meal and wait until serving begins.",
  },
  meal_ended: {
    tone: "error", title: "Meal has ended",
    detail: "This meal's serving window has ended. No new collection can be recorded. Choose an available meal.",
  },
  qr_not_found: {
    tone: "error",
    title: "Participant not found",
    detail: "No participant matches this code. Check that you scanned the right QR code, then try again.",
  },
  registration_qr_replaced: {
    tone: "error",
    title: "Registration QR no longer works",
    detail: "This participant is checked in and has a badge. Scan the QR code printed on their badge instead.",
  },
  registration_qr_used: {
    tone: "error",
    title: "Registration QR already used",
    detail: "This participant already checked in and received a badge, so this registration QR no longer works. Nothing was changed.",
  },
  badge_retired: {
    tone: "error",
    title: "Badge deactivated",
    detail: "This badge was replaced and no longer works. Ask for the participant's current badge, or send them to an administrator.",
  },
  participant_not_checked_in: {
    tone: "error",
    title: "Not checked in yet",
    detail: "This is a registration QR. The participant must check in at the front desk to get their badge first. Nothing was recorded.",
  },
  badge_not_assigned: {
    tone: "error",
    title: "No badge assigned",
    detail: "This participant checked in without a badge. An administrator must assign one before they can use food, points, or the shop.",
  },
  badge_invalid: {
    tone: "error",
    title: "Badge not recognized",
    detail: "That code can't be used as a badge. Scan the QR code printed on the badge.",
  },
  badge_is_registration: {
    tone: "error",
    title: "That's a registration QR",
    detail: "You scanned a registration QR, not a badge. Scan the QR code printed on the physical badge.",
  },
  badge_in_use: {
    tone: "error",
    title: "Badge already assigned",
    detail: "This badge belongs to another participant. Set it aside and scan a new badge.",
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
  if (preview.purpose === "food_check_in" && preview.participant.alreadyRedeemed) {
    return alreadyRedeemed(preview.meal.name, preview.participant.redeemedAt);
  }
  if (preview.purpose === "point_scan" && preview.alreadyAwarded) {
    return alreadyAwarded(participant.name, preview.event.name);
  }
  return null;
}

export function alreadyCheckedIn(name: string, at: number | null): ScanOutcome {
  return {
    tone: "duplicate",
    title: "Already checked in",
    detail: `${name} already checked in${at === null ? "" : ` at ${formatScanTime(at)}`}. Nothing was changed.`,
  };
}

function alreadyRedeemed(mealName: string, at: number | null): ScanOutcome {
  return {
    tone: "duplicate",
    title: "Food Already Collected",
    detail: `This participant has already received their food for ${mealName}.${at === null ? "" : ` Collected at ${formatScanTime(at)}.`}`,
  };
}

function alreadyAwarded(name: string, eventName: string): ScanOutcome {
  return {
    tone: "duplicate",
    title: "Points already awarded",
    detail: `${name} already received points for ${eventName}. Nothing was changed.`,
  };
}

export type CheckInStepFailure = Exclude<
  RegistrationCheckInPreview | BadgeCheckInPreview | CheckInWithBadgeResult,
  { status: "ok" | "success" }
>;

/** Badge-step statuses: the volunteer can scan a different badge for the same participant. */
export const BADGE_RETRY_STATUSES = new Set<string>(["badge_invalid", "badge_is_registration", "badge_in_use", "badge_retired"]);

/** Any non-`ok`, non-`success` result from the three check-in mutations. */
export function checkInStepOutcome(result: CheckInStepFailure): ScanOutcome {
  if (result.status === "already_checked_in") return alreadyCheckedIn(result.participant.name, result.participant.checkedInAt);
  if (result.status === "registration_qr_used") {
    const { name, checkedInAt } = result.participant;
    return {
      ...OUTCOMES.registration_qr_used,
      detail: `${name} already checked in${checkedInAt === null ? "" : ` at ${formatScanTime(checkedInAt)}`} and received a badge, so this registration QR no longer works. Nothing was changed.`,
    };
  }
  return OUTCOMES[result.status];
}

export function checkedInOutcome(name: string): ScanOutcome {
  return {
    tone: "success",
    title: "Checked in",
    detail: `${name} is checked in with their badge. From now on, scan the badge for food, points, and the shop.`,
  };
}

export function foodOutcome(result: MealRedemptionResult, name: string): ScanOutcome {
  if (result.status === "success") return { tone: "success", title: "Food collected", detail: `${name}'s food collection for ${result.meal.name} is recorded.` };
  if (result.status === "already_redeemed") return alreadyRedeemed(result.meal.name, result.redeemedAt);
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
