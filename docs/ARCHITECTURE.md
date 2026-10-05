# Architecture

High-level structure of the admin codebase.

## System context

```
register.hackuta.com (registration UI) ──reads──► Convex (shared deployment)
hackuta-2026-admin (this app)          ──deploys──► Convex (schema + functions)
                                                      │
                                                      ├── standing-manatee-425 (dev)
                                                      └── production deployment

Organizer browser ──► admin SPA (Vercel) ──queries──► same Convex deployment
```

- **Registration frontend** lives in [hackuta-2026-register](../hackuta-2026-register). It does **not** push Convex code.
- **This repo** is the sole deploy path for backend schema and functions on the shared HackUTA Convex project.

## Repository layout

| Path | README | Role |
| --- | --- | --- |
| convex/ | [convex/README.md](../convex/README.md) | Backend — registration modules (locked) + admin modules |
| src/ | [src/README.md](../src/README.md) | Organizer React SPA |
| shared/ | [shared/README.md](../shared/README.md) | Registration isomorphic code (locked) + [shared/admin/](../shared/admin/) |
| scripts/ | [scripts/README.md](../scripts/README.md) | Codegen stub, schema lock, whitespace check |
| docs/ | [docs/README.md](README.md) | This documentation set |

## Schema ownership

| Owner | Tables / paths |
| --- | --- |
| Register (immutable copy) | Auth tables, `users`, `eventConfig`, `applications`, `applicationSubmissionLogs`, `rateLimits`, `resumeUploadSessions`, `emailDeliveries`, `emailDeliveryRecordingFailures`, all locked `convex/` and `shared/` files |
| Admin (editable) | `applicationReviews`, `admins`, `applicationReviewLogs`, `participants`, `convex/admin/`, `src/`, `shared/admin/` |

Full file list: [convex/REGISTER_SCHEMA.md](../convex/REGISTER_SCHEMA.md).

## Request flows (planned)

### Organizer review (in progress)

```
/admin/applications → list queue (placeholder UI)
/admin/applications/:id → single review (placeholder UI)
         ↓ (future)
convex/admin/* → applicationReviews + applications reads
```

### Deploy

```
Edit admin-owned paths → npm run verify:register-schema-lock
                      → npm run convex:push-dev (standing-manatee-425)
                      → npm run convex:deploy (production)
```

## Related

| Location | Role |
| --- | --- |
| [docs/OPERATIONS.md](OPERATIONS.md) | Operator deploy checklist |
| [hackuta-2026-register/docs/ARCHITECTURE.md](../hackuta-2026-register/docs/ARCHITECTURE.md) | Registration app architecture |

Parent index: [README.md](../README.md).
