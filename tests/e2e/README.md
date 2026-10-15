# Playwright E2E (`tests/e2e/`)

Browser tests for the organizer admin SPA. They run against **`VITE_E2E_MOCK=true`**, which enables the in-memory auth + Convex mock (`shared/admin/e2e/mockAdminStore.ts`) — no live deployment is required.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run test:e2e` | Dev server on port 5373 |
| `PLAYWRIGHT_USE_BUILD=true npm run test:e2e` | Production `dist/` via [scripts/e2e-preview-server.mjs](../../scripts/e2e-preview-server.mjs) (CI path) |

## Coverage map

| Spec | Flows |
| --- | --- |
| [auth.spec.ts](auth.spec.ts) | Login redirect, invalid credentials, sign-out, home redirect |
| [applications-queue.spec.ts](applications-queue.spec.ts) | Search/status/assignment/sort controls, preserved queue context, next review, live claim expiry, desktop/mobile layout, keyboard navigation |
| [application-review.spec.ts](application-review.spec.ts) | Evidence-first layout, start/reclaim review, keyboard confirmation/completion, waitlist promotion, notification status checks, busy-review skipping, admin history |

Mock organizer accounts: [shared/admin/e2e/credentials.ts](../../shared/admin/e2e/credentials.ts).

Config: [playwright.config.ts](../../playwright.config.ts).
