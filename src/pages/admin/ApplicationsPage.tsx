import { EmptyState } from "../../components/states/EmptyState";

export function ApplicationsPage() {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl text-night">Applications</h2>
      <EmptyState
        title="Application queue"
        description="Review and filtering UI will connect to Convex in a follow-up."
      />
    </section>
  );
}
