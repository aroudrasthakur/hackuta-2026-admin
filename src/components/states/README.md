# Page states (`src/components/states`)

Reusable loading, error, and empty UI for admin routes. Flat directory.

## Overview

| File | Summary |
| --- | --- |
| [LoadingState.tsx](LoadingState.tsx) | One loading announcement with compact or row skeletons; animation respects reduced motion |
| [QueryErrorState.tsx](QueryErrorState.tsx) | Inline query failure with a retry callback |
| [ErrorState.tsx](ErrorState.tsx) | Error panel with title and message (also used when Convex env missing) |
| [EmptyState.tsx](EmptyState.tsx) | Empty list placeholder with optional action slot |

## Usage

| Export | Used by |
| --- | --- |
| LoadingState | Auth checks, application lists/detail, decision emails, volunteer assignments, and review history |
| QueryErrorState | Application queue and decision-email query boundaries |
| ErrorState | [main.tsx](../../main.tsx) (missing VITE_CONVEX_URL), [ErrorBoundary](../ErrorBoundary.tsx) |
| EmptyState | Application queue, decision emails, volunteer dashboard and workflow entry pages |

## Related

| Location | Role |
| --- | --- |
| [components/README.md](../README.md) | Parent components index |
| [pages/admin/README.md](../../pages/admin/README.md) | Pages that will consume these states |

Parent index: [../../README.md](../../README.md).
