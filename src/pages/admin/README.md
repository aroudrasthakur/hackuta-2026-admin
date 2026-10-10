# Admin pages (`src/pages/admin`)

Organizer route views. Login and read-only application detail are implemented; the queue, roster, and check-in tools remain placeholders.

## Overview

| File | Summary |
| --- | --- |
| [AdminLoginPage.tsx](AdminLoginPage.tsx) | `/admin/login` — organizer email + password sign-in |
| [AdminDashboardPage.tsx](AdminDashboardPage.tsx) | `/admin` — Convex URL and client status |
| [ApplicationsPage.tsx](ApplicationsPage.tsx) | `/admin/applications` — application queue placeholder |
| [ApplicationReviewPage.tsx](ApplicationReviewPage.tsx) | `/admin/applications/:applicationId` — protected read-only submitted application |
| [ParticipantsPage.tsx](ParticipantsPage.tsx) | `/admin/participants` — roster placeholder |
| [CheckInPage.tsx](CheckInPage.tsx) | `/admin/check-in` — check-in tools placeholder |

## Route map

| Path | Component |
| --- | --- |
| /admin/login | AdminLoginPage |
| /admin | AdminDashboardPage |
| /admin/applications | ApplicationsPage |
| /admin/applications/:applicationId | ApplicationReviewPage |
| /admin/participants | ParticipantsPage |
| /admin/check-in | CheckInPage |

## Future backend wiring

| Page | Expected Convex surface |
| --- | --- |
| ApplicationsPage | List `applications` + `applicationReviews` via `convex/admin/` |
| ApplicationReviewPage | `admin/applications:getApplication` — applicant answers, review status, resume |
| ParticipantsPage | Accepted applicants roster |
| CheckInPage | Event-day check-in |

Schema note: `applicationReviews` is the only register-origin table editable in [convex/schema.ts](../../../convex/schema.ts). `admins`, `applicationReviewLogs`, and `participants` are admin-owned tables in the same file.

The detail page groups applicant answers into contact, education, technical background, responses, dietary/allergy, accessibility, emergency contact, and consent sections. It preserves the Back to Applications link during application loading, not-found, and query-error states. After valid detail loads, it records one `viewed` event per route visit and reviewer, including reopening or refreshing. Rerenders and Strict Mode effect replays share the same request. Dashboard visits and dashboard query-parameter changes create no view events; navigation that changes query parameters on the detail page counts as a new visit and records another event after detail loads.

If logging fails, the application stays visible with a notice asking the reviewer to wait about a minute, then reopen it. There are no automatic retries or enforced cooldowns. Viewing does not claim the application or change its review state; claiming, decision controls, and current reviewer display await later issues.

## Related

| Location | Role |
| --- | --- |
| [pages/README.md](../README.md) | Full route table |
| [convex/admin/README.md](../../../convex/admin/README.md) | Organizer functions |

Parent index: [../../README.md](../../README.md).
