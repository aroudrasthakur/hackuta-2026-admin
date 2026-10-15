# shared/admin

Admin-only shared code (not register-locked).

| Path | Role |
| --- | --- |
| [`errors.ts`](errors.ts) | Error codes and the messages organizers see |
| [`e2e/`](e2e/) | Mock store and credentials for E2E tests |

## Errors

- Backend: `throw adminError("REVIEW_CLAIMED")`. It throws a `ConvexError` with a `code`, so the code still reaches the browser in production.
- Frontend: `userFacingErrorMessage(error, fallback)` shows the message for the code. Anything else shows the fallback.
- The original error is logged with `console.error`. In production, Convex shows the browser only a request ID; search the Convex dashboard logs for it.
- Internal checks that organizers should never hit can keep using `throw new Error(...)`.
