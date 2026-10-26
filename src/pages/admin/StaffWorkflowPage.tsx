import { Link } from "react-router-dom";
import { EmptyState } from "../../components/states/EmptyState";
import { ADMIN_ROUTES } from "../../types/routes";
import { AdminPageHeader } from "../../components/AdminPageHeader";
import { reviewGhostButtonClass } from "../../lib/reviewButtonClasses";

const workflows = {
  "check-in": { title: "Participant check-in", description: "The check-in scanner is being prepared. Follow your event lead’s instructions for participant arrivals." },
  food: { title: "Food", description: "The food scanner is being prepared. Follow your event lead’s instructions for meal distribution." },
  points: { title: "Points", description: "The points scanner is being prepared. Follow your event lead’s instructions for event attendance." },
  participants: { title: "Participants", description: "Participant management will be available when the participant administration workflow is ready." },
  volunteers: { title: "Volunteers", description: "Volunteer management will be available when the account management workflow is ready." },
} as const;

/** Protected entry points for workflows delivered separately from issue #65. */
export function StaffWorkflowPage({ workflow }: { workflow: keyof typeof workflows }) {
  const { title, description } = workflows[workflow];
  const scanning = workflow === "check-in" || workflow === "food" || workflow === "points";
  return (
    <div className="space-y-6">
      <AdminPageHeader id={`${workflow}-heading`} title={title} />
      <EmptyState title="Coming soon" description={description} />
      {scanning ? <Link className={reviewGhostButtonClass} to={ADMIN_ROUTES.scan}>Back to volunteer dashboard</Link> : null}
    </div>
  );
}
