import { EmptyState } from "../../components/states/EmptyState";

export function CheckInPage() {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl text-night">Check-in</h2>
      <EmptyState
        title="Event check-in"
        description="QR and manual check-in flows will live here."
      />
    </section>
  );
}
