# Admin-only shared code

Code under `shared/admin/` is **owned by hackuta-2026-admin**, not register.

- Safe to add new files here for organizer UI, review helpers, and admin-only types.
- **Do not** add registration behavior here — that belongs in `hackuta-2026-register/shared/` and enters the lock via `npm run register-schema-lock:refresh`.

See [`../convex/REGISTER_SCHEMA.md`](../convex/REGISTER_SCHEMA.md).
