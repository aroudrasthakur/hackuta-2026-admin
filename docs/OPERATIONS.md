# Operations

Deploy and configure the organizer admin app. Shared Convex backend pushes run from [hackuta-2026-profile](../hackuta-2026-profile).

## Deployments

| Environment | Frontend | Convex deployment |
| --- | --- | --- |
| Shared dev | [127.0.0.1:5373](http://127.0.0.1:5373) (local) | `standing-manatee-425` |
| Production | Vercel (organizer URL TBD) | Production deployment (set in Vercel / Convex dashboard) |

**Register repo does not push to Convex.** Backend pushes run from the profile repo only. `npm run convex:dev`, `convex:push-dev`, and `convex:deploy` in this repo refuse so an admin-only upload cannot drop `convex/profile`.

## Backend release order

1. Change organizer Convex, `convex/schema.ts`, or `shared/admin` in this repo.
2. In the profile repo, run `npm run admin-schema-lock:refresh` and commit the copied files.
3. From the profile repo, run `npm run convex:push-dev` (shared dev) or `npm run convex:deploy` (production). Both commands verify the register lock and the admin lock first.

`.env.example` still points local Convex CLI config at `standing-manatee-425`. Keep personal deployment values in `.env.local`. Use `npm run convex:codegen` here when you only need generated types. Do not upload functions from this repo.

## Production frontend checklist

1. **Quality gate:** `npm run check:whitespace && npm run verify:register-schema-lock && npm run lint && npm run typecheck && npm run build`
2. **Convex:** already deployed from the profile repo (see above).
3. **Vercel:** push to `main` or promote deployment; set `VITE_CONVEX_URL`
4. **Smoke test:** sign in, open `/admin/applications`, open one application review

### Repeatable live-backend smoke test

`npm run test:smoke` serves the current frontend at `http://127.0.0.1:5377` and
connects to `standing-manatee-425` with mock mode and development auth bypass
disabled. It does not deploy code. Provide a dedicated reviewer account in the
**local-only** `.env.smoke.local` file (ignored by `.gitignore` via `.env.*` — never commit it):

```dotenv
ADMIN_SMOKE_EMAIL=<test-organizer-email>
ADMIN_SMOKE_PASSWORD=<test-organizer-password>
ADMIN_SMOKE_CONVEX_URL=https://standing-manatee-425.convex.cloud
```

The check exercises unauthenticated redirects, real sign-in, an HttpOnly cookie,
noncached session retrieval, queue loading and refresh, opening an application,
preserved filters, failed sign-out recovery, and successful sign-out. It verifies
the old session is invalid in Convex and cannot reopen the queue. At least one
submitted application must exist. Opening it appends the normal `viewed` audit
event; the check does not claim reviews, make decisions, or send emails.

The command closes its own browser and Vite server, reports only check results,
and exits nonzero on failure. It does not save screenshots, traces, passwords,
tokens, or applicant data. Use a dedicated account because normal sign-in clears
that organizer's earlier sessions. A Vercel deployment still needs its own smoke
check for HTTPS cookies and hosted API routing.

### Auth hardening deploy checklist

Use this when shipping organizer sign-in, session, or review authorization changes:

1. **Backend first:** from hackuta-2026-profile, `npm run convex:push-dev` (shared dev) or `npm run convex:deploy` (prod), after `npm run admin-schema-lock:refresh` if this repo's Convex files changed. Review-queue and detail views expect Convex to return `reviewClaim.expiresAt` and `reviewActivity.expiresAt` when a claim is active.
2. **Frontend:** deploy the admin app only after Convex functions are live on that deployment. If the frontend ships first, the UI falls back to legacy `isStale` / conservative “still under review” behavior until the backend is updated.
3. **Optional gate:** `npm run test:smoke` against shared dev after the Convex push and before promoting the frontend.
4. **Shared dev smoke:** sign in via `/admin/login`, open one application, log a view, sign out.
5. **Staging / preview:** confirm `VITE_DEV_AUTH_BYPASS` and `VITE_E2E_MOCK` are unset; production build must pass `scripts/verify-production-env.mjs`.
6. **Production:** repeat smoke test; verify failed sign-in returns 401/429 (not 500) with `{ code, error }` JSON and cookies use `HttpOnly` + `Cache-Control: no-store`.
7. **Integrations:** if anything calls `/api/admin/sign-in`, confirm it reads `code` — see [CHANGES.md](CHANGES.md).

Organizer authorization is enforced **in Convex** (`sessionToken` → `resolveAdminSession` / `requireAdminRole` on every admin mutation and query). The Vite auth plugin and browser UI are not security boundaries.

## Sign-in lockout and recovery

Failed organizer sign-in attempts are counted per **client IP + normalized email** (5 failures within 15 minutes). While locked out, sign-in returns a generic “too many attempts” message (HTTP **429** via the sign-in API).

| Situation | Recovery |
| --- | --- |
| Legitimate admin forgot password | Wait until failures age out of the 15-minute window, or sign in successfully from another IP if only one network path was locked. |
| Successful sign-in | Clears the failure counter for that IP + email pair. |
| Stuck after many tests / shared IP | In the Convex dashboard, delete `rateLimits` rows with bucket `admin_sign_in_failure` for the affected key (`<ip>:<email>`), or wait 15 minutes. |
| Account deactivated | Separate from lockout — inactive accounts receive HTTP **403** with an explicit inactive message. |

Lockouts are **not** permanent; they do not deactivate the admin account.

## Vercel environment variables

| Variable | Notes |
| --- | --- |
| `VITE_CONVEX_URL` | Public — Convex WebSocket URL for the deployment |

Do **not** set `CONVEX_DEPLOYMENT` on Vercel — local CLI only.

## Local development auth bypass

To skip the organizer sign-in form locally, set `VITE_DEV_AUTH_BYPASS=true` in
`.env.local` and provide `ADMIN_DEV_AUTH_EMAIL` and `ADMIN_DEV_AUTH_PASSWORD` for
an active admin account on the configured dev Convex deployment. These credentials
are read only by the local Vite server and are never exposed to the browser. Restart
Vite after changing these settings.

**Never commit** `ADMIN_DEV_AUTH_EMAIL` or `ADMIN_DEV_AUTH_PASSWORD`. Keep them in
`.env.local` only. Production and preview builds fail if `VITE_DEV_AUTH_BYPASS=true`
(`scripts/verify-production-env.mjs`).

This option creates a normal, authenticated admin session; it does not disable
Convex authorization. It is available only in Vite's **development** server (`mode === "development"`).
The `/api/admin/dev-sign-in` route accepts requests **only from loopback**
(`localhost`, `127.0.0.1`, `::1`) and rejects tunneled or remote `Host` / `X-Forwarded-For`
clients. It has no effect in production builds or preview deploys.

Do **not** set `VITE_E2E_MOCK` on Vercel (production or preview). It enables in-memory auth and fixed test credentials. GitHub Actions may set it only for the Playwright build artifact; real Vercel deploys must build without it (`scripts/verify-production-env.mjs` enforces this).

## Register lock refresh

Register is in production. Do **not** run `register-schema-lock:refresh` in this repo or in the profile repo unless [hackuta-2026-register](../hackuta-2026-register) itself has shipped a backend change. Verification (`npm run verify:register-schema-lock`) stays required in CI.

When that upstream backend change exists:

```bash
npm run register-schema-lock:refresh
npm run verify:register-schema-lock
git add scripts/register-schema-lock/ convex/ shared/
git commit -m "chore: refresh register schema lock"
```

See [convex/REGISTER_SCHEMA.md](../convex/REGISTER_SCHEMA.md).

## Related

| Location | Role |
| --- | --- |
| [README.md](../README.md) | Local setup |
| [docs/ARCHITECTURE.md](ARCHITECTURE.md) | System layout |
| [hackuta-2026-register/docs/OPERATIONS.md](../hackuta-2026-register/docs/OPERATIONS.md) | Registration app ops (frontend-only deploy) |

Parent index: [README.md](../README.md).
