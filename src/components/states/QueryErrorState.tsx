import { reviewSecondaryButtonClass } from "../../lib/reviewButtonClasses";

export function QueryErrorState({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <div role="alert" className="admin-callout admin-callout--alert admin-notice">
      <h2 className="font-semibold">{title}</h2>
      <p>Check your connection and try again.</p>
      <button type="button" className={reviewSecondaryButtonClass} onClick={onRetry}>Try again</button>
    </div>
  );
}
