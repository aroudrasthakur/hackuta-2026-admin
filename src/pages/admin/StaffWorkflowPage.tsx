import { Link } from "react-router-dom";
import { EmptyState } from "../../components/states/EmptyState";
import { ADMIN_ROUTES } from "../../types/routes";

const workflows = {
  "check-in": { title: "Participant check-in", description: "The check-in scanner is being prepared. Follow your event lead’s instructions for participant arrivals." },
  food: { title: "Food", description: "The food scanner is being prepared. Follow your event lead’s instructions for meal distribution." },
  points: { title: "Points", description: "The points scanner is being prepared. Follow your event lead’s instructions for event attendance." },
  volunteers: { title: "Volunteers", description: "Volunteer management will be available when the account management workflow is ready." },
} as const;

/** Protected entry points for workflows delivered separately from issue #65. */
export function StaffWorkflowPage({ workflow }: { workflow: keyof typeof workflows }) {
  const { title, description } = workflows[workflow];
  const scanning = workflow === "check-in" || workflow === "food" || workflow === "points";
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl text-ink">{title}</h1>
      <EmptyState title="Coming soon" description={description} />
      {scanning ? <Link className="inline-block py-3 font-semibold" to={ADMIN_ROUTES.scan}>Back to volunteer dashboard</Link> : null}
    </div>
  );
}
