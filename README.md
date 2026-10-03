# hackuta-2026-admin

Organizer dashboard for HackUTA 2026. This app connects to the shared HackUTA Convex project and **owns the admin schema** in [`convex/schema.ts`](convex/schema.ts).

[`hackuta-2026-register`](../hackuta-2026-register) remains the registration app (auth, applications, email). Run admin backend work from this repo; run registration backend work from register.

## Stack

- [Vite](https://vitejs.dev/) + React 19 + TypeScript
- [React Router](https://reactrouter.com/) for client routing
- [Convex](https://www.convex.dev/) (schema + functions in `convex/`)
- [Tailwind CSS v4](https://tailwindcss.com/) with HackUTA design tokens

## Repository layout

| Path | Purpose |
| --- | --- |
| `src/` | Admin UI (routes, layouts, pages) |
| `convex/schema.ts` | Admin tables (source of truth for admin schema) |
| `convex/admin/` | Organizer Convex functions |
| `convex/_generated/` | Local codegen (`npm run convex:codegen`); gitignored |
| `scripts/` | Convex CI stub helpers |

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
2. **Schema / functions:** edit `convex/schema.ts` and `convex/admin/` in this repo.
3. **Codegen:** `npm run convex:codegen` (or `npm run convex:dev` while developing).
4. **Deploy admin backend:** `npm run convex:deploy` from this repo when ready.

Registration schema and functions are still developed and deployed from `hackuta-2026-register`. When both apps share a deployment, coordinate deploy order and schema so neither repo drops the other's tables.

CI does **not** clone register or run `convex:sync`; it uses a stubbed `convex/_generated/server.ts` for typecheck/build.

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
| `npm run convex:dev` | Convex dev (watch + codegen) |
| `npm run convex:codegen` | Regenerate `convex/_generated/` |
| `npm run convex:deploy` | Deploy admin convex code |

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

## Workspace

Included in [`hackuta-2026-repository/hackuta.code-workspace`](../hackuta-2026-repository/hackuta.code-workspace) alongside register and the marketing site.
