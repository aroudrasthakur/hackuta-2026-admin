/** Item image, or a black-figure amphora when the item has none. */
function toSafeImageUrl(imageUrl: string | null): string | null {
  if (!imageUrl) return null;
  try {
    const parsed = new URL(imageUrl, window.location.origin);
    if (parsed.protocol === "blob:" || parsed.protocol === "https:" || parsed.protocol === "http:") {
      return imageUrl;
    }
  } catch {
    return null;
  }
  return null;
}

export function ShopItemThumb({ imageUrl, large = false }: { imageUrl: string | null; large?: boolean }) {
  const safeImageUrl = toSafeImageUrl(imageUrl);
  return (
    <span className={`shop-thumb${large ? " shop-thumb--lg" : ""}`}>
      {safeImageUrl ? (
        <img src={safeImageUrl} alt="" />
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
          <path d="M9 2h6v2l-1 1v2c3 1.5 5 4 5 7.5S16.5 20 14 21v1h-4v-1c-2.5-1-5-3-5-6.5S7 8.5 10 7V5L9 4z" />
        </svg>
      )}
    </span>
  );
}

export function ShopPrice({ pointsCost, effectivePointsCost }: { pointsCost: number; effectivePointsCost: number }) {
  const onSale = effectivePointsCost < pointsCost;
  return (
    <span className="shop-price">
      {effectivePointsCost.toLocaleString("en-US")}
      {onSale ? <s aria-label={`was ${pointsCost.toLocaleString("en-US")}`}>{pointsCost.toLocaleString("en-US")}</s> : null}
    </span>
  );
}
