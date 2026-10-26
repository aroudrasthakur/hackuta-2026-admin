# Meal system audit — issue #83

Reviewed the meal redemption commits `e1dab2d`, `c3baf13`, and `c24f6b8`, including
their interaction with the existing meal management APIs and scanner workflows.

## Findings fixed

### Medium: availability updates could hide a confirmed collection result

If a volunteer confirmed distribution and the meal ended or was disabled before
the response arrived, the scanner unmounted the request. A successful collection
could be recorded without its success result reaching the volunteer.

The scanner now retains the confirmed meal and request until the volunteer
acknowledges the result or cancels a retry. Availability changes still clear
unsubmitted previews. New scans use current availability. The meal-ended message
also avoids implying that an earlier request could not have recorded a collection.
A regression test first reproduced the dropped response, then passed with the fix.

### Low: the meal picker could not keep the current selection

After opening Change meal, selecting the already checked radio did not trigger
`onChange`. There was no way to return to that meal without selecting another.
The picker now offers an explicit Keep meal action, with regression coverage.

## Authorization and data consistency review

- Every public meal scan handler verifies an active volunteer session. Food
  capability and current accepted status are rechecked in the redemption mutation.
- Preview responses restrict participant data to the name, per-meal collection
  state, and dietary information for authorized food scans. Redemption audit logs
  contain neither dietary information nor QR/session tokens.
- The indexed duplicate check, redemption insertion, and audit write share one
  transaction. Tests confirm one successful collection across concurrent volunteers.
- Compatibility food endpoints use the same checks and require a meal. Legacy
  `foodCheckedInAt` values are preserved and do not control meal eligibility.
- Serving windows use an inclusive start and exclusive end, checked against
  server time. Preview success does not bypass later schedule or permission edits.
- Expected scan failures are returned after writing throttle counters. Session
  failures occur before writes. Tests verify shared attempt and failure limits.
- Added race tests for concurrent meal removal and redemption, in both invocation
  orders. A collection cannot survive with a deleted meal, and meals with collection
  history cannot be removed.

No additional authorization bypass or duplicate-redemption defect was identified
in this local source and automated-test review.

## Dependency findings remaining

`npm audit --json` reports three packages at high severity. All three are marked
`dev: true` in the existing lockfile; the meal feature did not change dependencies.
`npm audit --omit=dev --json` reports zero vulnerabilities.

| Locked package | Version | Advisory |
| --- | --- | --- |
| `happy-dom` | `20.14.6` | [Host code execution through an unsanitized import alias](https://github.com/advisories/GHSA-834v-8h66-3h79) |
| `vite` | `8.3.2` | [Editor invocation vulnerability](https://github.com/advisories/GHSA-587h-7wmj-h5pm), plus other advisories in the npm report |
| `zod` | `4.6.5` | [Memory exhaustion while validating oversized constrained collections](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) |

These findings need a dependency maintenance update. In particular, npm's suggested
Happy DOM fix changes its major version, so it should be validated separately.
No dependency versions were changed during this audit.

The development classification is not proof that a package cannot run in the
backend. `convex/registrations.ts` imports `shared/registration/validation.ts`,
which imports `shared/registration/schema.ts`; that schema imports Zod at runtime.
The profile deployment's resolved Zod version therefore needs verification and a
patched runtime dependency declaration. The clean production-only npm report
does not establish that the deployed registration backend is unaffected. No
deployed version or exploitability of this registration path was verified here.

## Validation and limits

Validation includes the full Vitest coverage suite; TypeScript checks for the app
and Convex; lint; production build; register schema lock verification; and meal,
check-in, points, offline retry, and camera Playwright scenarios. The audit fixes
are covered by targeted regression tests as well as the full suite.

The full suite passes 1,817 tests with coverage above the repository's 90% gate.
All 14 meal redemption and existing scanner Playwright scenarios pass, including
camera permission, decoding, and cleanup checks.
Validation used the current workspace installation; dependency advisory results
describe the committed lockfile, whose versions can differ from installed tools.

Browser tests use the repository's mock backend. Mutation authorization and
transaction behavior are exercised with `convex-test`; no deployed environment
was smoke-tested or changed. Profile schema synchronization and deployment remain
separate release steps.
