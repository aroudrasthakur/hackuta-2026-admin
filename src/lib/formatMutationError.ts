/** User-facing message from a failed Convex mutation without leaking non-Error throws. */
export function formatMutationError(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}
