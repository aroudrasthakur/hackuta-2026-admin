# Tests

Run all tests:

```bash
npm run test:unit       # tests only
npm run test:coverage   # tests + coverage check (what CI runs)
```

## Folders

| Folder | What it tests |
| --- | --- |
| [`integration/`](integration/) | Full review flow against the real Convex functions: who can do what, view logs, review claims, Accept / Reject / Waitlist, emails, duplicates, bad requests |
| [`unit/`](unit/) | Admin code: sign-in, pages, components, auth API |
| [`register/`](register/) | Register-owned code (see below) |
| [`helpers/`](helpers/) | Shared setup for admin tests |
| [`fixtures/`](fixtures/) | Sample registration form data used by `register/` tests |

## Test data

- Tests never use a real Convex deployment. Each test makes its own in-memory database with [`convex-test`](https://www.npmjs.com/package/convex-test).
- Each test adds only the rows it needs (see [`helpers/reviewTestKit.ts`](helpers/reviewTestKit.ts)), so tests can't affect each other or real applications.
- Emails are never sent. Tests replace `fetch` with a fake email service and check what would have been sent.

## Coverage

- CI fails if lines, statements, functions, or branches drop below **90%**.
- The settings are in [`vitest.config.ts`](../vitest.config.ts). Coverage counts `convex/`, `src/`, `shared/`, `server/`, and `api/`.
- Only type-only files and the browser entry point (`src/main.tsx`) are left out.
- The HTML report is written to `coverage/index.html`. In CI it is uploaded as the `coverage-report` artifact.

## Register tests

Files in [`register/`](register/) are copied from `hackuta-2026-register` at commit `57788f2`. That is the version that matches this repo's locked files (`scripts/register-schema-lock/manifest.json`).

- One change was needed: `convex.test.ts` uses this repo's `applicationReviews` fields (`completedAt`, `reviewedBy` as an admin).
- If you run `npm run register-schema-lock:refresh`, copy the matching register tests again so they stay in sync.

## Not tested yet

- Review heartbeat (Issue 10 is on hold).
