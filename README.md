# hackuta-2026-admin

Organizer dashboard for HackUTA 2026. This app is a sibling of [`hackuta-2026-register`](../hackuta-2026-register) and talks to the **same Convex deployment** as registration—without owning schema or deploy for this milestone.

## Stack

- [Vite](https://vitejs.dev/) + React 19 + TypeScript
- [React Router](https://reactrouter.com/) for client routing
- [Convex](https://www.convex.dev/) client (types synced from register)
- [Tailwind CSS v4](https://tailwindcss.com/) with HackUTA design tokens

## Repository layout

| Path | Purpose |
| --- | --- |
| `src/` | Admin UI (routes, layouts, pages) |
| `convex/` | Docs + future `convex/admin/` functions; **no schema here** |
| `convex/_generated/` | Copied from register (`npm run convex:sync`) or stubbed for CI |
| `scripts/` | Convex stub + sync helpers |

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

1. **Develop backend** in `hackuta-2026-register` (`npm run convex:dev`, schema, functions).
2. **Sync codegen** into admin: `npm run convex:sync` (copies only `../hackuta-2026-register/convex/_generated/*`).
3. **Do not** run `convex deploy` from this repo for the current issue.

If register codegen is missing locally, `pretypecheck` / `prebuild` still copy a minimal `server.ts` stub so TypeScript and CI can run.

## Local development

```bash
cp .env.example .env.local
# Edit VITE_CONVEX_URL to match your register deployment

npm install
npm run convex:sync   # when register sibling exists
npm run dev
```

Dev server: [http://127.0.0.1:5373](http://127.0.0.1:5373) (see `vite.config.ts`).

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build |
| `npm run typecheck` | `src` + `convex/tsconfig.json` |
| `npm run lint` | ESLint on `src`, `convex`, `scripts` |
| `npm run convex:sync` | Copy register `convex/_generated` into admin |

## Environment variables

| Variable | Where | Notes |
| --- | --- | --- |
| `VITE_CONVEX_URL` | Vite / Vercel Config | Same deployment URL as register |

See `.env.example` for a dev deployment example.

## Deployment (Vercel)

- SPA rewrites in `vercel.json`
- Set `VITE_CONVEX_URL` for production to the prod Convex deployment used by register
- `X-Robots-Tag: noindex` — internal organizer tool

## Auth (planned)

`AdminProtectedRoute` is currently a pass-through. Organizer sign-in and role checks will replace it in a follow-up.

## Workspace

This repo is included in [`hackuta-2026-repository/hackuta.code-workspace`](../hackuta-2026-repository/hackuta.code-workspace) alongside register and the monorepo docs root.
