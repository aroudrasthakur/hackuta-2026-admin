# Admin pages

| File | Route |
| --- | --- |
| [`AdminLoginPage.tsx`](AdminLoginPage.tsx) | `/admin/login` — email + password with the same show/hide control as register sign-in |
| [`ApplicationsPage.tsx`](ApplicationsPage.tsx) | `/admin/applications` |
| [`ApplicationReviewPage.tsx`](ApplicationReviewPage.tsx) | `/admin/applications/:applicationId` |
| [`DecisionEmailQueuePage.tsx`](DecisionEmailQueuePage.tsx) | `/admin/decision-emails` |
| [`VolunteerDashboardPage.tsx`](VolunteerDashboardPage.tsx) | `/admin/scan` |
| [`StaffWorkflowPage.tsx`](StaffWorkflowPage.tsx) | `/admin/scan/check-in`, `/admin/scan/food`, `/admin/scan/points`, `/admin/participants`, `/admin/volunteers` |

Admins and reviewers land on applications; volunteers land on the scanner dashboard. `/volunteer` redirects to `/admin/scan`. Login restores a known internal destination only if the current account can access it. Unknown routes resolve to the account's home.

The scan dashboard and navigation share a reactive `listMyScanOptions` subscription. Check-in and food require explicit grants; points require an assigned active event. Selected event URLs are checked against current assignments. Removing access hides actions immediately and redirects stale routes with a notice. Event times are advisory, matching the backend scan contract.

The scanner and management routes currently show protected entry pages. Camera scanning, participant mutations, and management forms belong to their separate workflow issues; these entry pages do not perform those operations. Participant and volunteer management routes require the administrator role. Backend authorization remains mandatory for every operation.

Review page: applicant identity and responses first, background/education/resume, review controls beside the evidence on desktop, and expandable secondary applicant information. Confirmation identifies the applicant and manages keyboard focus; completion remains visible after the live query updates. Admin-only history remains below the review.

Applications queue: defaults to all applications, oldest first. Status labels distinguish awaiting review, active review, and expired claims available to reclaim. Claim availability updates every 15 seconds without a database write or reload. Registration-owned statuses are preserved.

Search (`search`), status (`status`), sort (`sort`), and assignment (`reviewer=all|mine|available`) are stored in URL parameters and preserved through detail navigation. “My active reviews” excludes expired claims; “Available to review” includes unclaimed applications, expired claims, and the organizer's own active reviews.

“Review next application” respects the queue controls and order, wraps when needed, and skips completed applications and active claims held by others. Opening the next application focuses its heading. The next-link query has its own error boundary so it cannot block a decision.

Use the Waitlisted filter to find applicants who can be accepted when a spot opens. Decision confirmation schedules the existing decision email; the completion message confirms scheduling without claiming delivery.

The dashboard shares page headers, buttons, badges, table spacing, notices and
contextual loading skeletons. Application and decision-email query failures have
local retry boundaries. Decision-email delivery badges remain separate from
application decisions; only admins see release, hold and retry controls. The
recently-sent list remains limited to five entries.

Participant/volunteer management tables and forms, event management tables, and
a general audit-log table are not implemented by the dashboard redesign. Current
entry pages, assigned-event cards, and the review-history timeline use the shared
visual patterns without adding those separate workflows.
