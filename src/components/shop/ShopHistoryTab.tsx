import { useId, useState } from "react";
import { useMutation, usePaginatedQuery } from "../../convex/reactBindings";
import {
  listShopRedemptionsRef,
  refundShopRedemptionRef,
  type ShopRedemptionRow,
} from "../../convex/adminApi";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { formatPoints, formatShopTime } from "../../lib/shopFormat";
import { reportUserFacingError } from "../../lib/userFacingError";
import { SHOP_REASON_MAX_LENGTH } from "../../../shared/admin/shopRules";
import { AdminStatusBadge } from "../AdminStatusBadge";
import { LoadingState } from "../states/LoadingState";
import { ShopDialog } from "./ShopDialog";

const PAGE_SIZE = 25;

function RefundDialog({ purchase, onClose, onDone }: {
  purchase: ShopRedemptionRow;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { sessionToken } = useAdminAuth();
  const refund = useMutation(refundShopRedemptionRef);
  const id = useId();
  const [reason, setReason] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setShowErrors(true);
    if (!sessionToken || saving || !reason.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await refund({ sessionToken, redemptionId: purchase.redemptionId, reason: reason.trim() });
      onDone(`${formatPoints(purchase.totalPointsSpent)} points returned to ${purchase.participant.name}.`);
    } catch (caught) {
      setError(reportUserFacingError("Unable to refund purchase", caught, "We couldn't refund this purchase. Please try again.", { source: "ShopHistoryTab.refund" }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ShopDialog
      title="Refund purchase"
      description={`${purchase.participant.name} · ${formatShopTime(purchase.redeemedAt)}`}
      onClose={onClose}
      onSubmit={() => void submit()}
      footer={<>
        <button type="button" className="shop-pill" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="submit" className="shop-pill shop-pill--danger" disabled={saving} aria-busy={saving || undefined}>{saving ? "Refunding…" : "Refund points"}</button>
      </>}
    >
      <dl className="shop-summary">
        <div><dt>Item</dt><dd>{purchase.quantity} × {purchase.item.name}</dd></div>
        <div><dt>Sold by</dt><dd>{purchase.volunteer.name}</dd></div>
        <div className="shop-summary__total"><dt>Points returned</dt><dd>{formatPoints(purchase.totalPointsSpent)}</dd></div>
      </dl>
      <label className="admin-field" htmlFor={`${id}-reason`}>
        Reason
        <textarea id={`${id}-reason`} className="admin-field__control min-h-20" value={reason} maxLength={SHOP_REASON_MAX_LENGTH} placeholder="For example: wrong size, item returned" aria-invalid={showErrors && !reason.trim() ? true : undefined} onChange={(event) => setReason(event.target.value)} />
      </label>
      {showErrors && !reason.trim() ? <p className="shop-field-error">Add a reason for the refund.</p> : <p className="text-sm text-muted">Required. A purchase can be refunded once.</p>}
      {error ? <p role="alert" className="admin-callout admin-callout--alert">{error}</p> : null}
    </ShopDialog>
  );
}

/** Purchase history with refunds. */
export function ShopHistoryTab() {
  const { sessionToken } = useAdminAuth();
  const searchId = useId();
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [refunding, setRefunding] = useState<ShopRedemptionRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { results, status, loadMore } = usePaginatedQuery(
    listShopRedemptionsRef,
    sessionToken ? { sessionToken, ...(search ? { search } : {}) } : "skip",
    { initialNumItems: PAGE_SIZE },
  );

  if (!sessionToken) return <LoadingState layout="rows" message="Loading purchases…" />;

  return (
    <div className="grid gap-5">
      {notice ? <p role="status" className="admin-callout admin-callout--success">{notice}</p> : null}
      <section aria-label="Purchases" className="shop-tablet">
        <form className="shop-toolbar" role="search" onSubmit={(event) => { event.preventDefault(); setSearch(draft.trim()); }}>
          <div className="shop-toolbar__group">
            <label className="admin-field" htmlFor={searchId}>
              <span className="sr-only">Search purchases</span>
              <input id={searchId} type="search" className="admin-field__control" maxLength={100} placeholder="Search participant, item or volunteer" value={draft} onChange={(event) => setDraft(event.target.value)} />
            </label>
            <button type="submit" className="shop-pill">Search</button>
            {search ? <button type="button" className="shop-pill shop-pill--ghost" onClick={() => { setDraft(""); setSearch(""); }}>Clear</button> : null}
          </div>
          <p className="text-sm text-muted">{status === "LoadingFirstPage" ? "Loading…" : `${results.length} purchases shown`}</p>
        </form>
        {status === "LoadingFirstPage" ? <LoadingState layout="rows" message="Loading purchases…" /> : (
          <div className="shop-table-scroll">
            <table className="admin-table shop-table">
              <thead>
                <tr><th scope="col">Time</th><th scope="col">Participant</th><th scope="col">Item</th><th scope="col">Qty</th><th scope="col">Points charged</th><th scope="col">Volunteer</th><th scope="col">Promotion</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Refund</span></th></tr>
              </thead>
              <tbody>
                {results.length === 0 ? (
                  <tr><td colSpan={9} className="py-8 text-center text-muted">{search ? "No purchases match." : "No purchases yet."}</td></tr>
                ) : results.map((row) => (
                  <tr key={row.redemptionId}>
                    <td className="whitespace-nowrap tabular-nums">{formatShopTime(row.redeemedAt)}</td>
                    <th scope="row" className="font-semibold text-night">{row.participant.name}</th>
                    <td>{row.item.name}</td>
                    <td className="tabular-nums">{row.quantity}</td>
                    <td className="font-bold tabular-nums text-night">{formatPoints(row.totalPointsSpent)}</td>
                    <td>{row.volunteer.name}</td>
                    <td>{row.flashSale ? <AdminStatusBadge tone="info">{row.flashSale.title}</AdminStatusBadge> : <span className="text-muted">None</span>}</td>
                    <td>
                      {row.refund ? (
                        <span className="grid gap-1">
                          <AdminStatusBadge tone="warning">Refunded</AdminStatusBadge>
                          <span className="text-xs text-muted">{row.refund.reason} · {row.refund.refundedBy.name}</span>
                        </span>
                      ) : <AdminStatusBadge tone="positive">Completed</AdminStatusBadge>}
                    </td>
                    <td>{row.refund ? null : <button type="button" className="shop-pill shop-pill--sm shop-pill--ghost" aria-label={`Refund ${row.participant.name}'s ${row.item.name}`} onClick={() => setRefunding(row)}>Refund</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {status === "CanLoadMore" ? <div className="p-4"><button type="button" className="shop-pill shop-pill--sm" onClick={() => loadMore(PAGE_SIZE)}>Show more</button></div> : null}
      </section>
      {refunding ? <RefundDialog purchase={refunding} onClose={() => setRefunding(null)} onDone={(message) => { setRefunding(null); setNotice(message); }} /> : null}
    </div>
  );
}
