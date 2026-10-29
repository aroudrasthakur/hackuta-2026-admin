import { reviewSecondaryButtonClass } from "../lib/reviewButtonClasses";

export function ApplicationsQueuePagination({
  page,
  totalPages,
  onPageChange,
  ariaLabel = "Applications pages",
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  ariaLabel?: string;
}) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label={ariaLabel}
      className="flex flex-wrap items-center justify-center gap-2 sm:justify-end"
    >
      <button
        type="button"
        className={reviewSecondaryButtonClass}
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        Previous
      </button>
      <p className="px-1 text-sm tabular-nums text-ocean" aria-live="polite">
        Page {page} of {totalPages}
      </p>
      <button
        type="button"
        className={reviewSecondaryButtonClass}
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
