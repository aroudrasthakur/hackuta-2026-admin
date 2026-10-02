import { useConvexConfigured } from "../../hooks/useConvexConfigured";
import { normalizeConvexUrl } from "../../lib/convexClient";

export function AdminDashboardPage() {
  const configured = useConvexConfigured();
  const url = normalizeConvexUrl(import.meta.env.VITE_CONVEX_URL);

  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl text-night">Dashboard</h2>
      <div className="rounded-lg border border-sand bg-white/60 p-4 text-sm">
        <p>
          <span className="font-medium text-ink">Convex URL:</span>{" "}
          {configured && url ? (
            <code className="break-all text-ocean">{url}</code>
          ) : (
            <span className="text-mist">Not configured (set VITE_CONVEX_URL)</span>
          )}
        </p>
        <p className="mt-2 text-mist">
          Status:{" "}
          <span className={configured ? "text-ocean" : "text-ink"}>
            {configured ? "Client ready" : "Missing client"}
          </span>
        </p>
      </div>
    </section>
  );
}
