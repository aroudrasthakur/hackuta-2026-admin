import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "../convex/reactBindings";
import {
  checkInWithBadgeRef,
  resolveBadgeForCheckInRef,
  resolveRegistrationForCheckInRef,
} from "../convex/adminApi";
import { normalizeBadgeQr, normalizeRegistrationQr } from "../../shared/admin/qrValues";
import {
  BADGE_RETRY_STATUSES,
  checkedInOutcome,
  checkInStepOutcome,
  scanErrorOutcome,
  scanFailureOutcome,
  withScanTimeout,
  type CheckInStepFailure,
  type ScanOutcome,
} from "../lib/scanResults";
import { useAdminAuth } from "./useAdminAuth";

type Participant = { name: string };

export type CheckInWorkflowState =
  | { step: "registration"; error: ScanOutcome | null }
  | { step: "checking_registration" }
  | { step: "badge"; participant: Participant; error: ScanOutcome | null }
  | { step: "checking_badge"; participant: Participant }
  | { step: "confirm"; participant: Participant; submitting: boolean; error: ScanOutcome | null }
  | { step: "result"; outcome: ScanOutcome };

const NOT_REGISTRATION: ScanOutcome = {
  tone: "error",
  title: "Not a registration QR",
  detail: "Scan the registration QR in the participant's portal first. The badge comes next.",
};

const NOT_BADGE: ScanOutcome = {
  tone: "error",
  title: "Badge not recognized",
  detail: "That code can't be used as a badge. Scan the QR code printed on the badge.",
};

const SAME_AS_REGISTRATION: ScanOutcome = {
  tone: "error",
  title: "That's the registration QR again",
  detail: "Scan the QR code printed on the physical badge, not the one on the participant's phone.",
};

/**
 * Registration QR → badge QR → confirm → result for door check-in. Each scan
 * is checked on the server, and the confirmation re-runs every check before
 * assigning the badge and checking the participant in together.
 *
 * Both scanned values live only in refs and are never shown. Back drops the
 * current step's value; Start over, Scan next, and unmount drop both. A
 * response for a step the volunteer has left is ignored.
 */
export function useCheckInWorkflow() {
  const { sessionToken } = useAdminAuth();
  const resolveRegistration = useMutation(resolveRegistrationForCheckInRef);
  const resolveBadge = useMutation(resolveBadgeForCheckInRef);
  const checkIn = useMutation(checkInWithBadgeRef);
  const [state, setState] = useState<CheckInWorkflowState>({ step: "registration", error: null });
  const registrationRef = useRef<string | null>(null);
  const badgeRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const requestRef = useRef(0);

  const clear = useCallback(() => {
    requestRef.current += 1;
    busyRef.current = false;
    registrationRef.current = null;
    badgeRef.current = null;
  }, []);

  useEffect(() => clear, [clear]);

  const finish = useCallback((outcome: ScanOutcome) => {
    registrationRef.current = null;
    badgeRef.current = null;
    setState({ step: "result", outcome });
  }, []);

  /** Runs one request; returns undefined if the volunteer moved on, or it threw. */
  const run = useCallback(async <T,>(call: () => Promise<T>, context: string, onError: (outcome: ScanOutcome) => void) => {
    busyRef.current = true;
    const request = ++requestRef.current;
    try {
      const result = await withScanTimeout(call);
      return request === requestRef.current ? result : undefined;
    } catch (caught) {
      if (request === requestRef.current) onError(scanErrorOutcome(caught, context));
      return undefined;
    } finally {
      if (request === requestRef.current) busyRef.current = false;
    }
  }, []);

  const scanRegistration = useCallback(async (rawValue: string) => {
    if (busyRef.current || state.step !== "registration") return;
    const registration = normalizeRegistrationQr(rawValue);
    if (!registration) return setState({ step: "registration", error: NOT_REGISTRATION });
    if (!sessionToken) return finish(scanFailureOutcome("session_expired"));
    setState({ step: "checking_registration" });
    const result = await run(
      () => resolveRegistration({ sessionToken, registrationQrCodeToken: registration }),
      "Volunteer registration lookup failed",
      finish,
    );
    if (!result) return;
    if (result.status !== "ok") {
      if (result.status === "rate_limited") return setState({ step: "registration", error: checkInStepOutcome(result) });
      return finish(checkInStepOutcome(result));
    }
    registrationRef.current = registration;
    setState({ step: "badge", participant: result.participant, error: null });
  }, [finish, resolveRegistration, run, sessionToken, state.step]);

  /** A badge problem keeps the participant and asks for another badge; anything else ends the flow. */
  const failAtBadge = useCallback((participant: Participant, result: CheckInStepFailure) => {
    badgeRef.current = null;
    if (BADGE_RETRY_STATUSES.has(result.status) || result.status === "rate_limited") {
      setState({ step: "badge", participant, error: checkInStepOutcome(result) });
    } else {
      finish(checkInStepOutcome(result));
    }
  }, [finish]);

  const scanBadge = useCallback(async (rawValue: string) => {
    const registration = registrationRef.current;
    if (busyRef.current || state.step !== "badge" || !registration) return;
    const { participant } = state;
    const badge = normalizeBadgeQr(rawValue);
    if (!badge) return setState({ step: "badge", participant, error: NOT_BADGE });
    if (normalizeRegistrationQr(badge) === registration) {
      return setState({ step: "badge", participant, error: SAME_AS_REGISTRATION });
    }
    if (!sessionToken) return finish(scanFailureOutcome("session_expired"));
    setState({ step: "checking_badge", participant });
    const result = await run(
      () => resolveBadge({ sessionToken, registrationQrCodeToken: registration, badgeQrCodeToken: badge }),
      "Volunteer badge lookup failed",
      (outcome) => setState({ step: "badge", participant, error: outcome }),
    );
    if (!result) return;
    if (result.status !== "ok") return failAtBadge(participant, result);
    badgeRef.current = badge;
    setState({ step: "confirm", participant, submitting: false, error: null });
  }, [failAtBadge, finish, resolveBadge, run, sessionToken, state]);

  const confirm = useCallback(async () => {
    const registration = registrationRef.current;
    const badge = badgeRef.current;
    if (busyRef.current || state.step !== "confirm" || !registration || !badge) return;
    if (!sessionToken) return finish(scanFailureOutcome("session_expired"));
    const { participant } = state;
    const retryable = (error: ScanOutcome) => setState({ step: "confirm", participant, submitting: false, error });
    setState({ step: "confirm", participant, submitting: true, error: null });
    const result = await run(
      () => checkIn({ sessionToken, registrationQrCodeToken: registration, badgeQrCodeToken: badge }),
      "Volunteer badge check-in failed",
      (outcome) => outcome === scanFailureOutcome("network") ? retryable(outcome) : finish(outcome),
    );
    if (!result) return;
    if (result.status === "success") return finish(checkedInOutcome(participant.name));
    if (result.status === "rate_limited") return retryable(checkInStepOutcome(result));
    failAtBadge(participant, result);
  }, [checkIn, failAtBadge, finish, run, sessionToken, state]);

  /** One step back: confirm → badge, badge → registration. Ignores any response in flight. */
  const back = useCallback(() => {
    requestRef.current += 1;
    busyRef.current = false;
    if (state.step === "confirm" || state.step === "checking_badge") {
      badgeRef.current = null;
      setState({ step: "badge", participant: state.participant, error: null });
      return;
    }
    clear();
    setState({ step: "registration", error: null });
  }, [clear, state]);

  /** Back to the registration scan with nothing kept. */
  const restart = useCallback(() => {
    clear();
    setState({ step: "registration", error: null });
  }, [clear]);

  return { state, scanRegistration, scanBadge, confirm, back, restart };
}
