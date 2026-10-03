# Client libraries (`src/lib`)

Browser-side utilities. Flat directory.

## Overview

| File | Summary |
| --- | --- |
| [convexClient.ts](convexClient.ts) | Creates `ConvexReactClient` from `VITE_CONVEX_URL`; exports `normalizeConvexUrl()` |

## Usage

| Export | Used by |
| --- | --- |
| convexClient | [main.tsx](../main.tsx) — ConvexProvider |
| normalizeConvexUrl | [AdminDashboardPage](../pages/admin/AdminDashboardPage.tsx) |

Returns `null` when `VITE_CONVEX_URL` is unset so [main.tsx](../main.tsx) can show setup instructions.

## Related

| Location | Role |
| --- | --- |
| [hooks/README.md](../hooks/README.md) | useConvexConfigured |
| [convex/README.md](../../convex/README.md) | Server-side Convex modules |

Parent index: [../README.md](../README.md).
