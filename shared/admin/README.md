# Admin-only shared code (`shared/admin/`)

Isomorphic TypeScript for the organizer dashboard only. **Not register-locked** — safe to add files here.

Use this namespace for:

- Review workflow constants and labels
- Organizer-facing error copy
- Types shared between `src/` and `convex/admin/`

Do **not** put registration applicant logic here — that belongs in [hackuta-2026-register/shared/](../../hackuta-2026-register/shared/) and enters this repo via `npm run register-schema-lock:refresh`.

## Overview

| Path | Summary |
| --- | --- |
| (empty) | Add modules as review and check-in features land |

## Related

| Location | Role |
| --- | --- |
| [../README.md](../README.md) | Shared module index |
| [convex/admin/README.md](../../convex/admin/README.md) | Organizer Convex functions |
| [src/README.md](../../src/README.md) | Admin UI |

Parent index: [README.md](../../README.md).
