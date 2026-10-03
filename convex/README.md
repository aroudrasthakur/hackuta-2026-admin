# Convex in hackuta-2026-admin

This repository **owns the Convex schema for the admin app** (see [`schema.ts`](schema.ts)). Deploy admin schema and organizer functions from this repo with `npm run convex:dev` / `npm run convex:deploy`.

[`hackuta-2026-register`](../hackuta-2026-register) remains the primary registration app and still owns registration, auth, and application tables on the shared Convex project. Coordinate schema changes across both repos when they share a deployment.

## Generated types

- Run `npm run convex:codegen` (or `npm run convex:dev`) after changing `schema.ts` or functions under `convex/`.
- `convex/_generated/` is gitignored; CI uses a minimal server stub so typecheck does not depend on the register repo.
- Do **not** use `convex:sync` from register for schema ownership—admin codegen is the source of truth for admin types.

## Layout

| Path | Purpose |
| --- | --- |
| `schema.ts` | Admin tables (e.g. `admins`) |
| `admin/` | Organizer queries, mutations, and actions |
| `_generated/` | Local codegen output (not committed) |

## Deployment

Default dev deployment: `standing-manatee-425` (see `.env.example`). Do not point at another deployment without team approval.
