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
| [auth.spec.ts](auth.spec.ts) | Login redirect, invalid credentials, sign-out, home redirect, volunteer isolation and idle expiry |
| [applications-queue.spec.ts](applications-queue.spec.ts) | Search/status/assignment/sort controls, preserved queue context, next review, live claim expiry, desktop/mobile layout, keyboard navigation |
| [application-review.spec.ts](application-review.spec.ts) | Evidence-first layout, start/reclaim review, keyboard confirmation/completion, native resume-dialog focus, waitlist promotion, busy-review skipping, admin history |
| [decision-email-queue.spec.ts](decision-email-queue.spec.ts) | Reviewer read-only view, admin hold/unhold/send/retry, delivery states, query recovery, contextual loading, mobile table scrolling |
| [dashboard-layout.spec.ts](dashboard-layout.spec.ts) | Cross-page headers and navigation, widths 320–1440, long content, mobile account keyboard behavior, reduced motion, 200% CSS zoom, status/action contrast and review screenshots |

Mock organizer accounts: [shared/admin/e2e/credentials.ts](../../shared/admin/e2e/credentials.ts).

Config: [playwright.config.ts](../../playwright.config.ts).

Decision-email scenarios use `fixtures/decisionQueue.ts` and the existing in-memory
store. The fixture hook is exposed only in mock mode. No scenario uses live data or
sends email. Screenshot files in `test-results/` are review evidence, not pixel
regression baselines. Automated browser coverage is Chromium; the CSS zoom check
does not replace manual browser zoom or assistive-technology review.

## Windows runner shutdown

Windows `taskkill /T /F` needs permission to stop Playwright's server process tree.
If a sandbox leaves the runner at `Terminating the WebServer` after passing tests,
run outside that sandbox. Diagnose with `$env:DEBUG = "pw:webserver"` before
`npm.cmd run test:e2e`; clear logging with `Remove-Item Env:DEBUG` afterward.
Completion requires `Terminated the WebServer`, the final summary, and exit code zero.

## Real-backend verification

For `npm run test:smoke` setup and scope, see
[the operations guide](../../docs/OPERATIONS.md#repeatable-live-backend-smoke-test).

Verified for #44 on 2026-10-15: 25 browser tests passed and exited cleanly (42.1s);
the live smoke check passed against `standing-manatee-425` with a dedicated reviewer.
This covered the local frontend and deployed backend, excluding Vercel and HTTPS cookies.
