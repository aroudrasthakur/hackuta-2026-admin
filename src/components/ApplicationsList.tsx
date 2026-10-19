import { Link } from "react-router-dom";
import type { SubmittedApplicationSummary } from "../convex/adminApi";
import { formatApplicationDate } from "../lib/applicationDisplay";
import { reviewSecondaryButtonClass } from "../lib/reviewButtonClasses";
import { ADMIN_ROUTES } from "../types/routes";
import { ApplicationDecisionBadge } from "./ApplicationDecisionBadge";
import { ApplicationStatusBadge } from "./ApplicationStatusBadge";
import { queueReviewStatus } from "../../shared/admin/reviewQueue";

export function ApplicationsList({
  applications,
  applicationsSearch,
  now,
  staffAdminId,
}: {
  applications: SubmittedApplicationSummary[];
  applicationsSearch: string;
  now: number;
  staffAdminId?: string | undefined;
}) {
  function status(application: SubmittedApplicationSummary) {
    return queueReviewStatus(application, now);
  }

  function reviewer(application: SubmittedApplicationSummary) {
    const current = status(application);
    if (current === "unreviewed") return "Unassigned";
    if (current === "stale") return `Previous: ${application.currentReviewerName ?? "Unknown organizer"}`;
    if (current === "under_review" && application.reviewClaim?.reviewedBy === staffAdminId) return "You";
    return application.currentReviewerName ?? "Unassigned";
  }
  function reviewLink(application: SubmittedApplicationSummary) {
    return (
      <Link
        className={`${reviewSecondaryButtonClass} applications-table__action whitespace-nowrap px-2.5 py-1.5 text-xs sm:text-sm`}
        to={ADMIN_ROUTES.applicationReview(application.applicationId)}
        state={{ applicationsSearch }}
        aria-label={`Review application for ${application.applicantName}`}
      >
        Review <span aria-hidden="true" className="ml-2">&rarr;</span>
      </Link>
    );
  }

  return (
    <>
      <div className="admin-card admin-card--flush applications-table-panel hidden lg:block">
        <table className="applications-table w-full text-left text-sm">
          <caption className="sr-only">Submitted applications matching the current search and review status filter</caption>
          <colgroup>
            <col className="applications-table__col-applicant" />
            <col className="applications-table__col-school" />
            <col className="applications-table__col-submitted" />
            <col className="applications-table__col-status" />
            <col className="applications-table__col-reviewer" />
            <col className="applications-table__col-action" />
          </colgroup>
          <thead className="border-b border-sand bg-clay/50 text-xs uppercase tracking-wide text-ink">
            <tr>
              <th scope="col" className="px-3 py-3 font-semibold sm:px-4">Applicant</th>
              <th scope="col" className="px-3 py-3 font-semibold">School</th>
              <th scope="col" className="px-3 py-3 font-semibold">Submitted</th>
              <th scope="col" className="px-3 py-3 font-semibold">Status</th>
              <th scope="col" className="px-3 py-3 font-semibold">Reviewer</th>
              <th scope="col" className="px-3 py-3"><span className="sr-only">Review application</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sand/70">
            {applications.map((application) => (
              <tr key={application.applicationId} className="hover:bg-clay/25 focus-within:bg-clay/25">
                <th scope="row" className="min-w-0 px-3 py-3 font-normal sm:px-4">
                  <span className="block truncate font-semibold text-night">{application.applicantName}</span>
                  <span className="mt-1 block truncate text-xs text-ocean">{application.email}</span>
                </th>
                <td className="min-w-0 px-3 py-3"><span className="line-clamp-2 break-words">{application.school || "Not provided"}</span></td>
                <td className="whitespace-nowrap px-3 py-3 text-xs leading-5">{formatApplicationDate(application.submittedAt)}</td>
                <td className="px-3 py-3"><ApplicationStatusBadge status={status(application)} /></td>
                <td className="min-w-0 break-words px-3 py-3 text-xs sm:text-sm">{reviewer(application)}</td>
                <td className="px-3 py-3">{reviewLink(application)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:hidden" aria-label="Applications">
        {applications.map((application) => (
          <li key={application.applicationId}>
            <article className="admin-card admin-card__body h-full text-sm">
              <header className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="min-w-0 break-words font-semibold text-night">{application.applicantName}</h3>
                <ApplicationStatusBadge status={status(application)} />
              </header>
              <p className="mt-1 break-words text-ocean">{application.email}</p>
              <p className="mt-1 break-words">{application.school || "Not provided"}</p>
              <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2">
                <dt className="text-ocean">Submitted</dt>
                <dd>{formatApplicationDate(application.submittedAt)}</dd>
                <dt className="text-ocean">Reviewer</dt>
                <dd className="break-words">{reviewer(application)}</dd>
              </dl>
              <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2 border-t border-sand/70 pt-3">
                {reviewLink(application)}
                <ApplicationDecisionBadge status={application.reviewStatus} />
              </div>
            </article>
          </li>
        ))}
      </ul>
    </>
  );
}
