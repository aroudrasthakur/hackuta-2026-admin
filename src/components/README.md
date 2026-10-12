# Components (`src/components`)

Shared React UI for the organizer admin app: navigation, staff route guard, application detail, error boundary, and page state components.

## Overview

| Path | Summary |
| --- | --- |
| [AdminNav.tsx](AdminNav.tsx) | Primary nav links — dashboard, applications, participants, check-in |
| [AdminProtectedRoute.tsx](AdminProtectedRoute.tsx) | Waits for staff authentication; redirects unauthenticated visitors |
| [ApplicationDetail.tsx](ApplicationDetail.tsx) | Grouped read-only applicant answers, review status, and resume |
| [ErrorBoundary.tsx](ErrorBoundary.tsx) | Catches render errors; accepts a page fallback or shows ErrorState |
| [states/](states/README.md) | LoadingState, ErrorState, EmptyState |

## Usage

| Component | Used by |
| --- | --- |
| AdminNav | [AdminLayout](../layouts/AdminLayout.tsx) |
| AdminProtectedRoute | [App.tsx](../App.tsx) — wraps `/admin` layout |
| ApplicationDetail | [ApplicationReviewPage](../pages/admin/ApplicationReviewPage.tsx) |
| ErrorBoundary | [main.tsx](../main.tsx), ApplicationReviewPage |
| states/* | Pages and ErrorBoundary |

## Related

| Location | Role |
| --- | --- |
| [layouts/README.md](../layouts/README.md) | AdminLayout shell |
| [pages/README.md](../pages/README.md) | Route views |
| [styles/README.md](../styles/README.md) | Tailwind tokens and admin CSS |

Parent index: [../README.md](../README.md).
