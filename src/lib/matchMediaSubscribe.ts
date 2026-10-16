type LegacyMediaQueryList = MediaQueryList & {
  addListener?: (listener: (this: MediaQueryList, event: MediaQueryListEvent) => void) => void;
  removeListener?: (listener: (this: MediaQueryList, event: MediaQueryListEvent) => void) => void;
};

/** Subscribes to a media query with addEventListener or legacy addListener (Safari < 14). */
export function subscribeMediaQuery(query: string, onMatchesChange: (matches: boolean) => void) {
  const media = window.matchMedia(query) as LegacyMediaQueryList;
  const sync = () => onMatchesChange(media.matches);
  sync();

  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }

  media.addListener?.(sync);
  return () => media.removeListener?.(sync);
}
