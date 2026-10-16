# Notable API and integration changes

## Organizer sign-in HTTP API (`POST /api/admin/sign-in`)

**Failure responses** now return a stable machine-readable code plus a catalog message:

```json
{ "code": "INVALID_CREDENTIALS", "error": "Incorrect email or password. Please try again." }
```

HTTP status follows the code (`401` / `403` / `429`). Clients should use **`code`** (not free-form `error` text) for branching.

**Breaking:** integrations that only parsed `{ "error": "…" }` without `code` should be updated. The E2E mock and Convex-backed path both use the same shape.

**Unchanged:** success `{ "ok": true, "expiresAt": … }` with `Set-Cookie`; generic `{ "error": "…" }` on HTTP 500 (no credentials in body).

## Convex organizer mutations

Review and auth mutations throw `ConvexError({ code, message })` via `adminError()`. The browser maps **`error.data.code`** to user-visible copy; do not rely on redacted Convex error strings in production.

See [shared/admin/README.md](../shared/admin/README.md) and [OPERATIONS.md](OPERATIONS.md).
