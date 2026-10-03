# Admin Convex functions

Organizer-only queries and mutations live here. Tables and schema are owned by `hackuta-2026-register` (`convex/schema.ts`).

- `applicationReviewLogs.ts`: append-only review history (`logApplicationReviewAction`, and `listApplicationReviewLogs` for `admin` role only). Writes to the register-owned `applicationReviewLogs` table.
