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

## Windows runner shutdown

Playwright stops its web server with Windows `taskkill /T /F`. A restricted
execution sandbox can deny that process-tree cleanup: every test reports success,
but the runner stops at `Terminating the WebServer` and never exits. Run the E2E
command with permission to manage its child processes (outside the restricted
sandbox). There is no application shutdown change needed for this case.

To confirm the failure is in cleanup, enable Playwright's server logging:

```powershell
$env:DEBUG = "pw:webserver"
npm.cmd run test:e2e
Remove-Item Env:DEBUG
```

A successful run prints `Terminated the WebServer`, the final test summary, and
exits with code zero. Do not treat individual passing test lines as a completed run.

## Real-backend verification

`npm run test:smoke` is separate from the mock browser suite. It targets the shared
`standing-manatee-425` backend by default and requires a dedicated organizer
account. Setup and the exact checks are in
[the operations guide](../../docs/OPERATIONS.md#repeatable-live-backend-smoke-test).

Issue #44 follow-up verification (2026-10-15): all 25 mock browser tests passed
with exit code zero outside the Windows sandbox (42.1 seconds). The live smoke
check passed against `standing-manatee-425` using a dedicated reviewer, including
failed sign-out recovery and backend session revocation. This exercised the local
frontend with the deployed backend; it did not verify Vercel hosting or HTTPS cookies.
