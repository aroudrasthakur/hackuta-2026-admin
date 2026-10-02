# Convex in hackuta-2026-admin

This repository **does not** own the HackUTA Convex schema or deployment.

- **Source of truth:** `hackuta-2026-register` (`convex/` functions, schema, and `convex dev` / `convex deploy`).
- **Generated types:** Sync from register with `npm run convex:sync`, which copies only `../hackuta-2026-register/convex/_generated/*` into `convex/_generated/`.
- **Do not** run `convex deploy` from this repo for the current milestone. Organizer-only Convex functions will live under `convex/admin/` in a future change.

For local admin UI development, point `VITE_CONVEX_URL` at the same deployment as register (see `.env.example`).
