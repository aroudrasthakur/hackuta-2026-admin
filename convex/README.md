# Convex in hackuta-2026-admin

This repository is the **sole deploy path** for the shared Convex project (`standing-manatee-425` dev, production via `npm run convex:deploy`). [`hackuta-2026-register`](../hackuta-2026-register) no longer pushes backend code.

## Schema ownership

| Doc | Purpose |
| --- | --- |
| [**REGISTER_SCHEMA.md**](REGISTER_SCHEMA.md) | Locked registration tables and files (read first) |
| [`schema.ts`](schema.ts) | Deployment schema |
| [`../hackuta-2026-register/convex/schema.ts`](../hackuta-2026-register/convex/schema.ts) | Live reference in register repo |

**Editable in admin:** `applicationReviews` and `admins` tables in `schema.ts`, plus everything under [`admin/`](admin/).

**Frozen (register lock):** all other tables, all mirrored `convex/` modules, and all of `shared/`. See [REGISTER_SCHEMA.md](REGISTER_SCHEMA.md).

```bash
npm run verify:register-schema-lock   # before deploy
npm run convex:push-dev             # runs verify automatically
```

## Generated types

- Run `npm run convex:codegen` (or `npm run convex:dev`) after changing `schema.ts` or functions under `convex/`.
- `convex/_generated/` is gitignored; CI uses a minimal server stub.

## Layout

| Path | Purpose |
| --- | --- |
| `schema.ts` | Full deployment schema |
| `REGISTER_SCHEMA.md` | Register lock policy and file list |
| `applicationFields.ts` | Application validators (register-locked) |
| `lib/`, `email/` | Registration backend (register-locked) |
| `admin/` | Organizer queries, mutations, and actions |
| `_generated/` | Local codegen output (not committed) |

## Deployment

Default dev deployment: `standing-manatee-425` (see `.env.example`).
