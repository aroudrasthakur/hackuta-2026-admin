# Frontend source (`src/`)

React + Vite organizer dashboard for HackUTA 2026. Reads the shared Convex deployment; does not own registration UI.

## Overview

| Path | Summary |
| --- | --- |
| [main.tsx](main.tsx) | App entry: ConvexProvider, router, error boundary, global CSS |
| [App.tsx](App.tsx) | Route table under `/admin` |
| [components/](components/README.md) | Shared UI — nav, guards, loading/error/empty states |
| [hooks/](hooks/README.md) | Convex configuration helper |
| [layouts/](layouts/README.md) | Admin shell with header and nav |
| [lib/](lib/README.md) | Browser Convex client |
| [pages/](pages/README.md) | Route views — dashboard, applications, participants, check-in |
| [styles/](styles/README.md) | Global Tailwind theme and admin CSS |
| [types/](types/README.md) | Route path constants |

## Nested README index

| Directory | README |
| --- | --- |
| components/ | [components/README.md](components/README.md) |
| components/states/ | [components/states/README.md](components/states/README.md) |
| hooks/ | [hooks/README.md](hooks/README.md) |
| layouts/ | [layouts/README.md](layouts/README.md) |
| lib/ | [lib/README.md](lib/README.md) |
| pages/ | [pages/README.md](pages/README.md) |
| pages/admin/ | [pages/admin/README.md](pages/admin/README.md) |
| styles/ | [styles/README.md](styles/README.md) |
| types/ | [types/README.md](types/README.md) |

Server Convex docs: [convex/README.md](../convex/README.md).

## Bootstrap flow (`main.tsx`)

```
ConvexProvider? (when VITE_CONVEX_URL set)
  └─ ErrorBoundary
       └─ BrowserRouter
            └─ App → routes
```

| Mode | When |
| --- | --- |
| Convex configured | `VITE_CONVEX_URL` set — ConvexProvider wraps the app |
| Missing env | Renders ErrorState with setup instructions |

## Related

| Location | Role |
| --- | --- |
| [convex/README.md](../convex/README.md) | Server functions and schema |
| [convex/admin/README.md](../convex/admin/README.md) | Organizer backend (future queries) |
| [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) | System context |

Parent index: [README.md](../README.md).
