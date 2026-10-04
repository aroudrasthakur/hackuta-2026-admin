# Pages (`src/pages`)

Route-level React views. Shared chrome comes from [src/layouts/](../layouts/README.md) and [src/components/](../components/README.md).

## Overview

| Path | Summary |
| --- | --- |
| [admin/](admin/README.md) | All organizer routes under `/admin` |

## Route map

| Path | Component | Auth |
| --- | --- | --- |
| / | Navigate → `/admin` | — |
| /admin | AdminDashboardPage | AdminProtectedRoute (placeholder) |
| /admin/applications | ApplicationsPage | Same |
| /admin/applications/:applicationId | ApplicationReviewPage | Same |
| /admin/participants | ParticipantsPage | Same |
| /admin/check-in | CheckInPage | Same |
| * | Navigate → `/admin` | — |

Defined in [App.tsx](../App.tsx). Path constants in [types/routes.ts](../types/routes.ts).

## Nested READMEs

| Folder | README |
| --- | --- |
| admin/ | [admin/README.md](admin/README.md) |

## Related

| Location | Role |
| --- | --- |
| [types/README.md](../types/README.md) | ADMIN_ROUTES constants |
| [convex/admin/README.md](../../convex/admin/README.md) | Future organizer queries |

Parent index: [../README.md](../README.md).
