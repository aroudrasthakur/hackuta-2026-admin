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
| [auth.spec.ts](auth.spec.ts) | Sign-in/out, redirects, role isolation and expiry |
| [applications-queue.spec.ts](applications-queue.spec.ts) | Filters, queue context, claims and navigation |
| [application-review.spec.ts](application-review.spec.ts) | Review, decisions, resume focus and history |
| [decision-email-queue.spec.ts](decision-email-queue.spec.ts) | Permissions, hold/send/retry, recovery and scrolling |
| [dashboard-layout.spec.ts](dashboard-layout.spec.ts) | Responsive layout, long content, keyboard, motion, zoom and contrast |

Mock organizer accounts: [shared/admin/e2e/credentials.ts](../../shared/admin/e2e/credentials.ts).

Config: [playwright.config.ts](../../playwright.config.ts).

Decision-email scenarios: [`fixtures/decisionQueue.ts`](fixtures/decisionQueue.ts).
Coverage uses Chromium and CSS zoom; manual browser zoom and assistive-technology
checks remain separate. Screenshots in `test-results/` are review artifacts.

## Windows runner shutdown

Windows `taskkill /T /F` needs permission to stop Playwright's server process tree.
If a sandbox leaves the runner at `Terminating the WebServer` after passing tests,
run outside that sandbox. Diagnose with `$env:DEBUG = "pw:webserver"` before
`npm.cmd run test:e2e`; clear logging with `Remove-Item Env:DEBUG` afterward.
Completion requires `Terminated the WebServer`, the final summary, and exit code zero.

## Real-backend verification

For `npm run test:smoke` setup and scope, see
[the operations guide](../../docs/OPERATIONS.md#repeatable-live-backend-smoke-test).
