type LoadingStateProps = {
  message?: string;
  layout?: "compact" | "rows";
};

export function LoadingState({ message = "Loading…", layout = "compact" }: LoadingStateProps) {
  return (
    <div role="status" className={layout === "rows" ? "space-y-3" : "admin-state text-ocean"}>
      <p className="text-sm text-ocean">{message}</p>
      <div aria-hidden="true" className={layout === "rows" ? "admin-card overflow-hidden" : "mx-auto mt-4 max-w-48 space-y-3"}>
        {layout === "rows" ? Array.from({ length: 5 }, (_, index) => (
          <div className="admin-skeleton-row" key={index}>
            <span className="admin-skeleton" /><span className="admin-skeleton" /><span className="admin-skeleton" />
          </div>
        )) : <><div className="admin-skeleton" /><div className="admin-skeleton w-2/3" /></>}
      </div>
    </div>
  );
}
