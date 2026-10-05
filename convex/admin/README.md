# Admin Convex functions (`convex/admin/`)

Organizer-only queries, mutations, and internal actions. **Admin-owned** — safe to add and edit files here.

## Overview

| Path | Summary |
| --- | --- |
| [fields.ts](fields.ts) | Shared Convex validators for admin-owned tables |
| [applicationReviewLogs.ts](applicationReviewLogs.ts) | Review activity + decisions; creates `participants` on acceptance |
| [participants.ts](participants.ts) | `createParticipantFromAcceptance` — idempotent participant creation (internal) |

## Planned surface

| Area | Expected functions |
| --- | --- |
| Application queue | List/filter `applications` with `applicationReviews` status |
| Single review | Read application; create/update `applicationReviews` rows |
| Organizers | Read/write `admins` table for role checks |
| Check-in | Participant lookup mutations (TBD) |

## Schema notes

- `applicationReviews` — register-origin review state table editable in [schema.ts](../schema.ts).
- `admins` — admin-only table.
- `applicationReviewLogs` — append-only activity history; full history is restricted to admins.
- `participants` — admin-only table; one row per accepted application (reuses `users`, no applicant data copied).

Registration reads/writes for applicants remain in register-locked modules ([applications.ts](../applications.ts), [registrations.ts](../registrations.ts), etc.).

## Related

| Location | Role |
| --- | --- |
| [pages/admin/README.md](../../src/pages/admin/README.md) | UI routes that will call these functions |
| [REGISTER_SCHEMA.md](../REGISTER_SCHEMA.md) | Lock policy |

Parent index: [../README.md](../README.md).
