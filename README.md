# hackuta-2026-admin

Organizer app for HackUTA 2026. **Owns Convex deploys** for the shared project (`standing-manatee-425` and production).

[`hackuta-2026-register`](../hackuta-2026-register) is the applicant frontend; it does not push to Convex. Register-owned backend files are frozen here — see [`convex/REGISTER_SCHEMA.md`](convex/REGISTER_SCHEMA.md).

## Stack

Vite, React 19, TypeScript, React Router, Convex, Tailwind CSS v4.

## Routes

| Path | Purpose |
| --- | --- |
| `/admin/login` | Organizer sign-in |
| `/admin/applications` | Submitted application queue |
| `/admin/applications/:id` | Application review, decisions, history (admin) |

`/admin` redirects to the applications queue.

## Commands

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite + local API |
| `npm run convex:push-dev` | Push to standing-manatee-425 (runs schema lock verify) |
| `npm run test:unit` | Vitest |
| `npm run test:coverage` | Vitest + 90% coverage check (CI). See [tests/README.md](tests/README.md) |
| `npm run verify:register-schema-lock` | Fail if register-locked files drift |

Copy `.env.example` → `.env.local` with `CONVEX_DEPLOYMENT=dev:standing-manatee-425`.

## Layout

| Path | Notes |
| --- | --- |
| [`src/`](src/README.md) | Admin UI |
| [`convex/admin/`](convex/admin/README.md) | Organizer Convex functions |
| [`convex/REGISTER_SCHEMA.md`](convex/REGISTER_SCHEMA.md) | Lock policy |

Provision organizer accounts: insert `admins`, then `npx convex run admin/auth:provisionAdminAuthAccount '{"adminId":"<id>","password":"..."}'` (see [`convex/admin/README.md`](convex/admin/README.md)).
