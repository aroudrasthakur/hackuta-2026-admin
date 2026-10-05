# Admin pages (`src/pages/admin`)

Organizer route views. Placeholder UIs until review queue and auth are implemented.

## Overview

| File | Summary |
| --- | --- |
| [AdminLoginPage.tsx](AdminLoginPage.tsx) | `/admin/login` — organizer email + password sign-in |
| [AdminDashboardPage.tsx](AdminDashboardPage.tsx) | `/admin` — Convex URL and client status |
| [ApplicationsPage.tsx](ApplicationsPage.tsx) | `/admin/applications` — application queue placeholder |
| [ApplicationReviewPage.tsx](ApplicationReviewPage.tsx) | `/admin/applications/:applicationId` — single review placeholder |
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
| ApplicationReviewPage | Read application row; mutate `applicationReviews` |
| ParticipantsPage | Accepted applicants roster |
| CheckInPage | Event-day check-in |

Schema note: `applicationReviews` is the only register-origin table editable in [convex/schema.ts](../../../convex/schema.ts). `admins`, `applicationReviewLogs`, and `participants` are admin-owned tables in the same file.

## Related

| Location | Role |
| --- | --- |
| [pages/README.md](../README.md) | Full route table |
| [convex/admin/README.md](../../../convex/admin/README.md) | Organizer functions |

Parent index: [../../README.md](../../README.md).
