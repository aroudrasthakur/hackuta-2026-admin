# Admin pages

| File | Route |
| --- | --- |
| [`AdminLoginPage.tsx`](AdminLoginPage.tsx) | `/admin/login` — email + password with the same show/hide control as register sign-in |
| [`ApplicationsPage.tsx`](ApplicationsPage.tsx) | `/admin/applications` |
| [`ApplicationReviewPage.tsx`](ApplicationReviewPage.tsx) | `/admin/applications/:applicationId` |
| [`DecisionEmailQueuePage.tsx`](DecisionEmailQueuePage.tsx) | `/admin/decision-emails` |
| [`MealsPage.tsx`](MealsPage.tsx) | `/admin/meals` — admin-only serving windows, counts, and collection history |
| [`ParticipantsPage.tsx`](ParticipantsPage.tsx) | `/admin/participants` — paginated accepted-participant roster and administration |
| [`VolunteerDashboardPage.tsx`](VolunteerDashboardPage.tsx) | `/admin/scan` |
| [`VolunteerScanPage.tsx`](VolunteerScanPage.tsx) | `/admin/scan/check-in`, `/admin/scan/food`, `/admin/scan/points` — QR scan, confirm, result |
| [`StaffWorkflowPage.tsx`](StaffWorkflowPage.tsx) | `/admin/volunteers` |

Admins and reviewers land on applications; volunteers land on `/admin/scan`.
Login restores authorized internal destinations; unknown routes return home.

Scan access follows `listMyScanOptions`: check-in and food need explicit grants,
and points need an assigned active event. Revoked access hides actions and
redirects stale routes. Event times are advisory. Volunteer management is a
placeholder and requires an admin. Every backend operation enforces
authorization separately.

The participant roster uses administrator-only cursor-paginated APIs for search and filters. Details omit QR and dietary data; point changes append audited adjustments, and volunteer promotion creates separate staff credentials. Volunteer-management forms belong to their separate workflow issue. Backend authorization remains mandatory for every operation.

Meals use reactive queries for schedules, served counts, and paginated collection
history. Status labels refresh every 15 seconds even without database writes.
Create/edit forms use the browser's local timezone. Disabling a meal requires
confirmation, and meals with history must be deactivated rather than removed.
Schedule overlap checks and removal protection run in backend transactions.

Food scanning selects a currently available meal (automatically when only one is
available). Availability reacts to admin edits and serving-window boundaries.
Changing or disabling the selected meal clears an unsubmitted preview and dietary
card. Once distribution is confirmed, its request and result stay visible until
the volunteer continues, even if the meal ends while the request is in flight.
Confirmation calls `redeemMeal`, which rechecks all permissions and eligibility;
duplicates show **Food Already Collected** with the meal and original collection
time. Rate-limit and connection errors keep the confirmation available for retry.
Legacy single-use food timestamps do not affect meal eligibility.

The application queue defaults to all applications, oldest first. URL parameters
preserve search, status, sort and assignment through review navigation. “Mine”
excludes expired claims; “Available” includes unclaimed, expired and own claims.
Claim availability refreshes every 15 seconds. Next review follows the queue,
wraps, skips completed or actively claimed applications, and focuses the heading.

Review confirmation identifies the applicant and schedules a decision email;
delivery is separate. Only admins see review history and email send/hold/retry
controls. Recently sent shows five emails. Application and email query failures
have local retry boundaries.
