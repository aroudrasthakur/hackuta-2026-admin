import type { MutationCtx } from "../lib/dataModel";
import { normalizeEmail } from "../lib/normalizeEmail";

/** Durable sign-in throttling keyed by normalized email (shared across all Convex workers). */
export const ADMIN_SIGN_IN_FAILURE_BUCKET = "admin_sign_in_failure";

export const ADMIN_SIGN_IN_MAX_FAILURES = 5;
export const ADMIN_SIGN_IN_WINDOW_MS = 15 * 60 * 1000;

export const ADMIN_SIGN_IN_RATE_LIMIT_MESSAGE =
  "Too many failed sign-in attempts. Please try again later.";

async function recentFailureRows(ctx: MutationCtx, normalizedEmail: string) {
  const windowStart = Date.now() - ADMIN_SIGN_IN_WINDOW_MS;
  return ctx.db
    .query("rateLimits")
    .withIndex("by_bucket_createdAt", (q) => q.eq("bucket", ADMIN_SIGN_IN_FAILURE_BUCKET))
    .filter((q) =>
      q.and(
        q.eq(q.field("key"), normalizedEmail),
        q.gte(q.field("createdAt"), windowStart),
      ),
    )
    .collect();
}

export async function isAdminSignInRateLimited(ctx: MutationCtx, email: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return false;
  }
  const failures = await recentFailureRows(ctx, normalizedEmail);
  return failures.length >= ADMIN_SIGN_IN_MAX_FAILURES;
}

export async function recordFailedAdminSignIn(ctx: MutationCtx, email: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return;
  }
  await ctx.db.insert("rateLimits", {
    bucket: ADMIN_SIGN_IN_FAILURE_BUCKET,
    key: normalizedEmail,
    createdAt: Date.now(),
  });
}

export async function clearAdminSignInFailures(ctx: MutationCtx, email: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return;
  }
  const failures = await recentFailureRows(ctx, normalizedEmail);
  await Promise.all(failures.map((row) => ctx.db.delete(row._id)));
}
