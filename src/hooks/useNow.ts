import { useEffect, useState } from "react";

/** Keep claim availability current even when no database documents change. */
export function useNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(interval);
  }, []);
  return now;
}
