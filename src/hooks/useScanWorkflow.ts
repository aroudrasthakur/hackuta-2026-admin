import { useCallback, useEffect, useRef, useState } from "react";
import type { GenericId } from "convex/values";
import { useMutation } from "../convex/reactBindings";
import { awardEventPointsRef, redeemMealRef, resolveQrForMealRef, resolveQrForScanRef } from "../convex/adminApi";
import { normalizeBadgeQr } from "../../shared/admin/qrValues";
import {
  awardOutcome,
  foodOutcome,
  INVALID_QR_OUTCOME,
  previewOutcome,
  scanErrorOutcome,
  scanFailureOutcome,
  withScanTimeout,
  type ScanOutcome,
  type ScanPreview,
  type ScanPurpose,
} from "../lib/scanResults";
import { useAdminAuth } from "./useAdminAuth";

export type ScanWorkflowState =
  | { step: "scan" }
  | { step: "resolving" }
  | { step: "confirm"; preview: ScanPreview; submitting: boolean; error: ScanOutcome | null }
  | { step: "result"; outcome: ScanOutcome };

/**
 * Badge scan → confirm → result for food or points, for the selected event or
 * meal. The preview only identifies the participant; the confirmation
 * mutation re-runs every check on the server and its result is what the
 * volunteer sees. Registration QR codes are rejected by the server.
 *
 * The badge value lives only in a ref between preview and confirmation and is
 * dropped on any result, reset, or unmount. Remount when the purpose, event,
 * meal, or meal schedule changes to clear the previous participant.
 */
export function useScanWorkflow(purpose: ScanPurpose, eventId?: GenericId<"events">, mealPeriodId?: GenericId<"mealPeriods">) {
  const { sessionToken } = useAdminAuth();
  const resolve = useMutation(resolveQrForScanRef);
  const resolveMeal = useMutation(resolveQrForMealRef);
  const redeemFood = useMutation(redeemMealRef);
  const awardPoints = useMutation(awardEventPointsRef);
  const [state, setState] = useState<ScanWorkflowState>({ step: "scan" });
  const tokenRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const requestRef = useRef(0);

  useEffect(() => () => {
    requestRef.current += 1;
    tokenRef.current = null;
  }, []);

  const finish = useCallback((outcome: ScanOutcome) => {
    tokenRef.current = null;
    setState({ step: "result", outcome });
  }, []);

  const scan = useCallback(async (rawValue: string) => {
    if (busyRef.current || tokenRef.current) return;
    const token = normalizeBadgeQr(rawValue);
    if (!token) return finish(INVALID_QR_OUTCOME);
    if (!sessionToken) return finish(scanFailureOutcome("session_expired"));
    if (purpose === "point_scan" && !eventId) return finish(scanFailureOutcome("event_denied"));
    if (purpose === "food_check_in" && !mealPeriodId) return finish(scanFailureOutcome("meal_not_active"));

    busyRef.current = true;
    const request = ++requestRef.current;
    setState({ step: "resolving" });
    try {
      const preview = await withScanTimeout(() => purpose === "food_check_in" && mealPeriodId
        ? resolveMeal({ sessionToken, qrCodeToken: token, mealPeriodId })
        : resolve({ sessionToken, qrCodeToken: token, purpose, ...(eventId ? { eventId } : {}) }));
      if (request !== requestRef.current) return;
      const ended = previewOutcome(preview);
      if (ended) return finish(ended);
      tokenRef.current = token;
      setState({ step: "confirm", preview: preview as ScanPreview, submitting: false, error: null });
    } catch (caught) {
      if (request === requestRef.current) finish(scanErrorOutcome(caught, "Volunteer QR lookup failed"));
    } finally {
      if (request === requestRef.current) busyRef.current = false;
    }
  }, [eventId, finish, mealPeriodId, purpose, resolve, resolveMeal, sessionToken]);

  const confirm = useCallback(async () => {
    const token = tokenRef.current;
    if (busyRef.current || state.step !== "confirm" || !token) return;
    if (!sessionToken) return finish(scanFailureOutcome("session_expired"));
    const { preview } = state;
    busyRef.current = true;
    const request = ++requestRef.current;
    setState({ ...state, submitting: true, error: null });

    const retryable = (outcome: ScanOutcome) => {
      setState({ step: "confirm", preview, submitting: false, error: outcome });
    };
    try {
      const name = preview.participant.name;
      const args = { sessionToken, qrCodeToken: token };
      let outcome: ScanOutcome;
      let rateLimited: boolean;
      if (preview.purpose === "point_scan") {
        const result = await withScanTimeout(() => awardPoints({ ...args, eventId: preview.event.eventId }));
        outcome = awardOutcome(result, name, preview.event.name);
        rateLimited = result.status === "rate_limited";
      } else if (preview.purpose === "food_check_in") {
        const result = await withScanTimeout(() => redeemFood({ ...args, mealPeriodId: preview.meal.mealPeriodId }));
        outcome = foodOutcome(result, name);
        rateLimited = result.status === "rate_limited";
      } else {
        return finish(scanFailureOutcome("unexpected"));
      }
      if (request !== requestRef.current) return;
      if (rateLimited) retryable(outcome);
      else finish(outcome);
    } catch (caught) {
      if (request !== requestRef.current) return;
      const outcome = scanErrorOutcome(caught, "Volunteer scan confirmation failed");
      if (outcome === scanFailureOutcome("network")) retryable(outcome);
      else finish(outcome);
    } finally {
      if (request === requestRef.current) busyRef.current = false;
    }
  }, [awardPoints, finish, redeemFood, sessionToken, state]);

  /** Back to scanning. Ignores any response still in flight. */
  const reset = useCallback(() => {
    requestRef.current += 1;
    busyRef.current = false;
    tokenRef.current = null;
    setState({ step: "scan" });
  }, []);

  return { state, scan, confirm, reset };
}
