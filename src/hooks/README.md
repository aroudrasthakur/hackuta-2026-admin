# Hooks

[`useAdminAuth.ts`](useAdminAuth.ts) — organizer session from `AdminAuthProvider`.

[`useScanWorkflow.ts`](useScanWorkflow.ts) — scan, preview, and confirmation for
check-in, per-meal food collection, and event points. QR tokens stay in a ref and
are cleared on reset, result, or unmount. Meals use their dedicated preview and
redemption mutations; retryable failures keep the selected meal and confirmation.

[`useMealClock.ts`](useMealClock.ts) — refresh availability at the next serving
boundary, with a periodic refresh to account for clock changes. No database write
is needed for a meal to start or end in the scanner.
