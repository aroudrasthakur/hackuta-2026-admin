# Admin Convex functions (`convex/admin/`)

Organizer-only queries, mutations, and internal actions. **Admin-owned** — safe to add and edit files here.

## Overview

| Path | Summary |
| --- | --- |
| (empty) | Functions will be added for application review, roster, and check-in |

## Planned surface

| Area | Expected functions |
| --- | --- |
| Application queue | List/filter `applications` with `applicationReviews` status |
| Single review | Read application; create/update `applicationReviews` rows |
| Organizers | Read/write `admins` table for role checks |
| Check-in | Participant lookup mutations (TBD) |

## Schema notes

- `applicationReviews` — only register-origin table editable in [schema.ts](../schema.ts).
- `admins` — admin-only table.

Registration reads/writes for applicants remain in register-locked modules ([applications.ts](../applications.ts), [registrations.ts](../registrations.ts), etc.).

## Related

| Location | Role |
| --- | --- |
| [pages/admin/README.md](../../src/pages/admin/README.md) | UI routes that will call these functions |
| [REGISTER_SCHEMA.md](../REGISTER_SCHEMA.md) | Lock policy |

Parent index: [../README.md](../README.md).
