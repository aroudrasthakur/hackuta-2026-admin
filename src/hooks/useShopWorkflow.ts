import { useCallback, useRef, useState } from "react";
import type { GenericId } from "convex/values";
import { useMutation } from "../convex/reactBindings";
import { purchaseShopItemRef, resolveQrForScanRef } from "../convex/adminApi";
import { normalizeBadgeQr } from "../../shared/admin/qrValues";
import {
  INVALID_QR_OUTCOME,
  previewOutcome,
  scanErrorOutcome,
  scanFailureOutcome,
  withScanTimeout,
  type ScanOutcome,
} from "../lib/scanResults";
import {
  newIdempotencyKey,
  purchaseOutcome,
  type ShopCustomerInfo,
  type ShopReceipt,
  type ShopScanPreview,
} from "../lib/shopScanResults";
import { useAdminAuth } from "./useAdminAuth";

export type ShopSelection = { itemId: GenericId<"shopItems">; quantity: number };

export type ShopWorkflowState =
  | { step: "scan" }
  | { step: "resolving" }
  | { step: "choose"; customer: ShopCustomerInfo; selection: ShopSelection | null; notice: ScanOutcome | null }
  | { step: "review"; customer: ShopCustomerInfo; selection: ShopSelection; submitting: boolean; error: ScanOutcome | null }
  | { step: "result"; outcome: ScanOutcome; receipt: ShopReceipt | null; customer: ShopCustomerInfo | null };

/**
 * Badge scan → choose → review → result for shop sales. The scanned badge value
 * stays in a ref and is sent again with the purchase, which re-checks everything on
 * the server. One idempotency key is made when Review opens and reused for
 * every retry of that purchase, so a double tap or a lost response never
 * charges twice. Scan next clears the token and the key.
 */
export function useShopWorkflow() {
  const { sessionToken } = useAdminAuth();
  const resolve = useMutation(resolveQrForScanRef);
  const purchase = useMutation(purchaseShopItemRef);
  const [state, setState] = useState<ShopWorkflowState>({ step: "scan" });
  const tokenRef = useRef<string | null>(null);
  const keyRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const requestRef = useRef(0);

  const finish = useCallback((outcome: ScanOutcome, customer: ShopCustomerInfo | null = null, receipt: ShopReceipt | null = null) => {
    if (!customer) tokenRef.current = null;
    keyRef.current = null;
    setState({ step: "result", outcome, receipt, customer });
  }, []);

  const scan = useCallback(async (rawValue: string) => {
    if (busyRef.current || tokenRef.current) return;
    const token = normalizeBadgeQr(rawValue);
    if (!token) return finish(INVALID_QR_OUTCOME);
    if (!sessionToken) return finish(scanFailureOutcome("session_expired"));
    busyRef.current = true;
    const request = ++requestRef.current;
    setState({ step: "resolving" });
    try {
      const preview = await withScanTimeout(() => resolve({ sessionToken, qrCodeToken: token, purpose: "shop" }));
      if (request !== requestRef.current) return;
      const ended = previewOutcome(preview);
      if (ended) return finish(ended);
      if (preview.status !== "ok" || preview.purpose !== "shop") return finish(scanFailureOutcome("unexpected"));
      tokenRef.current = token;
      setState({ step: "choose", customer: (preview as ShopScanPreview).participant, selection: null, notice: null });
    } catch (caught) {
      if (request === requestRef.current) finish(scanErrorOutcome(caught, "Volunteer shop QR lookup failed"));
    } finally {
      if (request === requestRef.current) busyRef.current = false;
    }
  }, [finish, resolve, sessionToken]);

  const select = useCallback((selection: ShopSelection | null) => {
    setState((current) => current.step === "choose" ? { ...current, selection, notice: null } : current);
  }, []);

  const review = useCallback(() => {
    if (state.step !== "choose" || !state.selection) return;
    keyRef.current ??= newIdempotencyKey();
    setState({ step: "review", customer: state.customer, selection: state.selection, submitting: false, error: null });
  }, [state]);

  /** Back to item choice for the same participant. A new choice gets a new key. */
  const chooseAgain = useCallback((notice: ScanOutcome | null = null) => {
    if (state.step !== "review" && state.step !== "result") return;
    if (!state.customer || !tokenRef.current || busyRef.current) return;
    keyRef.current = null;
    setState({ step: "choose", customer: state.customer, selection: state.step === "review" ? state.selection : null, notice });
  }, [state]);

  const confirm = useCallback(async (expectedUnitPointsCost: number) => {
    const token = tokenRef.current;
    const key = keyRef.current;
    if (busyRef.current || state.step !== "review" || !token || !key) return;
    if (!sessionToken) return finish(scanFailureOutcome("session_expired"));
    const { customer, selection } = state;
    busyRef.current = true;
    const request = ++requestRef.current;
    setState({ ...state, submitting: true, error: null });
    const retry = (error: ScanOutcome) => setState({ step: "review", customer, selection, submitting: false, error });
    try {
      const result = await withScanTimeout(() => purchase({
        sessionToken,
        qrCodeToken: token,
        itemId: selection.itemId,
        quantity: selection.quantity,
        expectedUnitPointsCost,
        idempotencyKey: key,
      }));
      if (request !== requestRef.current) return;
      const { outcome, next, receipt } = purchaseOutcome(result, customer.name);
      if (next === "review") retry(outcome);
      else finish(outcome, next === "choose" ? customer : null, receipt);
    } catch (caught) {
      if (request !== requestRef.current) return;
      const outcome = scanErrorOutcome(caught, "Volunteer shop purchase failed");
      if (outcome === scanFailureOutcome("network")) retry(outcome);
      else finish(outcome);
    } finally {
      if (request === requestRef.current) busyRef.current = false;
    }
  }, [finish, purchase, sessionToken, state]);

  /** Scan next. Ignores any response still in flight. */
  const reset = useCallback(() => {
    requestRef.current += 1;
    busyRef.current = false;
    tokenRef.current = null;
    keyRef.current = null;
    setState({ step: "scan" });
  }, []);

  return { state, scan, select, review, chooseAgain, confirm, reset };
}
