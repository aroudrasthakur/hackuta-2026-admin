import { useId, useState } from "react";
import type { GenericId } from "convex/values";
import { useMutation, useQuery } from "../../convex/reactBindings";
import {
  cancelFlashSaleRef,
  createFlashSaleRef,
  listFlashSalesRef,
  listShopItemsAdminRef,
  updateFlashSaleRef,
  type FlashSaleRow,
  type ShopItemAdminRow,
} from "../../convex/adminApi";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { usePriceClock, useWatchPriceChange } from "../../hooks/usePriceClock";
import { formatPoints, formatShopTime, fromDateTimeInput, parseWholeNumber, SALE_STATUS, toDateTimeInput } from "../../lib/shopFormat";
import { reportUserFacingError } from "../../lib/userFacingError";
import { FLASH_SALE_MESSAGE_MAX_LENGTH, FLASH_SALE_TITLE_MAX_LENGTH } from "../../../shared/admin/shopRules";
import { AdminStatusBadge } from "../AdminStatusBadge";
import { LoadingState } from "../states/LoadingState";

type ItemId = GenericId<"shopItems">;
type SaleItemDraft = { itemId: ItemId; price: string };
type Draft = { flashSaleId: FlashSaleRow["flashSaleId"] | null; title: string; message: string; startsAt: string; endsAt: string; items: SaleItemDraft[] };

const HOUR_MS = 60 * 60 * 1000;

function emptyDraft(): Draft {
  const start = Math.ceil(Date.now() / (15 * 60 * 1000)) * 15 * 60 * 1000;
  return { flashSaleId: null, title: "", message: "", startsAt: toDateTimeInput(start), endsAt: toDateTimeInput(start + HOUR_MS), items: [] };
}

function draftFromSale(sale: FlashSaleRow): Draft {
  return {
    flashSaleId: sale.flashSaleId,
    title: sale.title,
    message: sale.message,
    startsAt: toDateTimeInput(sale.startsAt),
    endsAt: toDateTimeInput(sale.endsAt),
    items: sale.items.map((item) => ({ itemId: item.itemId, price: String(item.salePointsCost) })),
  };
}

/** Problems the server would also reject, in words that name the field. */
function draftProblems(draft: Draft, items: ShopItemAdminRow[]) {
  const problems: string[] = [];
  const startsAt = fromDateTimeInput(draft.startsAt);
  const endsAt = fromDateTimeInput(draft.endsAt);
  if (!draft.title.trim()) problems.push("Enter a title.");
  if (startsAt === null || endsAt === null) problems.push("Choose a start and end date and time.");
  else if (endsAt <= startsAt) problems.push("The sale must end after it starts.");
  else if (endsAt <= Date.now()) problems.push("The sale must end in the future.");
  if (draft.items.length === 0) problems.push("Add at least one item to the sale.");
  for (const entry of draft.items) {
    const item = items.find((candidate) => candidate.itemId === entry.itemId);
    const price = parseWholeNumber(entry.price, 1);
    if (item && (price === null || price >= item.pointsCost)) {
      problems.push(`${item.name}: the sale price must be between 1 and ${formatPoints(item.pointsCost - 1)} points.`);
    }
  }
  return { problems, startsAt, endsAt };
}

function SaleCard({ sale, busy, onEdit, onCancel }: {
  sale: FlashSaleRow;
  busy: boolean;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const live = sale.status === "live";
  const status = SALE_STATUS[sale.status];
  return (
    <li className={`shop-sale${live ? " shop-sale--live" : ""}`}>
      <div className="shop-sale__head">
        <h3>{sale.title}</h3>
        <AdminStatusBadge tone={status.tone} {...(live ? { className: "admin-badge--sale" } : {})}>{status.label}</AdminStatusBadge>
      </div>
      <p className="shop-sale__meta">{formatShopTime(sale.startsAt)} to {formatShopTime(sale.endsAt)}</p>
      <div className="flex flex-wrap gap-2">
        {sale.items.map((item) => (
          <span key={item.itemId} className="shop-chip">
            {item.name}: {formatPoints(item.salePointsCost)}{item.pointsCost !== null ? ` (was ${formatPoints(item.pointsCost)})` : ""}
          </span>
        ))}
      </div>
      {sale.status === "scheduled" || live ? (
        <div className="flex flex-wrap gap-2">
          {sale.status === "scheduled" ? <button type="button" className="shop-pill shop-pill--sm" onClick={onEdit}>Edit</button> : null}
          {confirming ? (
            <>
              <button type="button" className="shop-pill shop-pill--sm shop-pill--danger" disabled={busy} onClick={onCancel}>Confirm cancel</button>
              <button type="button" className="shop-pill shop-pill--sm" onClick={() => setConfirming(false)}>Keep sale</button>
            </>
          ) : (
            <button type="button" className="shop-pill shop-pill--sm shop-pill--danger" onClick={() => setConfirming(true)}>Cancel sale</button>
          )}
        </div>
      ) : null}
    </li>
  );
}

/** Sales list and the schedule/edit form. Overlaps and prices are checked again on the server. */
export function FlashSalesTab() {
  const { sessionToken } = useAdminAuth();
  const { nowBucket, watch } = usePriceClock();
  const sales = useQuery(listFlashSalesRef, sessionToken ? { sessionToken, nowBucket } : "skip");
  const itemData = useQuery(listShopItemsAdminRef, sessionToken ? { sessionToken, nowBucket } : "skip");
  useWatchPriceChange(watch, itemData?.nextPriceChangeAt);
  const create = useMutation(createFlashSaleRef);
  const update = useMutation(updateFlashSaleRef);
  const cancel = useMutation(cancelFlashSaleRef);
  const id = useId();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!sessionToken || sales === undefined || itemData === undefined) {
    return <LoadingState layout="rows" message="Loading flash sales…" />;
  }
  const saleable = itemData.items.filter((item) => item.status !== "archived");
  const unused = saleable.filter((item) => !draft.items.some((entry) => entry.itemId === item.itemId));

  function patch(next: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  function setItem(index: number, next: Partial<SaleItemDraft>) {
    setDraft((current) => ({ ...current, items: current.items.map((entry, at) => at === index ? { ...entry, ...next } : entry) }));
  }

  function addItem() {
    const next = unused[0];
    if (next) patch({ items: [...draft.items, { itemId: next.itemId, price: String(Math.max(1, Math.round(next.pointsCost * 0.8))) }] });
  }

  async function submit() {
    if (!sessionToken || busy) return;
    const checked = draftProblems(draft, itemData!.items);
    setProblems(checked.problems);
    setError(null);
    setNotice(null);
    if (checked.problems.length > 0 || checked.startsAt === null || checked.endsAt === null) return;
    setBusy(true);
    try {
      const fields = {
        sessionToken,
        title: draft.title.trim(),
        message: draft.message.trim(),
        startsAt: checked.startsAt,
        endsAt: checked.endsAt,
        items: draft.items.map((entry) => ({ itemId: entry.itemId, salePointsCost: Number(entry.price) })),
      };
      if (draft.flashSaleId) await update({ ...fields, flashSaleId: draft.flashSaleId });
      else await create(fields);
      setNotice(draft.flashSaleId ? "Sale updated." : "Sale scheduled. Participants get the notification when it starts.");
      setDraft(emptyDraft());
    } catch (caught) {
      setError(reportUserFacingError("Unable to save flash sale", caught, "We couldn't save this sale. Please try again.", { source: "FlashSalesTab.submit" }));
    } finally {
      setBusy(false);
    }
  }

  async function cancelSale(sale: FlashSaleRow) {
    if (!sessionToken || busy) return;
    setBusy(true);
    setError(null);
    try {
      await cancel({ sessionToken, flashSaleId: sale.flashSaleId });
      setNotice(`${sale.title} cancelled. Normal prices are back and the notification was withdrawn.`);
      if (draft.flashSaleId === sale.flashSaleId) setDraft(emptyDraft());
    } catch (caught) {
      setError(reportUserFacingError("Unable to cancel flash sale", caught, "We couldn't cancel this sale. Please try again.", { source: "FlashSalesTab.cancel" }));
    } finally {
      setBusy(false);
    }
  }

  const field = (key: string) => `${id}-${key}`;
  return (
    <div className="shop-layout">
      <section aria-labelledby="flash-sales-heading" className="shop-tablet">
        <div className="shop-tablet__body">
          <div>
            <h2 id="flash-sales-heading" className="shop-tablet__title">Flash sales</h2>
            <p className="shop-tablet__hint">A sale changes prices only between its start and end. Normal prices return on their own.</p>
          </div>
          {notice ? <p role="status" className="admin-callout admin-callout--success">{notice}</p> : null}
          {sales.length === 0 ? <p className="text-sm text-muted">No flash sales yet.</p> : (
            <ul className="grid gap-3">
              {sales.map((sale) => (
                <SaleCard key={sale.flashSaleId} sale={sale} busy={busy} onEdit={() => { setProblems([]); setDraft(draftFromSale(sale)); }} onCancel={() => void cancelSale(sale)} />
              ))}
            </ul>
          )}
        </div>
      </section>

      <form noValidate aria-labelledby={field("heading")} className="shop-tablet shop-tablet--paper" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <div className="shop-tablet__body">
          <div>
            <h2 id={field("heading")} className="shop-tablet__title">{draft.flashSaleId ? "Edit flash sale" : "New flash sale"}</h2>
            <p className="shop-tablet__hint">Participants get a notification when the sale starts.</p>
          </div>
          <label className="admin-field" htmlFor={field("title")}>
            Title
            <input id={field("title")} className="admin-field__control" maxLength={FLASH_SALE_TITLE_MAX_LENGTH} value={draft.title} onChange={(event) => patch({ title: event.target.value })} />
          </label>
          <label className="admin-field" htmlFor={field("message")}>
            Notification message
            <textarea id={field("message")} className="admin-field__control min-h-20" maxLength={FLASH_SALE_MESSAGE_MAX_LENGTH} value={draft.message} onChange={(event) => patch({ message: event.target.value })} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <label className="admin-field" htmlFor={field("starts")}>
              Starts
              <input id={field("starts")} type="datetime-local" className="admin-field__control" value={draft.startsAt} onChange={(event) => patch({ startsAt: event.target.value })} />
            </label>
            <label className="admin-field" htmlFor={field("ends")}>
              Ends
              <input id={field("ends")} type="datetime-local" className="admin-field__control" value={draft.endsAt} onChange={(event) => patch({ endsAt: event.target.value })} />
            </label>
          </div>
          <fieldset className="grid gap-1">
            <legend className="admin-field">Items and sale prices</legend>
            {draft.items.map((entry, index) => {
              const item = itemData.items.find((candidate) => candidate.itemId === entry.itemId);
              return (
                <div key={entry.itemId} className="shop-sale-row">
                  <label className="admin-field" htmlFor={field(`item-${index}`)}>
                    <span className="sr-only">Item {index + 1}</span>
                    <select id={field(`item-${index}`)} className="admin-field__control" value={entry.itemId} onChange={(event) => setItem(index, { itemId: event.target.value as ItemId })}>
                      {saleable.filter((option) => option.itemId === entry.itemId || !draft.items.some((other) => other.itemId === option.itemId)).map((option) => (
                        <option key={option.itemId} value={option.itemId}>{option.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="admin-field" htmlFor={field(`price-${index}`)}>
                    <span className="sr-only">Sale price for {item?.name ?? `item ${index + 1}`}</span>
                    <input id={field(`price-${index}`)} className="admin-field__control" inputMode="numeric" value={entry.price} onChange={(event) => setItem(index, { price: event.target.value })} />
                  </label>
                  <button type="button" className="shop-pill shop-pill--sm shop-pill--ghost" aria-label={`Remove ${item?.name ?? "item"} from the sale`} onClick={() => patch({ items: draft.items.filter((_, at) => at !== index) })}>Remove</button>
                  {item ? <span className="col-span-3 text-sm text-muted">Normal price {formatPoints(item.pointsCost)} points</span> : null}
                </div>
              );
            })}
            <button type="button" className="shop-pill shop-pill--sm shop-pill--ghost justify-self-start" disabled={unused.length === 0} onClick={addItem}>Add an item</button>
          </fieldset>
          {problems.length > 0 || error ? (
            <div role="alert" className="admin-callout admin-callout--alert">
              <p className="font-semibold">This sale can't be saved yet</p>
              {problems.map((problem) => <p key={problem}>{problem}</p>)}
              {error ? <p>{error}</p> : null}
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="shop-pill" onClick={() => { setProblems([]); setError(null); setDraft(emptyDraft()); }}>{draft.flashSaleId ? "Stop editing" : "Clear"}</button>
            <button type="submit" className="shop-odyssey shop-odyssey--night" disabled={busy} aria-busy={busy || undefined}>{draft.flashSaleId ? "Save sale" : "Schedule sale"}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
