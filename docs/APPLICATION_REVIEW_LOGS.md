# Application review logs

This guide is for contributors who need to create, read, or test application
review activity. The schema is in [`convex/schema.ts`](../convex/schema.ts);
public functions are in
[`convex/admin/applicationReviewLogs.ts`](../convex/admin/applicationReviewLogs.ts).

## What gets stored

Each call to `logApplicationReviewAction` appends one document to
`applicationReviewLogs` with:

| Field | Set by | Meaning |
| --- | --- | --- |
| `applicationId` | Caller | Existing application the event belongs to |
| `adminId` | Server | Active reviewer/admin resolved from the authenticated identity email |
| `action` | Caller | `viewed`, `started_review`, `review_ended`, `accepted`, `rejected`, or `waitlisted` |
| `createdAt` | Server | Event time in milliseconds since Unix epoch |

The mutation only inserts; there is no update/delete log API. It does not
replace the current decision in `applicationReviews`. Only an active account
whose role is `admin` can call `listApplicationReviewLogs`. Reviewers may append
events but cannot retrieve the full history.

Events are **not automatic**: the application page or decision handler must
call the mutation. Do not call it for dashboard listing or heartbeat/polling.
Call `viewed` only when the reviewer opens an individual application.

## Call from the admin UI

Use the generated API reference and Convex React hooks from an authenticated
admin/reviewer view (for example, a component under `src/pages/admin/`):

```tsx
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";

const logApplicationReviewAction = useMutation(
  api.admin.applicationReviewLogs.logApplicationReviewAction,
);

await logApplicationReviewAction({
  applicationId,
  action: "viewed",
});
```

Use the corresponding action after the actual review transition, for example
`started_review` when review begins and `accepted` when an acceptance decision
is made. Keep using the existing review-state mutation for `applicationReviews`;
the activity event does not replace that current state. Supply only
`applicationId` and `action`; never send `adminId` or `createdAt`. The backend
derives both from trusted server context.

## Test against a development deployment

Use a development deployment and test data only. Never use `--prod` for this
walkthrough. The CLI `--identity` flag simulates an identity; it is not a real
sign-in and must only be used with a development deployment.

1. Confirm the deployment contains the current schema and functions. From the
   repository root, select your authorized development deployment and deploy
   once:

   ```powershell
   $env:CONVEX_DEPLOYMENT = "dev:harmless-lobster-530"
   npx.cmd convex dev --once
   ```

   Check the CLI output confirms `harmless-lobster-530` before continuing.
   If it reports access denied or selects a different deployment, stop and
   resolve access/configuration first.

2. In the Convex dashboard for that same deployment, copy an existing
   `applications` document's `_id`. If there is no test application, create one
   through the registration app connected to the same dev deployment.

3. Confirm there is an `admins` document with the test email, `active: true`,
   and role `reviewer` or `admin`. The admins table in this deployment is
   identified by email, not `userId`.

4. In PowerShell, run the append mutation. Replace the sample application ID
   and email with the values from your test data. `--%` is important: it stops
   PowerShell from stripping the JSON quotes.

   ```powershell
   npx.cmd --% convex run --deployment harmless-lobster-530 --push --identity "{\"subject\":\"review-test\",\"issuer\":\"https://test.local\",\"email\":\"reviewer@example.com\"}" admin/applicationReviewLogs:logApplicationReviewAction "{\"applicationId\":\"YOUR_APPLICATION_ID\",\"action\":\"viewed\"}"
   ```

   To test all accepted actions, rerun the command using one action per call:
   `started_review`, `review_ended`, `accepted`, `rejected`, or `waitlisted`.
   Every successful call should return a new log document ID.

5. In the dashboard's **Data → applicationReviewLogs**, verify each call made
   a separate row. Confirm `adminId` refers to the matching `admins` document
   and `createdAt` was set by the server. The public mutation does not accept
   `adminId` or `createdAt` as arguments.

6. Test history access using `listApplicationReviewLogs`. An active reviewer
   identity should be rejected:

   ```powershell
   npx.cmd --% convex run --deployment harmless-lobster-530 --identity "{\"subject\":\"review-test\",\"issuer\":\"https://test.local\",\"email\":\"reviewer@example.com\"}" admin/applicationReviewLogs:listApplicationReviewLogs "{\"applicationId\":\"YOUR_APPLICATION_ID\"}"
   ```

   Repeat with an active `admin` account's email. It should return the
   application's events, newest first.

7. Run the append mutation without `--identity`; it should fail as
   unauthenticated and write no row.

## Troubleshooting

| Error | Check |
| --- | --- |
| JSON/JSON5 parse error | Use the exact `npx.cmd --%` PowerShell form above; keep JSON escaped with `\"`. |
| Not authenticated | Identity must include an email; the no-identity negative test is expected to fail. |
| Not authorized | That email must match an `admins` row with `active: true`. |
| Invalid application ID / not found | Confirm the ID is an `_id` in `applications` on the selected deployment. |
| Cannot access deployment | Ask the deployment owner for access; do not switch to production. |
| Function not found | Push the current functions to the same dev deployment, then retry. |

## Deployment and schema ownership

The admin repo deploys the shared Convex backend. Run
`npm run verify:register-schema-lock` and `npm run convex:push-dev` only when
the configured dev deployment is the intended target. See
[`convex/REGISTER_SCHEMA.md`](../convex/REGISTER_SCHEMA.md) and
[`docs/OPERATIONS.md`](OPERATIONS.md).
