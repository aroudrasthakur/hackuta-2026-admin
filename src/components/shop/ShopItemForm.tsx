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
type Errors = Partial<Record<"name" | "price", string | undefined>>;

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
  const [status, setStatusValue] = useState<Status>(item?.status ?? "active");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!sessionToken || saving) return;
    const pointsCost = parseWholeNumber(price, 1);
    const next: Errors = {
      ...(name.trim() ? {} : { name: "Enter a name." }),
      ...(pointsCost === null ? { price: "Enter a whole number of 1 point or more." } : {}),
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
