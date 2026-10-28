import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AdminPageHeader } from "../../components/AdminPageHeader";
import { ShopItemThumb } from "../../components/shop/ShopItemThumb";
import { QrScanner, type ScanSource } from "../../components/volunteer/QrScanner";
import { ScanResult } from "../../components/volunteer/ScanResult";
import { ScanSteps } from "../../components/volunteer/ScanSteps";
import { LoadingState } from "../../components/states/LoadingState";
import { useQuery } from "../../convex/reactBindings";
import {
  getShopCustomerRef,
  listShopCatalogForVolunteerRef,
  previewShopPurchaseRef,
  type ShopCatalogItem,
} from "../../convex/adminApi";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { usePriceClock, useWatchPriceChange } from "../../hooks/usePriceClock";
import { useShopWorkflow, type ShopSelection, type ShopWorkflowState } from "../../hooks/useShopWorkflow";
import { scanConfirmButtonClass, scanPrimaryButtonClass, scanSecondaryButtonClass } from "../../lib/scanButtonClasses";
import { formatPoints } from "../../lib/shopFormat";
import type { ShopCustomerInfo, ShopReceipt } from "../../lib/shopScanResults";
import type { ScanOutcome } from "../../lib/scanResults";
import { ADMIN_ROUTES } from "../../types/routes";

const STEPS = ["Scan", "Choose", "Review", "Done"] as const;

function stepIndex(state: ShopWorkflowState) {
  if (state.step === "choose") return 1;
  if (state.step === "review") return 2;
  if (state.step === "result") return 3;
  return 0;
}

/** Live balance; falls back to the scanned value while loading. */
function CustomerCard({ customer, points }: { customer: ShopCustomerInfo; points: number }) {
  return (
    <section aria-label="Participant" className="shop-customer">
      <h2 className="shop-customer__name min-w-0">{customer.name}</h2>
      <p className="shop-customer__points"><strong>{formatPoints(points)}</strong><span>points</span></p>
    </section>
  );
}

function Notice({ outcome }: { outcome: ScanOutcome }) {
  return (
    <div role={outcome.tone === "error" ? "alert" : "status"} className={`admin-callout text-base ${outcome.tone === "error" ? "admin-callout--alert" : "border-amber-500 bg-amber-50 text-amber-950"}`}>
      <p className="font-semibold">{outcome.title}</p>
      <p>{outcome.detail}</p>
    </div>
  );
}

function ItemPicker({ items, maxQuantity, selection, onSelect }: {
  items: ShopCatalogItem[];
  maxQuantity: number;
  selection: ShopSelection | null;
  onSelect: (selection: ShopSelection | null) => void;
}) {
  const selected = items.find((item) => item.itemId === selection?.itemId);
  const max = maxQuantity;
  const quantity = Math.min(selection?.quantity ?? 1, max);
  if (items.length === 0) return <p className="admin-callout text-base">No items are for sale right now. Ask an administrator to add or activate items.</p>;
  return (
    <>
      <h2 className="volunteer-section-title">Choose an item</h2>
      <ul className="grid gap-2">
        {items.map((item) => {
          const onSale = item.unitPointsCost < item.basePointsCost;
          return (
            <li key={item.itemId}>
              <button
                type="button"
                className="shop-pick"
                aria-pressed={selected?.itemId === item.itemId}
                onClick={() => onSelect({ itemId: item.itemId, quantity: 1 })}
              >
                <ShopItemThumb imageUrl={item.imageUrl} />
                <span className="min-w-0">
                  <span className="shop-pick__name">{item.name}</span>
                  {item.description ? <span className="shop-pick__description">{item.description}</span> : null}
                </span>
                <span className="text-right">
                  <span className="shop-price block"><span>{formatPoints(item.unitPointsCost)}</span>{onSale ? <span className="shop-price__was">{formatPoints(item.basePointsCost)}</span> : null}</span>
                  {onSale ? <span className="admin-badge admin-badge--sale mt-1">Sale</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {selected ? (
        <div className="shop-panel flex items-center justify-between">
          <div>
            <p className="font-semibold text-night">Quantity</p>
            <p className="text-sm">Up to {max} per purchase</p>
          </div>
          <span className="shop-stepper shop-stepper--lg">
            <button type="button" aria-label="Fewer" disabled={quantity <= 1} onClick={() => onSelect({ itemId: selected.itemId, quantity: quantity - 1 })}>−</button>
            <output aria-label="Quantity">{quantity}</output>
            <button type="button" aria-label="More" disabled={quantity >= max} onClick={() => onSelect({ itemId: selected.itemId, quantity: quantity + 1 })}>+</button>
          </span>
        </div>
      ) : null}
    </>
  );
}

function Receipt({ receipt }: { receipt: ShopReceipt }) {
  return (
    <dl className="shop-receipt">
      <div><dt>Item</dt><dd>{receipt.quantity} × {receipt.itemName}</dd></div>
      <div><dt>Charged</dt><dd>{formatPoints(receipt.totalPointsSpent)} pts</dd></div>
      <div><dt>New balance</dt><dd>{formatPoints(receipt.pointsAfter)} pts</dd></div>
    </dl>
  );
}

/** Scan → choose → review → done loop for shop sales. */
function ShopWorkflow() {
  const { sessionToken } = useAdminAuth();
  const { state, scan, select, review, chooseAgain, confirm, reset } = useShopWorkflow();
  const [cameraPreferred, setCameraPreferred] = useState(false);
  const { nowBucket, watch } = usePriceClock();
  const shopping = state.step === "choose" || state.step === "review";
  const catalog = useQuery(listShopCatalogForVolunteerRef, sessionToken && shopping ? { sessionToken, nowBucket } : "skip");
  useWatchPriceChange(watch, catalog?.nextPriceChangeAt);
  const customer = shopping ? state.customer : null;
  const live = useQuery(getShopCustomerRef, sessionToken && customer ? { sessionToken, participantId: customer.participantId } : "skip");
  const selection = state.step === "review" ? state.selection : null;
  const preview = useQuery(previewShopPurchaseRef, sessionToken && customer && selection ? {
    sessionToken, participantId: customer.participantId, itemId: selection.itemId, quantity: selection.quantity, nowBucket,
  } : "skip");
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (state.step === "review") headingRef.current?.focus();
  }, [state.step]);

  const points = live?.points ?? customer?.points ?? 0;
  const items = catalog?.items ?? [];

  return (
    <div className="space-y-5">
      <ScanSteps steps={STEPS} current={stepIndex(state)} label="Purchase progress" />
      {state.step === "scan" ? <QrScanner mode="badge" onScan={(value: string, source: ScanSource) => { setCameraPreferred(source === "camera"); void scan(value); }} autoStart={cameraPreferred} /> : null}
      {state.step === "resolving" ? (
        <div className="space-y-3">
          <LoadingState message="Looking up participant…" />
          <button type="button" className={scanSecondaryButtonClass} onClick={reset}>Cancel</button>
        </div>
      ) : null}

      {shopping && customer ? <CustomerCard customer={customer} points={points} /> : null}
      {shopping && live === null ? (
        <Notice outcome={{ tone: "error", title: "Participant not eligible", detail: "This participant can no longer buy from the shop. Nothing was charged." }} />
      ) : null}

      {state.step === "choose" ? (
        <>
          {state.notice ? <Notice outcome={state.notice} /> : null}
          {catalog === undefined ? <LoadingState message="Loading the shop…" /> : (
            <ItemPicker items={items} maxQuantity={catalog.maxQuantity} selection={state.selection} onSelect={select} />
          )}
          <div className="volunteer-confirm__actions">
            <button type="button" className={scanPrimaryButtonClass} disabled={!state.selection || live === null || !items.some((item) => item.itemId === state.selection?.itemId)} onClick={review}>Review purchase</button>
            <button type="button" className={scanSecondaryButtonClass} onClick={reset}>Cancel</button>
          </div>
        </>
      ) : null}

      {state.step === "review" ? (() => {
        const item = items.find((candidate) => candidate.itemId === state.selection.itemId);
        const ready = preview?.status === "ok" ? preview : null;
        const short = ready ? !ready.hasEnoughPoints : false;
        const blocked = preview && preview.status !== "ok";
        return (
          <section aria-labelledby="shop-review-heading" className="shop-panel">
            <h2 id="shop-review-heading" ref={headingRef} tabIndex={-1} className="volunteer-section-title">Review purchase</h2>
            <div className="shop-item-cell">
              <ShopItemThumb imageUrl={item?.imageUrl ?? null} />
              <div><strong>{item?.name ?? "Selected item"}</strong>{ready?.flashSaleId ? <span>Sale price</span> : null}</div>
            </div>
            {ready ? (
              <dl className="shop-summary">
                <div><dt>Price each</dt><dd>{formatPoints(ready.unitPointsCost)} pts</dd></div>
                <div><dt>Quantity</dt><dd>× {ready.quantity}</dd></div>
                <div className="shop-summary__total"><dt>Total</dt><dd>{formatPoints(ready.totalPointsCost)} pts</dd></div>
                <div><dt>Balance after</dt><dd className={short ? "text-negative" : ""}>{short ? "Not enough" : `${formatPoints(ready.pointsAfter)} pts`}</dd></div>
              </dl>
            ) : blocked ? null : <LoadingState message="Checking the price…" />}
            {short && ready ? (
              <div role="alert" className="admin-callout admin-callout--alert text-base">
                <p className="font-semibold">Not enough points</p>
                <p>{customer?.name} has {formatPoints(ready.points)} points and needs {formatPoints(ready.totalPointsCost)}. Lower the quantity or pick another item.</p>
              </div>
            ) : null}
            {blocked ? <div role="alert" className="admin-callout admin-callout--alert text-base"><p className="font-semibold">This purchase can't go ahead</p><p>The item or participant is no longer available. Go back and choose again.</p></div> : null}
            {state.error ? <Notice outcome={state.error} /> : ready && !short ? <p className="text-base">Hand over the item after you confirm. The points come off right away.</p> : null}
            <div className="volunteer-confirm__actions">
              <button
                type="button"
                className={scanConfirmButtonClass}
                disabled={!ready || short || state.submitting || live === null}
                aria-busy={state.submitting || undefined}
                onClick={() => ready && void confirm(ready.unitPointsCost)}
              >
                {state.submitting ? "Saving…" : ready ? `Confirm · ${formatPoints(ready.totalPointsCost)} pts` : "Confirm purchase"}
              </button>
              <button type="button" className={scanSecondaryButtonClass} disabled={state.submitting} onClick={() => chooseAgain()}>Change item</button>
            </div>
          </section>
        );
      })() : null}

      {state.step === "result" ? (
        <ScanResult
          outcome={state.outcome}
          onScanNext={reset}
          secondaryAction={state.customer ? <button type="button" className={scanSecondaryButtonClass} onClick={() => chooseAgain()}>Choose another item</button> : undefined}
        >
          {state.receipt ? <Receipt receipt={state.receipt} /> : null}
        </ScanResult>
      ) : null}
    </div>
  );
}

/** Volunteer shop sales. The route guard already requires `canRedeemShop`. */
export function VolunteerShopPage() {
  const { staff } = useAdminAuth();
  const scanHubBackLabel =
    staff?.role === "admin" ? "Back to Scan" : "Back to volunteer dashboard";

  return (
    <section aria-labelledby="shop-scan-heading" className="volunteer-ops volunteer-scan-shell space-y-6">
      <AdminPageHeader id="shop-scan-heading" title="Shop redemption" description="Scan the participant's badge, choose their item, then confirm the purchase." />
      <ShopWorkflow />
      <Link className="volunteer-back-link" to={ADMIN_ROUTES.scan}>{scanHubBackLabel}</Link>
    </section>
  );
}
