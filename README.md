# hackuta-2026-admin

Organizer app for HackUTA 2026. Organizer Convex functions live here, but **backend pushes run from** [`hackuta-2026-profile`](../hackuta-2026-profile) so register-locked modules, admin functions, and `convex/profile` stay on one deployment (`standing-manatee-425` and production).

[`hackuta-2026-register`](../hackuta-2026-register) is the applicant frontend; it does not push to Convex. Register-owned backend files are frozen here — see [`convex/REGISTER_SCHEMA.md`](convex/REGISTER_SCHEMA.md). While that production frontend is frozen, do not run `register-schema-lock:refresh` unless the register repo itself has shipped a backend change.

## Stack

Vite, React 19, TypeScript, React Router, Convex, Tailwind CSS v4.

## Routes

| Path | Purpose |
| --- | --- |
| `/admin/login` | Organizer sign-in |
| `/volunteer` | Redirects volunteers to `/admin/scan` |
| `/admin/scan` | Volunteer dashboard, responsibilities, and assigned events |
| `/admin/scan/check-in`, `/admin/scan/food`, `/admin/scan/points` | Capability-protected scanner entry pages |
| `/admin/scan/shop` | Shop sales for volunteers with shop access |
| `/admin/participants`, `/admin/volunteers` | Administrator-only management entry pages |
| `/admin/shop` | Admin shop: items and stock, flash sales (`?tab=sales`), purchase history (`?tab=history`) |
| `/admin/applications` | Submitted application queue |
| `/admin/decision-emails` | Decision email queue for admins and reviewers |
| `/admin/applications/:id` | Application review, decisions, history (admin) |

`/admin` redirects admins and reviewers to applications and volunteers to the scanner dashboard. Scanner and management workflows currently show protected placeholders; their full interfaces are delivered separately.

## Commands

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite + local API |
| `npm run convex:codegen` | Generate Convex types without uploading functions |
| `npm run convex:push-dev` | Refuses — push the shared backend from the profile repo |
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
