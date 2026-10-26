# Hooks

[`useAdminAuth.ts`](useAdminAuth.ts) — organizer session from `AdminAuthProvider`.

[`usePriceClock.ts`](usePriceClock.ts) — `nowBucket` for shop queries, so prices update when a sale starts or ends.

[`useShopWorkflow.ts`](useShopWorkflow.ts) — volunteer shop scan → choose → review → result. One idempotency key per purchase, reused on retry.
