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

## Review summary

No exploitable authentication or data-access issue was found in the reviewed
changes. The local development sign-in helper is limited to Vite development
mode and creates a normal authenticated Convex session. The dashboard query
requires an active staff session, is read-only, and does not expose historical
review logs. Production deployment configuration was not remotely exercised.
