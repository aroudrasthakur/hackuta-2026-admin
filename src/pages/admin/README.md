# Admin pages

| File | Route |
| --- | --- |
| [`AdminLoginPage.tsx`](AdminLoginPage.tsx) | `/admin/login` — email + password with the same show/hide control as register sign-in |
| [`ApplicationsPage.tsx`](ApplicationsPage.tsx) | `/admin/applications` |
| [`ApplicationReviewPage.tsx`](ApplicationReviewPage.tsx) | `/admin/applications/:applicationId` |
| [`DecisionEmailQueuePage.tsx`](DecisionEmailQueuePage.tsx) | `/admin/decision-emails` |
| [`ParticipantsPage.tsx`](ParticipantsPage.tsx) | `/admin/participants` — paginated accepted-participant roster and administration |
| [`VolunteerDashboardPage.tsx`](VolunteerDashboardPage.tsx) | `/admin/scan` |
| [`StaffWorkflowPage.tsx`](StaffWorkflowPage.tsx) | `/admin/scan/check-in`, `/admin/scan/food`, `/admin/scan/points`, `/admin/volunteers` |

Admins and reviewers land on applications; volunteers land on the scanner dashboard. `/volunteer` redirects to `/admin/scan`. Login restores a known internal destination only if the current account can access it. Unknown routes resolve to the account's home.

The scan dashboard and navigation share a reactive `listMyScanOptions` subscription. Check-in and food require explicit grants; points require an assigned active event. Selected event URLs are checked against current assignments. Removing access hides actions immediately and redirects stale routes with a notice. Event times are advisory, matching the backend scan contract.

The participant roster uses administrator-only cursor-paginated APIs for search and filters. Details omit QR and dietary data; point changes append audited adjustments, and volunteer promotion creates separate staff credentials. The scanner and volunteer-management routes currently show protected entry pages. Camera scanning and volunteer-management forms belong to their separate workflow issues. Backend authorization remains mandatory for every operation.

Review page: applicant identity and responses first, background/education/resume, review controls beside the evidence on desktop, and expandable secondary applicant information. Confirmation identifies the applicant and manages keyboard focus; completion remains visible after the live query updates. Admin-only history remains below the review.

Applications queue: defaults to submissions needing review, oldest first. Status labels distinguish awaiting review, active review, and expired claims available to reclaim. Claim availability updates every 15 seconds without a database write or reload. Registration-owned statuses are preserved.

Search (`search`), status (`status`), sort (`sort`), and assignment (`reviewer=all|mine|available`) are stored in URL parameters and preserved through detail navigation. “My active reviews” excludes expired claims; “Available to review” includes unclaimed applications, expired claims, and the organizer's own active reviews.

“Review next application” respects the queue controls and order, wraps when needed, and skips completed applications and active claims held by others. Opening the next application focuses its heading. The next-link query has its own error boundary so it cannot block a decision.

Waitlisted applicants remain outside the default queue but can be accepted when a spot opens. Decision confirmation schedules the existing decision email; the completion message confirms scheduling without claiming delivery.
