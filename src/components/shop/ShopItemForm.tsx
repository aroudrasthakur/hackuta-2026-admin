import { useId, useState } from "react";
import { useMutation } from "../../convex/reactBindings";
import {
  createShopItemRef,
  setShopItemStatusRef,
  updateShopItemRef,
  type ShopItemAdminRow,
} from "../../convex/adminApi";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { parseWholeNumber } from "../../lib/shopFormat";
import { reportUserFacingError } from "../../lib/userFacingError";
import {
  SHOP_DESCRIPTION_MAX_LENGTH,
  SHOP_NAME_MAX_LENGTH,
} from "../../../shared/admin/shopRules";
import { ShopDialog } from "./ShopDialog";

type Status = ShopItemAdminRow["status"];
type Errors = Partial<Record<"name" | "price" | "cooldown", string | undefined>>;

const STATUS_OPTIONS: Array<{ value: Status; label: string }> = [
  { value: "active", label: "Active: Shown and sellable" },
  { value: "inactive", label: "Inactive: Hidden, kept for later" },
  { value: "archived", label: "Archived: Retired, history kept" },
];

/** Add or edit drawer for catalog details. */
export function ShopItemForm({ item, onClose, onSaved }: {
  item: ShopItemAdminRow | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { sessionToken } = useAdminAuth();
  const create = useMutation(createShopItemRef);
  const update = useMutation(updateShopItemRef);
  const setStatus = useMutation(setShopItemStatusRef);
  const id = useId();
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [price, setPrice] = useState(item ? String(item.pointsCost) : "");
  const [cooldownEnabled, setCooldownEnabled] = useState(item?.purchaseCooldownMinutes !== undefined);
  const [cooldownMinutes, setCooldownMinutes] = useState(String(item?.purchaseCooldownMinutes ?? 60));
  const [status, setStatusValue] = useState<Status>(item?.status ?? "active");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!sessionToken || saving) return;
    const pointsCost = parseWholeNumber(price, 1);
    const purchaseCooldownMinutes = cooldownEnabled ? Number(cooldownMinutes) : undefined;
    const invalidCooldown = purchaseCooldownMinutes !== undefined
      && (!Number.isFinite(purchaseCooldownMinutes) || purchaseCooldownMinutes <= 0 || !Number.isFinite(purchaseCooldownMinutes * 60_000));
    const next: Errors = {
      ...(name.trim() ? {} : { name: "Enter a name." }),
      ...(pointsCost === null ? { price: "Enter a whole number of 1 point or more." } : {}),
      ...(invalidCooldown ? { cooldown: "Enter a positive number of minutes." } : {}),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean) || pointsCost === null) return;

    setSaving(true);
    setFormError(null);
    try {
      const fields = {
        sessionToken,
        name: name.trim(),
        description: description.trim(),
        pointsCost,
        ...(purchaseCooldownMinutes === undefined ? {} : { purchaseCooldownMinutes }),
      };
      if (item) {
        await update({ ...fields, itemId: item.itemId });
        if (status !== item.status) await setStatus({ sessionToken, itemId: item.itemId, status });
        onSaved(`${fields.name} saved.`);
      } else {
        const { itemId } = await create({
          ...fields,
          active: status === "active",
        });
        if (status === "archived") await setStatus({ sessionToken, itemId, status });
        onSaved(`${fields.name} added.`);
      }
    } catch (caught) {
      setFormError(reportUserFacingError("Unable to save shop item", caught, "We couldn't save this item. Please try again.", { source: "ShopItemForm.save" }));
    } finally {
      setSaving(false);
    }
  }

  const field = (key: string) => `${id}-${key}`;
  return (
    <ShopDialog
      drawer
      title={item ? `Edit ${item.name}` : "Add item"}
      description={item ? "Price changes apply to new purchases only. Past purchases keep the price they were charged." : "Active items appear in the shop as soon as you save."}
      onClose={onClose}
      onSubmit={() => void save()}
      footer={<>
        <button type="button" className="shop-pill" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="submit" className="shop-pill shop-pill--ink" disabled={saving} aria-busy={saving || undefined}>{saving ? "Saving…" : "Save item"}</button>
      </>}
    >
      <label className="admin-field" htmlFor={field("name")}>
        Name
        <input id={field("name")} className="admin-field__control" value={name} maxLength={SHOP_NAME_MAX_LENGTH} aria-invalid={errors.name ? true : undefined} onChange={(event) => setName(event.target.value)} />
      </label>
      {errors.name ? <p className="shop-field-error">{errors.name}</p> : null}
      <label className="admin-field" htmlFor={field("description")}>
        Description
        <textarea id={field("description")} className="admin-field__control min-h-20" value={description} maxLength={SHOP_DESCRIPTION_MAX_LENGTH} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <label className="admin-field" htmlFor={field("price")}>
        Price (points)
        <input id={field("price")} className="admin-field__control" inputMode="numeric" value={price} aria-invalid={errors.price ? true : undefined} onChange={(event) => setPrice(event.target.value)} />
      </label>
      {errors.price ? <p className="shop-field-error">{errors.price}</p> : null}
      <label className="admin-field" htmlFor={field("cooldown-enabled")}>
        <span><input id={field("cooldown-enabled")} type="checkbox" checked={cooldownEnabled} onChange={(event) => setCooldownEnabled(event.target.checked)} /> Enable purchase cooldown</span>
      </label>
      {cooldownEnabled ? <>
        <label className="admin-field" htmlFor={field("cooldown")}>
          Cooldown (minutes)
          <input id={field("cooldown")} className="admin-field__control" inputMode="decimal" value={cooldownMinutes} aria-invalid={errors.cooldown ? true : undefined} aria-describedby={errors.cooldown ? `${field("cooldown-help")} ${field("cooldown-error")}` : field("cooldown-help")} onChange={(event) => setCooldownMinutes(event.target.value)} />
        </label>
        <p id={field("cooldown-help")} className="text-sm text-muted">Time each participant must wait before buying this item again. Existing non-refunded purchases count.</p>
        {errors.cooldown ? <p id={field("cooldown-error")} role="alert" className="shop-field-error">{errors.cooldown}</p> : null}
      </> : null}
      <label className="admin-field" htmlFor={field("status")}>
        Status
        <select id={field("status")} className="admin-field__control" value={status} onChange={(event) => setStatusValue(event.target.value as Status)}>
          {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      {formError ? <p role="alert" className="admin-callout admin-callout--alert">{formError}</p> : null}
    </ShopDialog>
  );
}
