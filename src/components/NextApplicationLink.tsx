import { Link } from "react-router-dom";
import { useQuery } from "../convex/reactBindings";
import { listSubmittedApplicationsRef } from "../convex/adminApi";
import { useNow } from "../hooks/useNow";
import { nextApplicationInQueue } from "../lib/applicationQueue";
import { reviewSecondaryButtonClass } from "../lib/reviewButtonClasses";
import { ADMIN_ROUTES } from "../types/routes";

export function NextApplicationLink({ applicationId, sessionToken, staffAdminId, applicationsSearch }: {
  applicationId: string; sessionToken: string; staffAdminId: string; applicationsSearch: string;
}) {
  const applications = useQuery(listSubmittedApplicationsRef, { sessionToken });
  const now = useNow();
  if (applications === undefined) return <p className="text-sm text-ocean">Finding the next application…</p>;
  const next = nextApplicationInQueue(applications, applicationId, new URLSearchParams(applicationsSearch), staffAdminId, now);
  return (
    <nav aria-label="Review navigation" className="admin-card admin-card__body space-y-3">
      <h3 className="admin-card__title">Continue reviewing</h3>
      {next ? <>
        <Link className={`${reviewSecondaryButtonClass} w-full`} to={ADMIN_ROUTES.applicationReview(next.applicationId)} state={{ applicationsSearch }}>Review next application</Link>
        <p className="break-words text-sm text-ocean">Next: {next.applicantName}</p>
      </> : <p className="text-sm text-ocean">No more available applications in this queue.</p>}
      <p className="text-xs text-ocean">Uses your queue filters and skips active reviews held by other organizers.</p>
    </nav>
  );
}
