import { EmptyState } from "../../components/states/EmptyState";
import { AdminPageHeader } from "../../components/AdminPageHeader";

const workflows = {
  participants: { title: "Participants", description: "Participant management will be available when the participant administration workflow is ready." },
  volunteers: { title: "Volunteers", description: "Volunteer management will be available when the account management workflow is ready." },
} as const;

/** Protected entry points for admin workflows delivered separately from issue #65. */
export function StaffWorkflowPage({ workflow }: { workflow: keyof typeof workflows }) {
  const { title, description } = workflows[workflow];
  return (
    <div className="space-y-6">
      <AdminPageHeader id={`${workflow}-heading`} title={title} />
      <EmptyState title="Coming soon" description={description} />
    </div>
  );
}
