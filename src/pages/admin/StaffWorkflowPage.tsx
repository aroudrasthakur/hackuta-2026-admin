import { EmptyState } from "../../components/states/EmptyState";

const workflows = {
  participants: { title: "Participants", description: "Participant management will be available when the participant administration workflow is ready." },
  volunteers: { title: "Volunteers", description: "Volunteer management will be available when the account management workflow is ready." },
} as const;

/** Protected entry points for admin workflows delivered separately from issue #65. */
export function StaffWorkflowPage({ workflow }: { workflow: keyof typeof workflows }) {
  const { title, description } = workflows[workflow];
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl text-ink">{title}</h1>
      <EmptyState title="Coming soon" description={description} />
    </div>
  );
}
