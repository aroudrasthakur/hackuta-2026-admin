import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AdminPageHeader } from "../../components/AdminPageHeader";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { FlashSalesTab } from "../../components/shop/FlashSalesTab";
import { ShopHistoryTab } from "../../components/shop/ShopHistoryTab";
import { ShopItemsTab } from "../../components/shop/ShopItemsTab";
import { QueryErrorState } from "../../components/states/QueryErrorState";
import { useAdminAuth } from "../../hooks/useAdminAuth";

export type ShopTab = "items" | "sales" | "history";

const TABS: Array<{ tab: ShopTab; numeral: string; label: string; error: string }> = [
  { tab: "items", numeral: "I", label: "Items", error: "Unable to load shop items" },
  { tab: "sales", numeral: "II", label: "Flash sales", error: "Unable to load flash sales" },
  { tab: "history", numeral: "III", label: "History", error: "Unable to load purchase history" },
];

/** Admin shop: items and stock, flash sales, and purchase history. `?tab=` picks the section. */
export function ShopPage() {
  const { sessionToken } = useAdminAuth();
  const [searchParams] = useSearchParams();
  const [retry, setRetry] = useState(0);
  const current = TABS.find(({ tab }) => tab === searchParams.get("tab")) ?? TABS[0]!;

  return (
    <section aria-labelledby="shop-heading" className="space-y-6">
      <AdminPageHeader
        id="shop-heading"
        title="Shop"
        description="Manage items, point prices, stock, and flash sales. Changes show up in the participant shop and the volunteer scanner right away."
      />
      <nav aria-label="Shop sections" className="shop-tabs">
        {TABS.map(({ tab, numeral, label }) => (
          <Link key={tab} to={{ search: tab === "items" ? "" : `?tab=${tab}` }} className="shop-tab" aria-current={tab === current.tab ? "page" : undefined}>
            <span aria-hidden="true" className="shop-tab__numeral">{numeral}</span>
            <span className="shop-tab__label">{label}</span>
          </Link>
        ))}
      </nav>
      <ErrorBoundary key={`${sessionToken}:${current.tab}:${retry}`} fallback={<QueryErrorState title={current.error} onRetry={() => setRetry((value) => value + 1)} />}>
        {current.tab === "items" ? <ShopItemsTab /> : current.tab === "sales" ? <FlashSalesTab /> : <ShopHistoryTab />}
      </ErrorBoundary>
    </section>
  );
}
