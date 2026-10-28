# Register schema lock

[`hackuta-2026-register`](../../hackuta-2026-register) **does not push** to Convex. This repo deploys `standing-manatee-425` and production.

Every path listed in **Register-owned (immutable)** below is frozen at the byte level. CI fails if you edit them without running `npm run register-schema-lock:refresh`. Do not refresh while the register app is in production unless that repo has shipped a backend change. Backend uploads run from hackuta-2026-profile, not from this repo.

**Canonical register reference:** [`../../hackuta-2026-register/convex/schema.ts`](../../hackuta-2026-register/convex/schema.ts)

**Frozen snapshots in this repo:**

| Artifact | Purpose |
| --- | --- |
| [`../scripts/register-schema-lock/manifest.json`](../scripts/register-schema-lock/manifest.json) | SHA-256 hash per locked code file (67 `.ts` / `.csv` paths) |
| [`../scripts/register-schema-lock/schema.reference.ts`](../scripts/register-schema-lock/schema.reference.ts) | Copy of register `convex/schema.ts` for schema-body checks |

---

## Admin-owned (editable)

These paths are **not** in the lock manifest. You may add or change them freely.

| Path | Purpose |
| --- | --- |
| [`schema.ts`](schema.ts) | See [Schema tables](#schema-tables) — admin-owned review and participant tables |
| [`admin/`](admin/) | Organizer Convex queries, mutations, actions |
| [`../src/`](../src/) | Admin dashboard UI |
| [`../scripts/`](../scripts/) | Admin tooling (except frozen register snapshots under `register-schema-lock/`) |
| [`../shared/admin/`](../shared/admin/) | **Future admin-only shared code** — not register-owned |
| [`README.md`](README.md), [`REGISTER_SCHEMA.md`](REGISTER_SCHEMA.md) | Documentation |
| Any `**/README.md` under `convex/` or `shared/` | Directory docs (admin-maintained; not hash-locked) |
| `convex/_generated/` | Local Convex codegen (gitignored) |

---

## Schema tables

File: [`convex/schema.ts`](schema.ts)

| Table / spread | Owner | Editable in admin? |
| --- | --- | --- |
| `...authTables` | Register | **No** — must match register reference |
| `users` | Register | **No** |
| `eventConfig` | Register | **No** |
| `applications` | Register | **No** |
| `applicationReviews` | Admin | **Yes** — only register-origin table you may change |
| `applicationSubmissionLogs` | Register | **No** |
| `rateLimits` | Register | **No** |
| `resumeUploadSessions` | Register | **No** |
| `emailDeliveries` | Register | **No** |
| `emailDeliveryRecordingFailures` | Register | **No** |
| `admins` | Admin | **Yes** — does not exist in register repo |
| `applicationReviewLogs` | Admin | **Yes** — append-only reviewer/admin activity history |
| `participants` | Admin | **Yes** — one row per accepted application (check-in identity; see [participants columns](#participants-columns)) |
| `retiredBadgeTokens` | Admin | **Yes** — hashes of replaced badges, so they never work again (see [Badges](#badges)) |
| `mealPeriods` | Admin | **Yes** — custom meal names, serving windows, availability, and creator |
| `mealRedemptions` | Admin | **Yes** — authoritative per-participant per-meal collection history |
| `adminAuthAccounts` | Admin | **Yes** — organizer password hashes (separate from applicant auth) |
| `adminSessions` | Admin | **Yes** — organizer session token hashes |
| `decisionEmailQueue` | Admin | **Yes** — queued accept, reject, and waitlist emails |
| `events` | Admin | **Yes** — point-bearing activities (fixed `pointsAwarded`; `startsAt`/`endsAt` are reference only and do not gate scanning) |
| `volunteerEventAccess` | Admin | **Yes** — which events a volunteer may award |
| `participantEventAwards` | Admin | **Yes** — authoritative per-participant per-event award |
| `volunteerActionLogs` | Admin | **Yes** — scan and admin point-adjustment audit (no QR or dietary data) |
| `staffConfigLogs` | Admin | **Yes** — volunteer/event/access configuration audit |
| `shopItems` | Admin | **Yes** — shop catalog and the one authoritative stock count |
| `shopRedemptions` | Admin | **Yes** — completed purchases with the price charged and any refund |
| `shopInventoryAdjustments` | Admin | **Yes** — audit row for every stock change |
| `shopFlashSales`, `shopFlashSaleItems` | Admin | **Yes** — timed promotions and their item prices |
| `participantNotifications` | Admin | **Yes** — participant portal notifications, including flash-sale alerts (drafts, scheduled, published, cancelled) |

All register-owned blocks must remain identical to [`schema.reference.ts`](../scripts/register-schema-lock/schema.reference.ts) aside from `applicationReviews` and admin-owned tables listed above.

### `participants` columns

| Column | Type | Notes |
| --- | --- | --- |
| `applicationId` | `Id<"applications">` | One participant row per accepted application |
| `authUserId` | `Id<"users">` | Applicant Convex Auth user (reused from registration) |
| `acceptedAt` | `number` | Acceptance timestamp (ms) |
| `acceptedBy` | `Id<"admins">` | Staff admin who confirmed acceptance |
| `qrCodeToken` | `string` | The one active scan identity (`by_qr_token`). The registration token (256-bit hex) until check-in, then the assigned badge value |
| `registrationQrCodeToken` | `string` (optional) | Original registration token, kept after badge assignment so a rescan can be explained (`by_registration_qr_token`). Never accepted for food, points, or the shop |
| `badgeQrCodeToken` | `string` (optional) | Preprinted badge value exactly as scanned (trimmed). Equal to `qrCodeToken` whenever set (`by_badge_qr_token`) |
| `badgeAssignedAt` | `number` (optional) | When the current badge was assigned |
| `badgeAssignedBy` | `Id<"admins">` (optional) | Volunteer (door check-in) or admin (replacement) who assigned the current badge |
| `foodRestriction` | `string` (optional) | Snapshot from the linked application’s `dietaryRestrictions`, `otherDietaryRestrictions`, and `allergyDetails` at participant creation |
| `checkedInAt` | `number` (optional) | General hackathon door check-in. New check-ins set it together with the badge fields in one mutation |
| `foodCheckedInAt` | `number` (optional) | Legacy single-use food check-in; preserve historical values when switching to meal redemptions |
| `points` | `number` (optional, then required) | Cached point balance; new accepts start at `0` |
| `createdAt` | `number` | Row creation time |
| `updatedAt` | `number` | Last update time |

### Badges

Badge QR codes are preprinted and supplied externally; the backend never generates them. `admin/badgeCheckIn:checkInWithBadge` assigns one at the door, and `admin/badgeAdmin:assignParticipantBadge` lets an admin replace one (or assign one to a participant checked in before badges). Both run in one mutation that rechecks every rule, moves the registration token into `registrationQrCodeToken` (first assignment only), and sets `qrCodeToken`, `badgeQrCodeToken`, `badgeAssignedAt`, and `badgeAssignedBy`. A badge must not match any participant's `qrCodeToken`, `badgeQrCodeToken`, or `registrationQrCodeToken`, or a retired badge. Convex indexes do not enforce uniqueness; the reads and the write share one serializable transaction, so concurrent assignments of one badge leave exactly one holder.

`retiredBadgeTokens` (admin-owned) records replaced badges so they can never be reused or scanned again: `tokenHash` (SHA-256 hex of the badge value, never the raw value), `participantId`, `retiredBy` (`Id<"admins">`), and `retiredAt`, indexed `by_token_hash`. Points, awards, meal redemptions, and purchases reference `participantId`, so a replacement keeps all history.

Existing participants are not migrated. Rows checked in before badges keep their registration token as `qrCodeToken` with no badge fields; scans return `badge_not_assigned` until an admin assigns one.

`points` stays optional until `admin/pointsBackfill:backfillParticipantPoints` is deployed from hackuta-2026-profile and run until `isDone`. A later schema change can make `points` required only after that backfill finishes. Deploying `points` as required while any participant row omits it fails the Convex push.

### Meal periods and redemptions

`mealPeriods` stores `name`, optional `description`, `startsAt`, `endsAt`, `active`, `createdBy` (`Id<"admins">`), `createdAt`, and `updatedAt`. All timestamps are Unix milliseconds. `by_active_startsAt` indexes availability and serving-window start; `by_startsAt` supports schedule ordering across dates. Upcoming, Active, Ended, and Disabled are derived from the current time, serving window, and `active` flag rather than stored statuses.

`mealRedemptions` stores `participantId` (`Id<"participants">`), `mealPeriodId` (`Id<"mealPeriods">`), `scannedBy` (`Id<"admins">`), and `redeemedAt`. `by_participant_meal` supports duplicate checks. `by_meal` indexes `[mealPeriodId, redeemedAt]`, and `by_participant` indexes `[participantId, redeemedAt]`, allowing chronological history queries for either entity.

`mealPeriods.servedCount` is an optional cached total, initialized to zero for new
meals and incremented atomically on successful redemption. Optional
`servedCountBackfillCursor` and `mealRedemptions.countedInServedCount` support a
bounded, resumable backfill for existing history without double counting live
collections. An absent count or a present cursor means the total is incomplete;
the admin query returns `served: null` until the backfill finishes. Run
`admin/mealCountsBackfill:backfillMealServedCount` for each existing meal until
`isDone` after deploying the synchronized backend from profile. These fields stay
optional so the schema accepts existing meals and historical redemption rows.

Meal management in `admin/meals.ts` enforces schedule validation, overlap prevention, and removal protection. Food scanning in `admin/volunteerScan.ts` uses meal redemptions and preserves legacy timestamps. The meal system enforces these rules:

- Require `startsAt < endsAt` and reject overlapping active serving windows.
- Allow deletion only for unused meals; deactivate meals with redemption history.
- Check `by_participant_meal` and insert in one mutation to enforce one redemption per participant per meal. Convex indexes do not enforce uniqueness.
- Use meal redemptions for eligibility, preserving legacy `participants.foodCheckedInAt` values and original redemption timestamps.

`staffConfigLogs.targetMealPeriodId` optionally identifies meal configuration changes (`meal_created`, `meal_updated`, `meal_active_changed`, `meal_removed`). Existing audit rows remain valid. Removal logs retain the meal name and serving window in `details` after the unused meal is deleted.

`volunteerActionLogs.mealPeriodId` optionally identifies the meal for new `food_check_in` entries. The redemption and its audit entry are inserted atomically; legacy log rows without a meal ID remain valid.

The new tables are empty on first deployment; no legacy timestamp can be assigned to a particular meal automatically. Synchronize the admin schema into `hackuta-2026-profile` using its `admin-schema-lock:refresh` workflow before deploying from profile. Do not refresh the register schema lock for these admin-owned additions.

### `admins` volunteer columns

| Column | Type | Notes |
| --- | --- | --- |
| `role` | `"reviewer" \| "admin" \| "volunteer"` | Existing staff rows stay valid |
| `participantId` | `Id<"participants">` (optional) | Set when a participant is promoted to volunteer |
| `canCheckIn` | `boolean` (optional) | Missing means denied; must be `true` to scan door check-in |
| `canFoodCheckIn` | `boolean` (optional) | Missing means denied; must be `true` to scan food |

Event-specific point permissions live in `volunteerEventAccess`, not on `admins`.

---

## Register-owned (immutable) — `convex/`

Do **not** edit. Source of truth: matching path under `hackuta-2026-register/convex/`.

### Root modules

| File | Role |
| --- | --- |
| [`applicant.ts`](applicant.ts) | Post-sign-in application bootstrap and routing queries |
| [`applicationFields.ts`](applicationFields.ts) | Convex validators derived from `shared/registration/applicantFields.ts` |
| [`applications.ts`](applications.ts) | Draft load/save and applicant dashboard |
| [`auth.config.ts`](auth.config.ts) | Convex Auth provider configuration |
| [`auth.ts`](auth.ts) | Password sign-up, OTP verification, password-reset OTP |
| [`crons.ts`](crons.ts) | Scheduled jobs (resume session cleanup) |
| [`emailDeliveries.ts`](emailDeliveries.ts) | Internal email delivery tracking mutations/queries |
| [`eventConfig.ts`](eventConfig.ts) | Hackathon timeline and registration window (server) |
| [`http.ts`](http.ts) | HTTP router — auth routes and `POST /resume-upload` |
| [`maintenance.ts`](maintenance.ts) | Internal `resetAllData` (destructive) |
| [`migrations.ts`](migrations.ts) | One-time data migrations |
| [`passwordReset.ts`](passwordReset.ts) | Session invalidation after password reset |
| [`rateLimits.ts`](rateLimits.ts) | OTP cooldown queries and internal rate-limit mutations |
| [`registrations.ts`](registrations.ts) | Application submit and initial review row creation |
| [`resumeUploadSecurity.ts`](resumeUploadSecurity.ts) | Resume upload origin allowlist |
| [`resumeUploads.ts`](resumeUploads.ts) | Upload sessions, rate limits, discard, cleanup |

### `convex/email/`

| File | Role |
| --- | --- |
| [`email/checkEmailStatus.ts`](email/checkEmailStatus.ts) | Email service status check action |
| [`email/emailService.ts`](email/emailService.ts) | HackUTA email service HTTP client |
| [`email/sendApplicationConfirmationEmail.ts`](email/sendApplicationConfirmationEmail.ts) | Post-submit confirmation email action |
| [`email/sendOtpEmail.ts`](email/sendOtpEmail.ts) | Sign-up OTP email action |
| [`email/sendPasswordResetEmail.ts`](email/sendPasswordResetEmail.ts) | Password-reset OTP email action |
| [`email/templates.ts`](email/templates.ts) | Email HTML/text templates |

### `convex/lib/`

| File | Role |
| --- | --- |
| [`lib/applications.ts`](lib/applications.ts) | Application row helpers |
| [`lib/assertPasswordNotReused.ts`](lib/assertPasswordNotReused.ts) | Password reuse guard |
| [`lib/auth.ts`](lib/auth.ts) | Auth session helpers |
| [`lib/authSignInRateLimit.ts`](lib/authSignInRateLimit.ts) | Sign-in rate limiting |
| [`lib/dataModel.ts`](lib/dataModel.ts) | Typed ID helpers |
| [`lib/draftPatch.ts`](lib/draftPatch.ts) | Draft patch application |
| [`lib/draftResume.ts`](lib/draftResume.ts) | Draft resume metadata |
| [`lib/emailDeliveries.ts`](lib/emailDeliveries.ts) | Email delivery kind validator |
| [`lib/eventConfig.ts`](lib/eventConfig.ts) | Timeline merge helpers |
| [`lib/hackutaPassword.ts`](lib/hackutaPassword.ts) | HackUTA password + OTP providers |
| [`lib/invalidateAuthSessions.ts`](lib/invalidateAuthSessions.ts) | Bulk session invalidation |
| [`lib/normalizeEmail.ts`](lib/normalizeEmail.ts) | Re-export of shared email normalization |
| [`lib/otpSendStatus.ts`](lib/otpSendStatus.ts) | OTP send status helpers |
| [`lib/rateLimitBuckets.ts`](lib/rateLimitBuckets.ts) | Rate-limit bucket constants |
| [`lib/resumeUpload.ts`](lib/resumeUpload.ts) | Resume upload validation |
| [`lib/sha256Hex.ts`](lib/sha256Hex.ts) | SHA-256 hex digest helper |

---

## Register-owned (immutable) — `shared/`

Do **not** edit. Source of truth: matching path under `hackuta-2026-register/shared/`.

Used by registration Convex functions and (in register repo) the registration UI. Copied here so deploy bundles stay self-contained.

### `shared/` root

| File | Role |
| --- | --- |
| [`../shared/README.md`](../shared/README.md) | Shared module index (register copy) |

### `shared/auth/`

| File | Role |
| --- | --- |
| [`../shared/auth/errorMessages.ts`](../shared/auth/errorMessages.ts) | Auth error copy |
| [`../shared/auth/otpRateLimit.ts`](../shared/auth/otpRateLimit.ts) | OTP rate-limit helpers |
| [`../shared/auth/password.ts`](../shared/auth/password.ts) | Password validation rules |
| [`../shared/auth/passwordResetMessages.ts`](../shared/auth/passwordResetMessages.ts) | Password-reset UI messages |

### `shared/hackathon/`

| File | Role |
| --- | --- |
| [`../shared/hackathon/eventDefaults.ts`](../shared/hackathon/eventDefaults.ts) | Default event display name |
| [`../shared/hackathon/schedule.ts`](../shared/hackathon/schedule.ts) | Canonical schedule constants |
| [`../shared/hackathon/timeline.ts`](../shared/hackathon/timeline.ts) | Timeline builder helpers |

### `shared/lib/`

| File | Role |
| --- | --- |
| [`../shared/lib/normalizeEmail.ts`](../shared/lib/normalizeEmail.ts) | Email normalization |
| [`../shared/lib/sanitizeInput.ts`](../shared/lib/sanitizeInput.ts) | Input sanitization |

### `shared/registration/`

| File | Role |
| --- | --- |
| [`../shared/registration/allergyMigration.ts`](../shared/registration/allergyMigration.ts) | Legacy allergy field migration |
| [`../shared/registration/applicantFields.ts`](../shared/registration/applicantFields.ts) | Applicant field registry (names, draft kinds) |
| [`../shared/registration/consentTimestamps.ts`](../shared/registration/consentTimestamps.ts) | MLH / sponsor / waiver timestamp helpers |
| [`../shared/registration/constants.ts`](../shared/registration/constants.ts) | MLH enums, field limits, question labels |
| [`../shared/registration/countries.ts`](../shared/registration/countries.ts) | Country list (generated) |
| [`../shared/registration/data/schools.csv`](../shared/registration/data/schools.csv) | MLH schools source CSV |
| [`../shared/registration/dietaryMigration.ts`](../shared/registration/dietaryMigration.ts) | Legacy dietary field migration |
| [`../shared/registration/draftLimits.ts`](../shared/registration/draftLimits.ts) | Draft field length limits |
| [`../shared/registration/draftMapping.ts`](../shared/registration/draftMapping.ts) | DB row ↔ form mapping |
| [`../shared/registration/draftPatch.ts`](../shared/registration/draftPatch.ts) | Draft patch shape |
| [`../shared/registration/emergencyContact.ts`](../shared/registration/emergencyContact.ts) | Emergency contact validation |
| [`../shared/registration/mlhSchools.ts`](../shared/registration/mlhSchools.ts) | MLH school list (generated) |
| [`../shared/registration/mlhTexasSchools.ts`](../shared/registration/mlhTexasSchools.ts) | Texas schools ordering |
| [`../shared/registration/otherOptionMigration.ts`](../shared/registration/otherOptionMigration.ts) | “Other” option migration |
| [`../shared/registration/residence.ts`](../shared/registration/residence.ts) | Country/state of residence helpers |
| [`../shared/registration/resume.ts`](../shared/registration/resume.ts) | Client resume validation and limits |
| [`../shared/registration/schema.ts`](../shared/registration/schema.ts) | Zod schema for application payload |
| [`../shared/registration/submitErrors.ts`](../shared/registration/submitErrors.ts) | User-facing submit/upload errors |
| [`../shared/registration/types.ts`](../shared/registration/types.ts) | Form state types |
| [`../shared/registration/validation.ts`](../shared/registration/validation.ts) | `validateRegistrationPayload()` |

---

## Adding files under `shared/` in the future

| Scenario | Where it goes | Lock behavior |
| --- | --- | --- |
| Registration feature (bugfix, new applicant field, etc.) | `hackuta-2026-register/shared/…` first | Run `npm run register-schema-lock:refresh` — file is copied into admin and added to `manifest.json` as **register-owned immutable** |
| Admin-only helper (organizer UI, review tooling) | **`shared/admin/…`** in this repo | **Not locked** — never edit register paths; keep admin code separate |
| Accidental new file under `shared/auth/`, `shared/registration/`, etc. | — | `verify:register-schema-lock` **fails** until you refresh from register or move the file to `shared/admin/` |

**Rule:** If it ships registration behavior, it belongs in register and enters the lock via refresh. If it is organizer-only, use `shared/admin/` (or `convex/admin/`).

---

## Updating the frozen copy from register

When register source changes (only after hackuta-2026-register ships a backend change — do not refresh while that production app is frozen):

```bash
# hackuta-2026-admin, sibling register repo at ../hackuta-2026-register
npm run register-schema-lock:refresh
npm run verify:register-schema-lock
git add scripts/register-schema-lock/ convex/ shared/
git commit -m "chore: refresh register schema lock from register"
```

Refresh copies changed register files into admin, rewrites `manifest.json` and `schema.reference.ts`, and updates `registerSchemaLockedHash`.

**Never** hand-edit register-owned paths to “sync” — that bypasses the hash check and breaks the contract with register.

---

## Verification commands

| Command | When |
| --- | --- |
| `npm run verify:register-schema-lock` | Local dev, CI — hash + schema-body check |
| `npm run convex:push-dev` | Refuses. Push from hackuta-2026-profile, which runs this verify first |
| `npm run register-schema-lock:refresh` | Only after register ships a backend change |

If verification fails with `Locked file changed: …`, you edited a register-owned file.

If verification fails with `Untracked shared file not in lock manifest: …`, add the file via register + refresh, or move it to `shared/admin/`.
