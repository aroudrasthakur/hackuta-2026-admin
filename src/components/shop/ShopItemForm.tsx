import { useEffect, useId, useRef, useState } from "react";
import type { GenericId } from "convex/values";
import { useMutation } from "../../convex/reactBindings";
import {
  createShopItemRef,
  generateShopImageUploadUrlRef,
  setShopItemStatusRef,
  updateShopItemRef,
  type ShopItemAdminRow,
} from "../../convex/adminApi";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { parseWholeNumber } from "../../lib/shopFormat";
import { reportUserFacingError, UserFacingError } from "../../lib/userFacingError";
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  SHOP_DESCRIPTION_MAX_LENGTH,
  SHOP_IMAGE_MAX_BYTES,
  SHOP_IMAGE_TYPES,
  SHOP_NAME_MAX_LENGTH,
} from "../../../shared/admin/shopRules";
import { ShopDialog } from "./ShopDialog";
import { ShopItemThumb } from "./ShopItemThumb";

type Status = ShopItemAdminRow["status"];
type Errors = Partial<Record<"name" | "price" | "stock" | "low" | "image", string | undefined>>;

const STATUS_OPTIONS: Array<{ value: Status; label: string }> = [
  { value: "active", label: "Active: shown and sellable" },
  { value: "inactive", label: "Inactive: hidden, kept for later" },
  { value: "archived", label: "Archived: retired, history kept" },
];

/** Uploads to Convex storage and returns the new storage id. */
async function uploadImage(uploadUrl: string, file: File) {
  const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
  if (!response.ok) throw new UserFacingError("The image didn't upload. Check your connection and try again.");
  const { storageId } = await response.json() as { storageId: GenericId<"_storage"> };
  return storageId;
}

/** Add or edit drawer. Stock is set only on create; later changes go through Adjust so they are logged. */
export function ShopItemForm({ item, onClose, onSaved }: {
  item: ShopItemAdminRow | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { sessionToken } = useAdminAuth();
  const create = useMutation(createShopItemRef);
  const update = useMutation(updateShopItemRef);
  const setStatus = useMutation(setShopItemStatusRef);
  const generateUploadUrl = useMutation(generateShopImageUploadUrlRef);
  const id = useId();
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [price, setPrice] = useState(item ? String(item.pointsCost) : "");
  const [stock, setStock] = useState(item ? String(item.stockQuantity) : "0");
  const [low, setLow] = useState(String(item?.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD));
  const [featured, setFeatured] = useState(item?.featured ?? false);
  const [status, setStatusValue] = useState<Status>(item?.status ?? "active");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(item?.imageUrl ?? null);
  const [removeImage, setRemoveImage] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const objectUrl = useRef<string | null>(null);

  useEffect(() => () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
  }, []);

  function showPreview(url: string | null) {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = url;
    setPreview(url);
  }

  function pickImage(picked: File | undefined) {
    if (!picked) return;
    if (!(SHOP_IMAGE_TYPES as readonly string[]).includes(picked.type) || picked.size > SHOP_IMAGE_MAX_BYTES) {
      setErrors((current) => ({ ...current, image: "Choose a PNG, JPEG, WebP, or GIF image of 2 MB or less." }));
      return;
    }
    setErrors((current) => ({ ...current, image: undefined }));
    setRemoveImage(false);
    setFile(picked);
    showPreview(URL.createObjectURL(picked));
  }

  function clearImage() {
    setFile(null);
    showPreview(null);
    setRemoveImage(true);
  }

  async function save() {
    if (!sessionToken || saving) return;
    const pointsCost = parseWholeNumber(price, 1);
    const stockQuantity = parseWholeNumber(stock, 0);
    const lowStockThreshold = low.trim() === "" ? null : parseWholeNumber(low, 0);
    const next: Errors = {
      ...(name.trim() ? {} : { name: "Enter a name." }),
      ...(pointsCost === null ? { price: "Enter a whole number of 1 point or more." } : {}),
      ...(!item && stockQuantity === null ? { stock: "Enter a whole number of 0 or more." } : {}),
      ...(low.trim() !== "" && lowStockThreshold === null ? { low: "Enter a whole number of 0 or more, or leave it empty." } : {}),
      ...(errors.image ? { image: errors.image } : {}),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean) || pointsCost === null) return;

    setSaving(true);
    setFormError(null);
    try {
      const imageStorageId = file
        ? await uploadImage(await generateUploadUrl({ sessionToken }), file)
        : removeImage ? null : undefined;
      const fields = {
        sessionToken,
        name: name.trim(),
        description: description.trim(),
        pointsCost,
        featured,
        lowStockThreshold,
      };
      if (item) {
        await update({ ...fields, itemId: item.itemId, ...(imageStorageId !== undefined ? { imageStorageId } : {}) });
        if (status !== item.status) await setStatus({ sessionToken, itemId: item.itemId, status });
        onSaved(`${fields.name} saved.`);
      } else {
        const { itemId } = await create({
          ...fields,
          ...(imageStorageId ? { imageStorageId } : {}),
          stockQuantity: stockQuantity ?? 0,
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
      <div className="flex items-center gap-4">
        <ShopItemThumb imageUrl={preview} large />
        <div className="grid gap-2">
          <label className="admin-field" htmlFor={field("image")}>
            Image
            <input id={field("image")} type="file" accept={SHOP_IMAGE_TYPES.join(",")} className="admin-field__control" onChange={(event) => pickImage(event.target.files?.[0])} />
          </label>
          {preview ? <button type="button" className="shop-pill shop-pill--sm shop-pill--ghost justify-self-start" onClick={clearImage}>Remove image</button> : null}
        </div>
      </div>
      {errors.image ? <p className="shop-field-error">{errors.image}</p> : <p className="text-sm text-muted">PNG, JPEG, WebP, or GIF, up to 2 MB.</p>}

      <label className="admin-field" htmlFor={field("name")}>
        Name
        <input id={field("name")} className="admin-field__control" value={name} maxLength={SHOP_NAME_MAX_LENGTH} aria-invalid={errors.name ? true : undefined} onChange={(event) => setName(event.target.value)} />
      </label>
      {errors.name ? <p className="shop-field-error">{errors.name}</p> : null}
      <label className="admin-field" htmlFor={field("description")}>
        Description
        <textarea id={field("description")} className="admin-field__control min-h-20" value={description} maxLength={SHOP_DESCRIPTION_MAX_LENGTH} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="admin-field" htmlFor={field("price")}>
          Price (points)
          <input id={field("price")} className="admin-field__control" inputMode="numeric" value={price} aria-invalid={errors.price ? true : undefined} onChange={(event) => setPrice(event.target.value)} />
        </label>
        <label className="admin-field" htmlFor={field("stock")}>
          {item ? "Current stock" : "Starting stock"}
          <input id={field("stock")} className="admin-field__control" inputMode="numeric" value={stock} disabled={!!item} aria-invalid={errors.stock ? true : undefined} onChange={(event) => setStock(event.target.value)} />
        </label>
      </div>
      {errors.price ? <p className="shop-field-error">{errors.price}</p> : null}
      {errors.stock ? <p className="shop-field-error">{errors.stock}</p> : null}
      {item ? <p className="text-sm text-muted">Change stock with Adjust so every change is logged.</p> : null}
      <label className="admin-field" htmlFor={field("low")}>
        Low-stock warning at
        <input id={field("low")} className="admin-field__control" inputMode="numeric" value={low} aria-invalid={errors.low ? true : undefined} onChange={(event) => setLow(event.target.value)} />
      </label>
      {errors.low ? <p className="shop-field-error">{errors.low}</p> : null}
      <label className="shop-check" htmlFor={field("featured")}>
        <input id={field("featured")} type="checkbox" checked={featured} onChange={(event) => setFeatured(event.target.checked)} />
        Feature this item at the top of the shop
      </label>
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
