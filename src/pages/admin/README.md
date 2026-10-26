# Admin pages

| File | Route |
| --- | --- |
| [`AdminLoginPage.tsx`](AdminLoginPage.tsx) | `/admin/login` — email + password with the same show/hide control as register sign-in |
| [`ApplicationsPage.tsx`](ApplicationsPage.tsx) | `/admin/applications` |
| [`ApplicationReviewPage.tsx`](ApplicationReviewPage.tsx) | `/admin/applications/:applicationId` |
| [`DecisionEmailQueuePage.tsx`](DecisionEmailQueuePage.tsx) | `/admin/decision-emails` |
| [`VolunteerDashboardPage.tsx`](VolunteerDashboardPage.tsx) | `/admin/scan` |
| [`StaffWorkflowPage.tsx`](StaffWorkflowPage.tsx) | `/admin/scan/check-in`, `/admin/scan/food`, `/admin/scan/points`, `/admin/participants`, `/admin/volunteers` |

Admins and reviewers land on applications; volunteers land on `/admin/scan`.
Login restores authorized internal destinations; unknown routes return home.

Scan access follows `listMyScanOptions`: check-in and food need explicit grants,
and points need an assigned active event. Revoked access hides actions and
redirects stale routes. Event times are advisory. Scanner and management pages
are placeholders; management requires an admin. Every backend operation enforces
authorization separately.

The application queue defaults to all applications, oldest first. URL parameters
preserve search, status, sort and assignment through review navigation. “Mine”
excludes expired claims; “Available” includes unclaimed, expired and own claims.
Claim availability refreshes every 15 seconds. Next review follows the queue,
wraps, skips completed or actively claimed applications, and focuses the heading.

Review confirmation identifies the applicant and schedules a decision email;
delivery is separate. Only admins see review history and email send/hold/retry
controls. Recently sent shows five emails. Application and email query failures
have local retry boundaries.
