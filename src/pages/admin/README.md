# Admin pages

| File | Route |
| --- | --- |
| [`AdminLoginPage.tsx`](AdminLoginPage.tsx) | `/admin/login` |
| [`ApplicationsPage.tsx`](ApplicationsPage.tsx) | `/admin/applications` |
| [`ApplicationReviewPage.tsx`](ApplicationReviewPage.tsx) | `/admin/applications/:applicationId` |

Review page: view logging, claim review, two-step decisions, admin-only review history.

Applications queue: defaults to unreviewed and under-review submissions, oldest first.
Completed decisions (including waitlisted) remain accessible through the review status filter.
Search, status, and sort are stored in URL parameters and preserved by the review page's back link.
