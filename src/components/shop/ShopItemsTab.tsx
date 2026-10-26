import { useId, useMemo, useState } from "react";
import { useMutation, useQuery } from "../../convex/reactBindings";
import {
  adjustShopStockRef,
  listShopItemsAdminRef,
  updateShopItemRef,
  type ShopItemAdminRow,
} from "../../convex/adminApi";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { usePriceClock, useWatchPriceChange } from "../../hooks/usePriceClock";
import { formatPoints, ITEM_STATUS, STOCK_STATUS } from "../../lib/shopFormat";
import { reportUserFacingError } from "../../lib/userFacingError";
import { AdminStatusBadge } from "../AdminStatusBadge";
import { EmptyState } from "../states/EmptyState";
import { LoadingState } from "../states/LoadingState";
import { ShopItemForm } from "./ShopItemForm";
import { ShopItemThumb, ShopPrice } from "./ShopItemThumb";
import { ShopVolunteersPanel } from "./ShopVolunteersPanel";
import { StockAdjustDialog } from "./StockAdjustDialog";

type Filter = "current" | "active" | "low" | "archived" | "all";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "current", label: "Active and inactive" },
  { value: "active", label: "Active only" },
  { value: "low", label: "Low or out of stock" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All items" },
];

function matchesFilter(item: ShopItemAdminRow, filter: Filter) {
  if (filter === "current") return item.status !== "archived";
  if (filter === "active") return item.status === "active";
  if (filter === "low") return item.status !== "archived" && item.stockStatus !== "in_stock";
  if (filter === "archived") return item.status === "archived";
  return true;
}

type Editing = { kind: "add" } | { kind: "edit"; item: ShopItemAdminRow } | { kind: "adjust"; item: ShopItemAdminRow } | null;

/** Item table with quick stock controls, plus the add/edit drawer and the shop volunteer switches. */
export function ShopItemsTab() {
  const { sessionToken } = useAdminAuth();
  const { nowBucket, watch } = usePriceClock();
  const data = useQuery(listShopItemsAdminRef, sessionToken ? { sessionToken, nowBucket } : "skip");
  useWatchPriceChange(watch, data?.nextPriceChangeAt);
  const adjust = useMutation(adjustShopStockRef);
  const update = useMutation(updateShopItemRef);
  const searchId = useId();
  const filterId = useId();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("current");
  const [editing, setEditing] = useState<Editing>(null);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.items ?? []).filter((item) => matchesFilter(item, filter) && (!term || item.name.toLowerCase().includes(term)));
  }, [data, filter, search]);

  function done(message: string) {
    setEditing(null);
    setError(null);
    setNotice(message);
  }

  async function run(item: ShopItemAdminRow, action: () => Promise<unknown>, success: string, failure: string) {
    if (!sessionToken || busyItem) return;
    setBusyItem(item.itemId);
    setError(null);
    try {
      await action();
      setNotice(success);
    } catch (caught) {
      setError(reportUserFacingError(failure, caught, `${failure}. Please try again.`, { source: "ShopItemsTab" }));
    } finally {
      setBusyItem(null);
    }
  }

  function quickAdjust(item: ShopItemAdminRow, delta: 1 | -1) {
    const label = delta > 0 ? "+1" : "−1";
    void run(
      item,
      () => adjust({ sessionToken: sessionToken!, itemId: item.itemId, kind: "manual", delta, reason: `Quick adjust ${delta > 0 ? "+1" : "-1"}` }),
      `${item.name}: stock ${label}, now ${formatPoints(item.stockQuantity + delta)}. Logged as a quick adjustment.`,
      "We couldn't change the stock",
    );
  }

  function toggleFeatured(item: ShopItemAdminRow) {
    void run(
      item,
      () => update({
        sessionToken: sessionToken!,
        itemId: item.itemId,
        name: item.name,
        description: item.description,
        pointsCost: item.pointsCost,
        featured: !item.featured,
        lowStockThreshold: item.lowStockThreshold,
      }),
      item.featured ? `${item.name} is no longer featured.` : `${item.name} is featured.`,
      "We couldn't update the featured items",
    );
  }

  if (!sessionToken || data === undefined) return <LoadingState layout="rows" message="Loading shop items…" />;

  const current = data.items.filter((item) => item.status !== "archived");
  const stats = [
    ["Active items", data.items.filter((item) => item.status === "active").length],
    ["Units in stock", current.reduce((total, item) => total + item.stockQuantity, 0)],
    ["Low stock", current.filter((item) => item.stockStatus === "low").length],
    ["Out of stock", current.filter((item) => item.stockStatus === "out").length],
  ] as const;

  return (
    <div className="grid gap-5">
      <div className="grid min-w-0 gap-5">
        <div className="flex flex-wrap items-center gap-4">
          <dl aria-label="Inventory summary" className="shop-stats min-w-0 flex-1">
            {stats.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{formatPoints(value)}</dd></div>)}
          </dl>
          <button type="button" className="shop-odyssey" onClick={() => setEditing({ kind: "add" })}>Add item</button>
        </div>
        {error ? <p role="alert" className="admin-callout admin-callout--alert">{error}</p> : null}
        {notice ? <p role="status" className="admin-callout admin-callout--success">{notice}</p> : null}

        <section aria-label="Shop items" className="shop-tablet">
          <div className="shop-toolbar">
            <div className="shop-toolbar__group">
              <label className="admin-field" htmlFor={searchId}>
                <span className="sr-only">Search items</span>
                <input id={searchId} type="search" className="admin-field__control" placeholder="Search items" value={search} onChange={(event) => setSearch(event.target.value)} />
              </label>
              <label className="admin-field" htmlFor={filterId}>
                <span className="sr-only">Filter by status</span>
                <select id={filterId} className="admin-field__control" value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
                  {FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div>
            <p className="text-sm text-muted">{rows.length} of {data.items.length} items</p>
          </div>
          {data.items.length === 0 ? (
            <div className="p-4"><EmptyState title="No shop items yet" description="Add the first item to open the shop." /></div>
          ) : (
            <div className="shop-table-scroll">
              <table className="admin-table shop-table">
                <thead>
                  <tr><th scope="col">Item</th><th scope="col">Price</th><th scope="col">Available</th><th scope="col">Stock</th><th scope="col">Status</th><th scope="col">Featured</th><th scope="col">Inventory</th><th scope="col"><span className="sr-only">Edit</span></th></tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={8} className="py-8 text-center text-muted">No items match.</td></tr>
                  ) : rows.map((item) => {
                    const busy = busyItem === item.itemId;
                    return (
                      <tr key={item.itemId}>
                        <th scope="row" className="font-normal">
                          <div className="shop-item-cell">
                            <ShopItemThumb imageUrl={item.imageUrl} />
                            <div className="min-w-0"><strong>{item.name}</strong>{item.description ? <span>{item.description}</span> : null}</div>
                          </div>
                        </th>
                        <td>
                          <ShopPrice pointsCost={item.pointsCost} effectivePointsCost={item.effectivePointsCost} />
                          {item.flashSaleId ? <div className="mt-1"><AdminStatusBadge className="admin-badge--sale">On sale</AdminStatusBadge></div> : null}
                        </td>
                        <td className="text-base font-bold tabular-nums text-night">{formatPoints(item.stockQuantity)}</td>
                        <td><AdminStatusBadge tone={STOCK_STATUS[item.stockStatus].tone}>{STOCK_STATUS[item.stockStatus].label}</AdminStatusBadge></td>
                        <td><AdminStatusBadge tone={ITEM_STATUS[item.status].tone}>{ITEM_STATUS[item.status].label}</AdminStatusBadge></td>
                        <td>
                          <button type="button" className="shop-star" aria-pressed={item.featured} aria-label={`Feature ${item.name}`} disabled={busy} onClick={() => toggleFeatured(item)}>
                            <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3 7h7l-5.5 4.5L18.5 21 12 16.5 5.5 21l2-7.5L2 9h7z" /></svg>
                          </button>
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <span className="shop-stepper">
                              <button type="button" aria-label={`Remove one ${item.name}`} disabled={busy || item.stockQuantity === 0} onClick={() => quickAdjust(item, -1)}>−</button>
                              <span className="shop-stepper__value" aria-label={`${item.name} stock`}>{item.stockQuantity}</span>
                              <button type="button" aria-label={`Add one ${item.name}`} disabled={busy} onClick={() => quickAdjust(item, 1)}>+</button>
                            </span>
                            <button type="button" className="shop-pill shop-pill--sm" aria-label={`Adjust stock for ${item.name}`} onClick={() => setEditing({ kind: "adjust", item })}>Adjust</button>
                          </div>
                        </td>
                        <td><button type="button" className="shop-pill shop-pill--sm shop-pill--ghost" aria-label={`Edit ${item.name}`} onClick={() => setEditing({ kind: "edit", item })}>Edit</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      <ShopVolunteersPanel onNotice={(message) => { setError(null); setNotice(message); }} />

      {editing?.kind === "add" ? <ShopItemForm item={null} onClose={() => setEditing(null)} onSaved={done} /> : null}
      {editing?.kind === "edit" ? <ShopItemForm item={editing.item} onClose={() => setEditing(null)} onSaved={done} /> : null}
      {editing?.kind === "adjust" ? <StockAdjustDialog item={editing.item} onClose={() => setEditing(null)} onSaved={done} /> : null}
    </div>
  );
}
