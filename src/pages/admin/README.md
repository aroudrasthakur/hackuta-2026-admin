# Admin pages

| File | Route |
| --- | --- |
| [`AdminLoginPage.tsx`](AdminLoginPage.tsx) | `/admin/login` — email + password with the same show/hide control as register sign-in |
| [`ApplicationsPage.tsx`](ApplicationsPage.tsx) | `/admin/applications` |
| [`ApplicationReviewPage.tsx`](ApplicationReviewPage.tsx) | `/admin/applications/:applicationId` |

Review page: applicant identity and responses first, background/education/resume, review controls beside the evidence on desktop, and expandable secondary applicant information. Confirmation identifies the applicant and manages keyboard focus; completion remains visible after the live query updates. Admin-only history remains below the review.

Applications queue: defaults to submissions needing review, oldest first. Status labels distinguish awaiting review, active review, and expired claims available to reclaim. Claim availability updates every 15 seconds without a database write or reload. Registration-owned statuses are preserved.

Search (`search`), status (`status`), sort (`sort`), and assignment (`reviewer=all|mine|available`) are stored in URL parameters and preserved through detail navigation. “My active reviews” excludes expired claims; “Available to review” includes unclaimed applications, expired claims, and the organizer's own active reviews.

“Review next application” respects the queue controls and order, wraps when needed, and skips completed applications and active claims held by others. Opening the next application focuses its heading. The next-link query has its own error boundary so it cannot block a decision.

Waitlisted applicants remain outside the default queue but can be accepted when a spot opens. Decision confirmation schedules the existing decision email; the completion message confirms scheduling without claiming delivery.
