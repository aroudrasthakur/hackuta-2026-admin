import { formatPoints } from "../../lib/shopFormat";

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
