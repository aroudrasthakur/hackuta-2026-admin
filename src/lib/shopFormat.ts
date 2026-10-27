import type { StatusTone } from "../components/AdminStatusBadge";
import type { FlashSaleRow, ShopItemAdminRow } from "../convex/adminApi";

const numberFormatter = new Intl.NumberFormat("en-US");
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatPoints(points: number) {
  return numberFormatter.format(points);
}

export function formatShopTime(timestamp: number) {
  return dateTimeFormatter.format(timestamp);
}

export const STOCK_STATUS: Record<ShopItemAdminRow["stockStatus"], { label: string; tone: StatusTone }> = {
  in_stock: { label: "In stock", tone: "positive" },
  low: { label: "Low", tone: "warning" },
  out: { label: "Out", tone: "negative" },
};

export const ITEM_STATUS: Record<ShopItemAdminRow["status"], { label: string; tone: StatusTone }> = {
  active: { label: "Active", tone: "positive" },
  inactive: { label: "Inactive", tone: "neutral" },
  archived: { label: "Archived", tone: "neutral" },
};

/** Sellable state for the admin table: active items with no stock read as sold out. */
export function itemListingStatus(item: Pick<ShopItemAdminRow, "status" | "stockStatus">) {
  if (item.status === "active" && item.stockStatus === "out") {
    return { label: "Sold out", tone: "negative" as const };
  }
  return ITEM_STATUS[item.status];
}

export const SALE_STATUS: Record<FlashSaleRow["status"], { label: string; tone: StatusTone }> = {
  live: { label: "Live", tone: "positive" },
  scheduled: { label: "Scheduled", tone: "info" },
  ended: { label: "Ended", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "negative" },
};

/** `datetime-local` value in the browser's time zone. */
export function toDateTimeInput(timestamp: number) {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Parses a `datetime-local` value as local time. Null when empty or invalid. */
export function fromDateTimeInput(value: string) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

/** Whole number in range, or null. */
export function parseWholeNumber(value: string, min: number, max = Number.MAX_SAFE_INTEGER) {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}
