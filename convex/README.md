# Convex in hackuta-2026-admin

This repository **owns the Convex schema for the shared deployment** (see [`schema.ts`](schema.ts)). The schema includes all registration tables from [`hackuta-2026-register`](../hackuta-2026-register) plus admin-only tables (e.g. `admins`). Deploy from this repo with `npm run convex:dev` / `npm run convex:deploy`.

When registration tables or functions change in register, mirror them here before deploying so the shared deployment keeps every table and endpoint.

Registration Convex functions under `convex/` (excluding `convex/admin/`) are copied from register so a deploy from this repo does not remove registration backend code.

## Generated types

- Run `npm run convex:codegen` (or `npm run convex:dev`) after changing `schema.ts` or functions under `convex/`.
- `convex/_generated/` is gitignored; CI uses a minimal server stub so typecheck does not depend on the register repo.
- Do **not** use `convex:sync` from register for schema ownership—admin codegen is the source of truth for admin types.

## Layout

| Path | Purpose |
| --- | --- |
| `schema.ts` | Full deployment schema (register tables + `admins`) |
| `applicationFields.ts` | Application validators (mirrored from register) |
| `lib/` | Shared Convex helpers (mirrored from register) |
| `admin/` | Organizer queries, mutations, and actions |
| `_generated/` | Local codegen output (not committed) |

## Deployment

Default dev deployment: `standing-manatee-425` (see `.env.example`). Do not point at another deployment without team approval.
