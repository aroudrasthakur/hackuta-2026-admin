/** Decorative amphora placeholder for shop items. */
export function ShopItemThumb({ large = false }: { large?: boolean }) {
  return (
    <span className={`shop-thumb${large ? " shop-thumb--lg" : ""}`}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
        <path d="M9 2h6v2l-1 1v2c3 1.5 5 4 5 7.5S16.5 20 14 21v1h-4v-1c-2.5-1-5-3-5-6.5S7 8.5 10 7V5L9 4z" />
      </svg>
    </span>
  );
}
