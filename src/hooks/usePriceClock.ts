import { useCallback, useEffect, useRef, useState } from "react";
import { useNow } from "./useNow";

export const PRICE_BUCKET_MS = 30_000;
/** Lands just after the server's boundary so the re-run sees the new price. */
const PRICE_CHANGE_SLACK_MS = 500;
const MAX_TIMER_MS = 2 ** 31 - 1;

/**
 * `nowBucket` for shop queries. It moves every 30 seconds and at the next
 * sale start or end passed to `watch`, so prices change on time even when no
 * document does. The server clock still decides every price.
 */
export function usePriceClock() {
  const now = useNow();
  const [reached, setReached] = useState(0);
  const timer = useRef<number | undefined>(undefined);

  const watch = useCallback((nextPriceChangeAt: number | null | undefined) => {
    window.clearTimeout(timer.current);
    if (nextPriceChangeAt == null) return;
    const wait = Math.max(0, nextPriceChangeAt - Date.now()) + PRICE_CHANGE_SLACK_MS;
    if (wait > MAX_TIMER_MS) return;
    timer.current = window.setTimeout(() => setReached(nextPriceChangeAt), wait);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { nowBucket: Math.max(Math.floor(now / PRICE_BUCKET_MS) * PRICE_BUCKET_MS, reached), watch };
}

/** Re-runs the caller's queries at the next price change a query reported. */
export function useWatchPriceChange(watch: (next: number | null | undefined) => void, nextPriceChangeAt: number | null | undefined) {
  useEffect(() => watch(nextPriceChangeAt), [watch, nextPriceChangeAt]);
}
