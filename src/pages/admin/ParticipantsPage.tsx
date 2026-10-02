import { EmptyState } from "../../components/states/EmptyState";

export function ParticipantsPage() {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl text-night">Participants</h2>
      <EmptyState
        title="Participant roster"
        description="Search and export tools will be added later."
      />
    </section>
  );
}
