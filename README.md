# hackuta-2026-admin

Organizer dashboard for HackUTA 2026. This app **owns all Convex deploys** for the shared HackUTA project (`standing-manatee-425` and production).

[`hackuta-2026-register`](../hackuta-2026-register) remains the registration frontend; it **does not push** to Convex. Registration tables and backend modules are **frozen** in this repo — see [`convex/REGISTER_SCHEMA.md`](convex/REGISTER_SCHEMA.md). Only `applicationReviews`, `admins`, `applicationReviewLogs`, and `participants` schema tables may be edited here.

## Stack

- [Vite](https://vitejs.dev/) + React 19 + TypeScript
- [React Router](https://reactrouter.com/) for client routing
- [Convex](https://www.convex.dev/) (schema + functions in `convex/`)
- [Tailwind CSS v4](https://tailwindcss.com/) with HackUTA design tokens

## Repository layout

| Path | README | Purpose |
| --- | --- | --- |
| `src/` | [src/README.md](src/README.md) | Admin UI (routes, layouts, pages) |
| `convex/` | [convex/README.md](convex/README.md) | Backend — registration modules (locked) + admin modules |
| `shared/` | [shared/README.md](shared/README.md) | Registration isomorphic code (locked) + `shared/admin/` |
| `scripts/` | [scripts/README.md](scripts/README.md) | Codegen stub, schema lock, whitespace check |
| `docs/` | [docs/README.md](docs/README.md) | Architecture and operations docs |

Key files: [convex/schema.ts](convex/schema.ts) (editable: `applicationReviews`, `admins`, `applicationReviewLogs`, `participants`), [convex/REGISTER_SCHEMA.md](convex/REGISTER_SCHEMA.md) (67 immutable code paths).

## Routes

| Path | Page |
| --- | --- |
| `/` | Redirects to `/admin` |
| `/admin` | Dashboard (Convex URL status) |
| `/admin/applications` | Application queue (placeholder) |
| `/admin/applications/:applicationId` | Single application review |
| `/admin/participants` | Participant roster (placeholder) |
| `/admin/check-in` | Check-in tools (placeholder) |

## Convex workflow

1. Copy `.env.example` → `.env.local` and set `CONVEX_DEPLOYMENT=dev:standing-manatee-425`.
2. Read [`convex/REGISTER_SCHEMA.md`](convex/REGISTER_SCHEMA.md) — do not edit register-locked files.
3. **Schema / functions:** edit `applicationReviews`, `admins`, `applicationReviewLogs`, `participants`, and `convex/admin/` only.
4. **Codegen:** `npm run convex:codegen` (or `npm run convex:dev` while developing).
5. **Verify lock:** `npm run verify:register-schema-lock` (also runs before `convex:push-dev`).
6. **Push to shared dev:** `npm run convex:push-dev` (standing-manatee-425).
7. **Deploy production backend:** `npm run convex:deploy` when ready.

If register source files change upstream, run `npm run register-schema-lock:refresh` (requires sibling register repo) and commit the updated manifest.

## Local development

```bash
cp .env.example .env.local
npm install
npm run convex:codegen   # after schema/function changes, when .env.local is configured
npm run dev
```

Dev server: [http://127.0.0.1:5373](http://127.0.0.1:5373)

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build |
| `npm run typecheck` | `src` + `convex/` |
| `npm run lint` | ESLint on `src`, `convex`, `scripts` |
| `npm run check:whitespace` | Fail if tracked text files lack a final newline |
| `npm run verify:register-schema-lock` | Fail if register-frozen files drift |
| `npm run register-schema-lock:refresh` | Re-copy lock manifest from sibling register repo |
| `npm run convex:dev` | Convex dev (watch + codegen) |
| `npm run convex:push-dev` | One-shot push to standing-manatee-425 |
| `npm run convex:codegen` | Regenerate `convex/_generated/` |
| `npm run convex:deploy` | Deploy to production Convex |

## Environment variables

| Variable | Where | Notes |
| --- | --- | --- |
| `VITE_CONVEX_URL` | Vite / Vercel Config | Convex deployment URL (browser) |
| `CONVEX_DEPLOYMENT` | Local CLI only | e.g. `dev:standing-manatee-425` for `convex dev` / deploy |

See [`.env.example`](.env.example).

## Deployment (Vercel)

- SPA rewrites in `vercel.json`
- Set `VITE_CONVEX_URL` for production
- Deploy Convex backend from this repo with `npm run convex:deploy`
- `X-Robots-Tag: noindex` — internal organizer tool

## Auth (planned)

`AdminProtectedRoute` is currently a pass-through. Organizer sign-in and role checks will replace it in a follow-up.

## Documentation

| Doc | Audience |
| --- | --- |
| [docs/README.md](docs/README.md) | Documentation index |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Repo layout and deploy ownership |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Deploy checklist and env vars |
| [convex/REGISTER_SCHEMA.md](convex/REGISTER_SCHEMA.md) | Register lock — file-by-file |

Each major directory has a `README.md` with an overview table, usage, and related links (same style as [hackuta-2026-register](https://github.com/aroudrasthakur/hackuta-2026-register)).

## Workspace

Included in [`hackuta-2026-repository/hackuta.code-workspace`](../hackuta-2026-repository/hackuta.code-workspace) alongside register and the marketing site.
