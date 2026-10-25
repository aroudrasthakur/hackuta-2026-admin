# Admin Convex functions (`convex/admin/`)

Organizer-only queries, mutations, and internal actions. **Admin-owned** — safe to add and edit files here.

## Overview

| Path | Summary |
| --- | --- |
| [auth.ts](auth.ts) | Organizer sign-in, sign-out, session lookup, credential provisioning |
| [staffAuth.ts](staffAuth.ts) | Session resolution and role guards (see [VOLUNTEER_AUTHORIZATION.md](VOLUNTEER_AUTHORIZATION.md)) |
| [volunteerAccounts.ts](volunteerAccounts.ts) | Admin-only volunteer creation, resets, revocation, restoration, capabilities, and event assignments |
| [staffCredentials.ts](staffCredentials.ts) | Shared password validation, hashing, credential storage, and session invalidation |
| [applications.ts](applications.ts) | Read-only application queue and submitted application detail (no audit logs on list) |
| [passwordHash.ts](passwordHash.ts) | Scrypt password hash + verify |
| [fields.ts](fields.ts) | Shared Convex validators for admin-owned tables |
| [participantCreation.ts](participantCreation.ts) | Idempotent participant lookup/insert (`applicationId` + `authUserId`) |
| [acceptanceDecision.ts](acceptanceDecision.ts) | Atomic accept → review update + audit log + participant row |
| [applicationReviewLogs.ts](applicationReviewLogs.ts) | Review activity, confirmed decisions, and admin-only history (requires `sessionToken`) |
| [decisionFinalize.ts](decisionFinalize.ts) | Idempotent final decision: review patch, audit log, decision email schedule |
| [decisionEmailTemplates.ts](decisionEmailTemplates.ts) | Plain-text copy for acceptance, rejection, and waitlist emails |
| [decisionEmailService.ts](decisionEmailService.ts) | Decision mail via register-locked `sendMailMessage` (same email service HTTP client) |
| [sendDecisionEmails.ts](sendDecisionEmails.ts) | Internal action that sends decision notifications |
| [participants.ts](participants.ts) | `createParticipantFromAcceptance` — internal entry point for the helper |
| [volunteerScan.ts](volunteerScan.ts) | Volunteer scan options and read-only QR preview (`listMyScanOptions`, `resolveQrForScan`) |
| [volunteerScanRateLimit.ts](volunteerScanRateLimit.ts) | Per-volunteer QR lookup throttling in `rateLimits`, plus internal cleanup |

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
- `requireVolunteerAccess` allows only active volunteers; admins and reviewers cannot act as volunteers.
- `requireVolunteerCapability` checks an explicit `true` for `canCheckIn` or `canFoodCheckIn` on each request.
- `requireVolunteerEventAccess` checks the caller's own assignment and an active event. Schedule times are reference only. Removing an assignment takes effect on the next request.

Each protected request resolves the current stored role and active status. Acting identity always comes from the returned `admin._id`, including `applicationReviews.reviewedBy`, `applicationReviewLogs.adminId`, and `participants.acceptedBy`; public operations never accept an acting admin ID or role. Applicant authentication cannot satisfy these guards.

Application decisions require a submitted application, even if a draft already has a review row. Both the submission flag and legacy submission timestamp are supported. Draft rejection leaves the application, review, audit logs, and participants unchanged.

The SPA obtains the token from `/api/admin/session-token`, which reads an HttpOnly cookie set by `/api/admin/sign-in`. Sign-in clears any prior sessions for that admin. These functions use the existing `standing-manatee-425` deployment configured in `.env.example`.

Sign-in permits five failed attempts per normalized email within 15 minutes, across all callers. This account-wide counter prevents direct Convex callers from bypassing throttling by changing or omitting `clientIp`. The existing IP/email counter remains enforced, including previously recorded failures. Successful sign-in clears the account counter and the current IP/email counter; failures outside the window no longer count.

## Volunteer accounts and authorization audit (#59)

Volunteers use this same staff login and cookie transport. Applicant Convex Auth never grants staff access. `getCurrentStaff` returns identity, expiry, and normalized capabilities; it never returns credentials, participant data, or point totals. The SPA sends volunteer sessions to `/volunteer`, blocks review routes, and returns to login on revocation or expiry, including idle and resumed tabs.

All functions in `volunteerAccounts.ts` require a current administrator session. `createVolunteer` always creates a distinct staff account with role `volunteer` and both capabilities false. It rejects normalized staff-email collisions (including inactive accounts), duplicate participant links, missing/ineligible participants, and extra role/capability arguments. Generic organizer provisioning rejects volunteer targets; use the audited volunteer workflow instead.

`resetVolunteerPassword` accepts a replacement password that meets existing requirements and invalidates all old sessions. No password retrieval API exists. `revokeVolunteer` deactivates the account and deletes its sessions; `restoreVolunteer` reactivates it and clears any stale sessions again. Account/history rows and assignments remain intact. Capability changes preserve the login but permissions are checked again on each request. Assignment grants query the compound index before insertion to prevent duplicates. Each configuration mutation writes an audit record in the same transaction, without credentials or arbitrary text details.

| Entry point | Required access |
| --- | --- |
| Application list/detail, review activity and decisions | Reviewer or admin |
| Application history and sample application creation | Admin |
| Decision email queue reads | Reviewer or admin |
| Decision email hold, retry, release (via the guarded internal claim mutation) | Admin |
| Generic organizer provisioning | Admin; volunteer targets rejected |
| Volunteer listing, creation, reset, revoke, restore, capabilities and assignments | Admin |
| Session profile/sign-out | The caller's staff session only |
| Participant creation | Internal only; accepting staff must be active reviewer/admin |
| Point ledger and participant eligibility helpers | Ordinary server helpers, not public Convex APIs |
| Own scan options and QR scan preview | Volunteer, plus the purpose's capability or event assignment |
| Check-in, food redemption, event point award (`volunteerOperations.ts`) | Volunteer, plus the capability or event assignment, re-checked on every call |

No public participant roster, point-total, or configuration-audit listing API is added here. Scanner endpoints must independently call the relevant volunteer guard **inside their query/mutation** before using participant or ledger helpers. In particular, `awardEventPoints` is a ledger helper, not an authorization boundary: its caller must use `requireVolunteerEventAccess` and derive the actor and timestamp on the server. Scanner and management screens are separate work from this authentication foundation.

Deployment: sync these admin-owned modules and `shared/admin` helpers into `hackuta-2026-profile` using its `npm run admin-schema-lock:refresh`, verify its schema includes #58, and run backend checks there. Backend uploads must run from profile to preserve `convex/profile`. Do not upload from this repository or refresh register-owned files for this change.

`getApplication` uses `requireReviewerAccess` before reading applicant data. It returns `null` for malformed, missing, or unsubmitted applications, and returns resume availability separately from the application. A missing review record remains missing; reading detail never creates review rows, audit events, or participants. No historical reviewer logs are returned.

After detail loads, the page calls `logApplicationReviewAction` with `action: "viewed"`. The mutation requires a submitted application and appends an event with the session-derived admin ID and server timestamp. Repeated visits remain separate events; viewing never claims the application or changes review state.

## Volunteer QR scan preview (#60)

`listMyScanOptions` returns the caller's own `canCheckIn` / `canFoodCheckIn` and their assigned active events (name, points, schedule). `resolveQrForScan` previews one scanned QR code for `check_in`, `food_check_in`, or `point_scan` and returns a typed status instead of throwing, so its rate-limit rows persist. It changes no participant, award, or log rows; the later state-changing scan mutations must re-check everything. Dietary info appears only in food previews; point totals, emails, applications, and tokens never appear. Order of checks, response fields, and the rate-limit thresholds and cleanup are in [VOLUNTEER_AUTHORIZATION.md](VOLUNTEER_AUTHORIZATION.md#qr-scan-preview-volunteerscants).

## Schema notes

- `applicationReviews` — register-origin table editable in [schema.ts](../schema.ts); holds the current or final review state per application. `reviewedBy` (an `admins` id) is always set from the session, never from client args. `started_review` claims the review via [reviewClaim.ts](reviewClaim.ts): active claims block silent takeover, stale claims reset `startedAt`, and final decisions cannot restart review. `viewed` is log-only; decisions set `completedAt`. Decision patches live in [reviewState.ts](reviewState.ts).
- `admins` — admin-only table.
- `applicationReviewLogs` — append-only activity history; full history is restricted to admins.
- `participants` — admin-only table; one row per accepted application (reuses `users`). Copies `foodRestriction` from the linked application when the row is created; other profile fields stay on `applications`.

Registration reads/writes for applicants remain in register-locked modules ([applications.ts](../applications.ts), [registrations.ts](../registrations.ts), etc.).

## Waitlist decisions

Waitlisted applicants can be accepted through the same confirmed decision mutation. This appends an acceptance event, creates the participant atomically, and schedules an acceptance email. The earlier waitlist event remains in history. Accepted, rejected, and withdrawn decisions cannot be changed through this workflow; repeated confirmation of the same recorded decision is idempotent.

## Related

| Location | Role |
| --- | --- |
| [pages/admin/README.md](../../src/pages/admin/README.md) | UI routes that will call these functions |
| [REGISTER_SCHEMA.md](../REGISTER_SCHEMA.md) | Lock policy |

Parent index: [../README.md](../README.md).
