# Security review

Review scope: organizer authentication, the local-development auth bypass,
Convex admin authorization, and the submitted-application dashboard.

## Finding 1: Shared-dev deployment target mismatch

- **Severity:** Medium
- **Confidence:** 9/10
- **Affected configuration:** `.env.example`
- **Status:** Fixed

The example environment targeted the personal development deployment
`harmless-lobster-530`, while the operations guide identified
`standing-manatee-425` as shared dev. The `convex:push-dev` script loads
`.env.example` directly, so following the documented procedure could deploy
backend changes to the wrong Convex deployment.

The example now points back to `standing-manatee-425`. Personal deployment
settings belong in `.env.local`, and the operations guide now explains the
separate local-development and shared-dev push workflows.

## Finding 2: Unauthenticated Admin Creation/Hijacking via Public Mutation

- **Severity:** High
- **Confidence:** 10/10
- **Affected file:** `convex/admin/auth.ts` (`createAndProvisionAdmin`)
- **Status:** Fixed

`createAndProvisionAdmin` was exported as a public Convex mutation without session
or role verification. Any unauthenticated caller could invoke it to create an admin
account or reset the password and credentials of existing admin accounts.

The mutation now requires a valid caller session (`requireAdminSession`), validates
that the caller has `role: "admin"`, and rejects unauthenticated or reviewer callers.
Unit tests verify both unauthorized rejection and authorized execution.

## Finding 3: Unauthenticated Sample Application Injection via Public Mutation

- **Severity:** Medium
- **Confidence:** 10/10
- **Affected file:** `convex/admin/applications.ts` (`createSampleApplication`)
- **Status:** Fixed

`createSampleApplication` was exported as a public Convex mutation without caller
authentication or session checks. Any unauthenticated caller could invoke it to inject
arbitrary user records, applications with submitted status, and arbitrary review decisions.

The mutation now requires a valid caller session (`requireAdminSession`) with `admin`
role, rejecting unauthenticated callers and reviewers. Unit tests verify unauthorized
rejection and authorized execution.

## Finding 4: Account Enumeration via Timing Side-Channel in Organizer Sign-In

- **Severity:** Low
- **Confidence:** 9/10
- **Affected file:** `convex/admin/auth.ts` (`signIn`)
- **Status:** Fixed

When `signIn` received a non-existent email address, it previously exited immediately
without performing password verification, whereas valid accounts triggered CPU-intensive
Scrypt verification (~100ms). This timing disparity allowed unauthenticated callers to
enumerate valid organizer email addresses.

`signIn` now performs a constant-time dummy Scrypt verification when an account is not
found or inactive before raising the invalid credentials error, eliminating the timing
disparity.

## Finding 5: Brute-Force Password Guessing & Sensitive Token Caching

- **Severity:** Medium
- **Confidence:** 9/10
- **Affected file:** `server/adminAuthHandlers.ts`
- **Status:** Fixed

Organizer sign-in requests lacked endpoint-level rate limiting, allowing brute-force
password guessing. Additionally, `/api/admin/session-token` and auth API responses lacked
strict `Cache-Control` headers, risking caching of bearer tokens by proxies.

The auth API handler now enforces IP + email rate limiting (locking out after 5 consecutive
failed attempts within 15 minutes with HTTP 429) and adds `Cache-Control: no-store, no-cache, must-revalidate, private`
to all auth API responses.

## Review summary

All identified public mutations and helper endpoints are now strictly authenticated and
role-gated. Side-channel timing discrepancies and brute-force vulnerabilities have been
mitigated, and sensitive organizer session tokens are protected against caching.
