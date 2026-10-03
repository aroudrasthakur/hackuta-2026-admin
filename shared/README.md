# Shared code (`shared/`)

Isomorphic TypeScript imported by registration Convex modules in this repo. Keeps validation, enums, and error copy in one place.

> **Register-locked:** Paths under `auth/`, `hackathon/`, `lib/`, and `registration/` are immutable. Do not edit — see [convex/REGISTER_SCHEMA.md](../convex/REGISTER_SCHEMA.md). Admin-only shared code belongs in [admin/](admin/README.md).

## Overview

| Path | Summary | Lock |
| --- | --- | --- |
| [registration/](registration/README.md) | Application form schema, types, draft mapping, resume policy | Register-locked |
| [auth/](auth/README.md) | Password rules and OTP rate-limit helpers | Register-locked |
| [hackathon/](hackathon/README.md) | Canonical schedule dates and timeline builders | Register-locked |
| [lib/](lib/README.md) | Email normalization and input sanitization | Register-locked |
| [admin/](admin/README.md) | Organizer-only shared code (future) | **Admin-owned** |

## Nested README index

| Directory | README |
| --- | --- |
| registration/ | [registration/README.md](registration/README.md) |
| auth/ | [auth/README.md](auth/README.md) |
| hackathon/ | [hackathon/README.md](hackathon/README.md) |
| lib/ | [lib/README.md](lib/README.md) |
| admin/ | [admin/README.md](admin/README.md) |

Convex application validators in [convex/applicationFields.ts](../convex/applicationFields.ts) derive from [registration/applicantFields.ts](registration/applicantFields.ts).

## Adding new shared code

| Need | Location |
| --- | --- |
| Registration behavior | Add in [hackuta-2026-register/shared/](../hackuta-2026-register/shared/), then `npm run register-schema-lock:refresh` |
| Organizer-only helpers | [shared/admin/](admin/README.md) |

## Related

| Location | Role |
| --- | --- |
| [convex/README.md](../convex/README.md) | Server functions that consume shared validation |
| [convex/REGISTER_SCHEMA.md](../convex/REGISTER_SCHEMA.md) | File-by-file lock list |
| [hackuta-2026-register/shared/README.md](../hackuta-2026-register/shared/README.md) | Live registration shared docs |

Parent index: [README.md](../README.md).
