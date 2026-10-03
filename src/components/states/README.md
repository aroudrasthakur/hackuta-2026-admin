# Page states (`src/components/states`)

Reusable loading, error, and empty UI for admin routes. Flat directory.

## Overview

| File | Summary |
| --- | --- |
| [LoadingState.tsx](LoadingState.tsx) | Centered spinner/message while data loads |
| [ErrorState.tsx](ErrorState.tsx) | Error panel with title and message (also used when Convex env missing) |
| [EmptyState.tsx](EmptyState.tsx) | Empty list placeholder with optional action slot |

## Usage

| Export | Used by |
| --- | --- |
| LoadingState | Admin pages (future data-fetch views) |
| ErrorState | [main.tsx](../../main.tsx) (missing VITE_CONVEX_URL), [ErrorBoundary](../ErrorBoundary.tsx) |
| EmptyState | Application queue and roster placeholders (future) |

## Related

| Location | Role |
| --- | --- |
| [components/README.md](../README.md) | Parent components index |
| [pages/admin/README.md](../../pages/admin/README.md) | Pages that will consume these states |

Parent index: [../../README.md](../../README.md).
