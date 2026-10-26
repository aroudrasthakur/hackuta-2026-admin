import type { RefObject } from "react";
import type { ApplicationDetail as ApplicationDetailData } from "../convex/adminApi";
import { formatApplicationDate } from "../lib/applicationDisplay";
import { ApplicationStatusBadge } from "./ApplicationStatusBadge";

export function ApplicationReviewIdentity({
  detail,
  displayedStatus,
  name,
  headingRef,
}: {
  detail: ApplicationDetailData;
  displayedStatus: Parameters<typeof ApplicationStatusBadge>[0]["status"];
  name: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const { application } = detail;
  const school = application.school?.trim() || null;

  return (
    <header className="admin-card admin-card__body application-review-identity">
      <div className="application-review-identity__main min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="application-review-identity__name font-display font-normal text-night"
          >
            {name || "Application review"}
          </h1>
          <ApplicationStatusBadge status={displayedStatus} className="application-review-identity__badge shrink-0" />
        </div>
        <p className="mt-1.5 break-words text-sm text-ocean">{application.email}</p>
      </div>
      <dl className="application-review-identity__facts">
        <div>
          <dt>Submitted</dt>
          <dd>{formatApplicationDate(application.submittedAt)}</dd>
        </div>
        {school ? (
          <div>
            <dt>School</dt>
            <dd className="break-words">{school}</dd>
          </div>
        ) : null}
      </dl>
    </header>
  );
}
