import { useLayoutEffect, useRef } from "react";
import { formatPoints } from "../../lib/shopFormat";

const IMAGE_PROTOCOLS = new Set(["https:", "http:", "blob:"]);

function safeImageSrc(imageUrl: string) {
  try {
    const parsed = new URL(imageUrl);
    return IMAGE_PROTOCOLS.has(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}

/** Assigns `src` on the node so a blob preview is never interpolated into HTML. */
function ShopImage({ src }: { src: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const safeSrc = safeImageSrc(src);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (safeSrc) node.src = safeSrc;
    else node.removeAttribute("src");
  }, [safeSrc]);
  return <img ref={ref} alt="" />;
}

/** Item image, or a black-figure amphora when the item has none. */
export function ShopItemThumb({ imageUrl, large = false }: { imageUrl: string | null; large?: boolean }) {
  return (
    <span className={`shop-thumb${large ? " shop-thumb--lg" : ""}`}>
      {imageUrl ? (
        <ShopImage src={imageUrl} />
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
  const current = formatPoints(effectivePointsCost);
  const previous = formatPoints(pointsCost);
  return (
    <span className="shop-price">
      <span>{current}</span>
      {onSale ? <span className="shop-price__was" aria-label={`was ${previous}`}>{previous}</span> : null}
    </span>
  );
}
