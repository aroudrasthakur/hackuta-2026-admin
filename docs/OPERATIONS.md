# Operations

Deploy, configure, and maintain the organizer admin app and shared Convex backend.

## Deployments

| Environment | Frontend | Convex deployment |
| --- | --- | --- |
| Shared dev | [127.0.0.1:5373](http://127.0.0.1:5373) (local) | `standing-manatee-425` |
| Production | Vercel (organizer URL TBD) | Production deployment (set in Vercel / Convex dashboard) |

**Register repo does not push to Convex.** All backend deploys run from this repo.

## Deploy to shared dev

`.env.example` intentionally targets the shared dev deployment because
`convex:push-dev` loads that file directly. Keep personal deployment values in
`.env.local`; do not copy personal deployment identifiers into `.env.example`.

```bash
cp .env.example .env.local   # CONVEX_DEPLOYMENT=dev:standing-manatee-425
npm run verify:register-schema-lock
npm run convex:push-dev
```

`convex:push-dev` runs schema lock verification automatically via `preconvex:push-dev`.
To use a personal dev deployment for local app development, set its URL and
`CONVEX_DEPLOYMENT` in `.env.local` and run `npm run convex:dev`. The shared-dev
push command continues to target `standing-manatee-425`.

## Production release checklist

1. **Quality gate:** `npm run check:whitespace && npm run verify:register-schema-lock && npm run lint && npm run typecheck && npm run build`
2. **Convex prod:** `npm run convex:deploy`
3. **Vercel:** push to `main` or promote deployment; set `VITE_CONVEX_URL`
4. **Smoke test:** sign in, open `/admin/applications`, open one application review

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

When registration source files change in [hackuta-2026-register](../hackuta-2026-register) (rare):

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
