# Operations

Deploy, configure, and maintain the organizer admin app and shared Convex backend.

## Deployments

| Environment | Frontend | Convex deployment |
| --- | --- | --- |
| Shared dev | [127.0.0.1:5373](http://127.0.0.1:5373) (local) | `standing-manatee-425` |
| Production | Vercel (organizer URL TBD) | Production deployment (set in Vercel / Convex dashboard) |

**Register repo does not push to Convex.** All backend deploys run from this repo.

## Deploy to shared dev

```bash
cp .env.example .env.local   # CONVEX_DEPLOYMENT=dev:standing-manatee-425
npm run verify:register-schema-lock
npm run convex:push-dev
```

`convex:push-dev` runs schema lock verification automatically via `preconvex:push-dev`.

## Production release checklist

1. **Quality gate:** `npm run check:whitespace && npm run verify:register-schema-lock && npm run lint && npm run typecheck && npm run build`
2. **Convex prod:** `npm run convex:deploy`
3. **Vercel:** push to `main` or promote deployment; set `VITE_CONVEX_URL`
4. **Smoke test:** load `/admin`, confirm Convex URL on dashboard, exercise placeholder routes

## Vercel environment variables

| Variable | Notes |
| --- | --- |
| `VITE_CONVEX_URL` | Public — Convex WebSocket URL for the deployment |

Do **not** set `CONVEX_DEPLOYMENT` on Vercel — local CLI only.

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
