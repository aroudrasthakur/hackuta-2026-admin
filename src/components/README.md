# Components (`src/components`)

Shared React UI for the organizer admin app: navigation, route guard placeholder, error boundary, and page state components.

## Overview

| Path | Summary |
| --- | --- |
| [AdminNav.tsx](AdminNav.tsx) | Primary nav links — dashboard, applications, participants, check-in |
| [AdminProtectedRoute.tsx](AdminProtectedRoute.tsx) | Auth guard placeholder (pass-through until organizer auth) |
| [ErrorBoundary.tsx](ErrorBoundary.tsx) | Catches render errors; shows ErrorState fallback |
| [states/](states/README.md) | LoadingState, ErrorState, EmptyState |

## Usage

| Component | Used by |
| --- | --- |
| AdminNav | [AdminLayout](../layouts/AdminLayout.tsx) |
| AdminProtectedRoute | [App.tsx](../App.tsx) — wraps `/admin` layout |
| ErrorBoundary | [main.tsx](../main.tsx) |
| states/* | Pages and ErrorBoundary |

## Related

| Location | Role |
| --- | --- |
| [layouts/README.md](../layouts/README.md) | AdminLayout shell |
| [pages/README.md](../pages/README.md) | Route views |
| [styles/README.md](../styles/README.md) | Tailwind tokens and admin CSS |

Parent index: [../README.md](../README.md).
