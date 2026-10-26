import { useId, useState } from "react";
import { useMutation } from "../../convex/reactBindings";
import { adjustShopStockRef, type ShopItemAdminRow } from "../../convex/adminApi";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { formatPoints, parseWholeNumber } from "../../lib/shopFormat";
import { reportUserFacingError } from "../../lib/userFacingError";
import { SHOP_REASON_MAX_LENGTH } from "../../../shared/admin/shopRules";
import { ShopDialog } from "./ShopDialog";

type Mode = "restock" | "remove" | "set";

const MODES: Array<{ mode: Mode; label: string; amountLabel: string }> = [
  { mode: "restock", label: "Restock", amountLabel: "Units to add" },
  { mode: "remove", label: "Remove", amountLabel: "Units to remove" },
  { mode: "set", label: "Set count", amountLabel: "New stock count" },
];

/** Logged stock change with a required reason. Stock can't go below zero. */
export function StockAdjustDialog({ item, onClose, onSaved }: {
  item: ShopItemAdminRow;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { sessionToken } = useAdminAuth();
  const adjust = useMutation(adjustShopStockRef);
  const id = useId();
  const [mode, setMode] = useState<Mode>("restock");
  const [amount, setAmount] = useState("10");
  const [reason, setReason] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const units = parseWholeNumber(amount, 0);
  const after = units === null ? null : mode === "restock" ? item.stockQuantity + units : mode === "remove" ? item.stockQuantity - units : units;
  const invalidAmount = after === null || after < 0 || after === item.stockQuantity;
  const config = MODES.find((entry) => entry.mode === mode)!;

  async function save() {
    setShowErrors(true);
    if (!sessionToken || saving || after === null || invalidAmount || !reason.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await adjust({
        sessionToken,
        itemId: item.itemId,
        kind: mode === "restock" ? "restock" : "manual",
        ...(mode === "set" ? { newQuantity: after } : { delta: after - item.stockQuantity }),
        reason: reason.trim(),
      });
      onSaved(`${item.name}: stock ${formatPoints(item.stockQuantity)} → ${formatPoints(after)}. Saved to the inventory log.`);
    } catch (caught) {
      setError(reportUserFacingError("Unable to adjust stock", caught, "We couldn't change the stock. Please try again.", { source: "StockAdjustDialog.save" }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ShopDialog
      title="Adjust stock"
      description={item.name}
      onClose={onClose}
      onSubmit={() => void save()}
      footer={<>
        <button type="button" className="shop-pill" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="submit" className="shop-pill shop-pill--ink" disabled={saving} aria-busy={saving || undefined}>{saving ? "Saving…" : "Save adjustment"}</button>
      </>}
    >
      <div className="shop-seg" role="group" aria-label="Adjustment type">
        {MODES.map((entry) => (
          <button key={entry.mode} type="button" aria-pressed={mode === entry.mode} onClick={() => setMode(entry.mode)}>{entry.label}</button>
        ))}
      </div>
      <label className="admin-field" htmlFor={`${id}-amount`}>
        {config.amountLabel}
        <input id={`${id}-amount`} className="admin-field__control" inputMode="numeric" value={amount} aria-invalid={showErrors && invalidAmount ? true : undefined} onChange={(event) => setAmount(event.target.value)} />
      </label>
      <div className="shop-before-after" aria-live="polite">
        <div><span>Now</span><strong>{formatPoints(item.stockQuantity)}</strong></div>
        <span aria-hidden="true">→</span>
        <div><span>After</span><strong>{after === null ? "–" : formatPoints(Math.max(after, 0))}</strong></div>
      </div>
      {after !== null && after < 0 ? <p className="shop-field-error">Stock can't go below 0.</p> : null}
      {showErrors && (after === null || after === item.stockQuantity) ? <p className="shop-field-error">Enter a number that changes the stock.</p> : null}
      <label className="admin-field" htmlFor={`${id}-reason`}>
        Reason
        <textarea id={`${id}-reason`} className="admin-field__control min-h-20" value={reason} maxLength={SHOP_REASON_MAX_LENGTH} placeholder="For example: second box delivered to the shop table" aria-invalid={showErrors && !reason.trim() ? true : undefined} onChange={(event) => setReason(event.target.value)} />
      </label>
      {showErrors && !reason.trim() ? <p className="shop-field-error">Add a reason for this change.</p> : <p className="text-sm text-muted">Required. Saved in the inventory log with your name.</p>}
      {error ? <p role="alert" className="admin-callout admin-callout--alert">{error}</p> : null}
    </ShopDialog>
  );
}
