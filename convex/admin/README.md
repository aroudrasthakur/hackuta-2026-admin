# Admin Convex functions (`convex/admin/`)

Organizer-only queries, mutations, and internal actions. **Admin-owned** — safe to add and edit files here.

## Overview

| Path | Summary |
| --- | --- |
| [auth.ts](auth.ts) | Organizer sign-in, sign-out, session lookup, credential provisioning |
| [staffAuth.ts](staffAuth.ts) | Session resolution and reusable reviewer/admin authorization helpers |
| [applications.ts](applications.ts) | Read-only submitted application detail, review status, and resume availability |
| [passwordHash.ts](passwordHash.ts) | Scrypt password hash + verify |
| [fields.ts](fields.ts) | Shared Convex validators for admin-owned tables |
| [participantCreation.ts](participantCreation.ts) | Idempotent participant lookup/insert (`applicationId` + `authUserId`) |
| [acceptanceDecision.ts](acceptanceDecision.ts) | Atomic accept → review update + audit log + participant row |
| [applicationReviewLogs.ts](applicationReviewLogs.ts) | Review activity + decisions (requires `sessionToken`) |
| [participants.ts](participants.ts) | `createParticipantFromAcceptance` — internal entry point for the helper |

## Authentication

Organizer auth is **independent** from applicant Convex Auth (`convex/auth.ts`).

| Table | Purpose |
| --- | --- |
| `admins` | Identity, `role`, `active` — source of truth for authorization |
| `adminAuthAccounts` | One password hash per admin (`adminId`) |
| `adminSessions` | Hashed session tokens with `expiresAt` |

Protected queries and mutations accept `sessionToken`. The helpers take `(ctx, sessionToken)` because internal authentication uses explicit session tokens:

- `getCurrentAdmin` returns the active `admins` record, or `null` for an invalid, expired, revoked, or orphaned session.
- `requireReviewerAccess` allows active reviewers and admins; activity logging and application decisions use it.
- `requireAdminRole` allows only active admins; historical review log queries use it.

Each protected request resolves the current stored role and active status. Acting identity always comes from the returned `admin._id`, including `applicationReviews.reviewedByAdmin`, `applicationReviewLogs.adminId`, and `participants.acceptedBy`; public operations never accept an acting admin ID or role. Applicant authentication cannot satisfy these guards.

The SPA obtains the token from `/api/admin/session-token`, which reads an HttpOnly cookie set by `/api/admin/sign-in`. Sign-in clears any prior sessions for that admin. These functions use the existing `standing-manatee-425` deployment configured in `.env.example`.

`getApplication` uses `requireReviewerAccess` before reading applicant data. It returns `null` for malformed, missing, or unsubmitted applications, and returns resume availability separately from the application. A missing review record remains missing; reading detail never creates review rows, audit events, or participants. No historical reviewer logs are returned.

## Planned surface

| Area | Expected functions |
| --- | --- |
| Application queue | List/filter `applications` with `applicationReviews` status |
| Single review | Read-only detail is implemented; active review claiming is a follow-up |
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
