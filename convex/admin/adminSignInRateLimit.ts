import type { MutationCtx } from "../lib/dataModel";
import { normalizeEmail } from "../lib/normalizeEmail";

export const ADMIN_SIGN_IN_FAILURE_BUCKET = "admin_sign_in_failure";
export const ADMIN_SIGN_IN_MAX_FAILURES_PER_HOUR = 5;
export const ADMIN_SIGN_IN_WINDOW_MS = 60 * 60 * 1000;

export const ADMIN_SIGN_IN_RATE_LIMIT_MESSAGE =
  "Too many sign-in attempts. Please try again later.";

async function countRecentAdminSignInFailures(
  ctx: MutationCtx,
  normalizedEmail: string,
  windowStart: number,
) {
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
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return false;
  }
  const now = Date.now();
  const windowStart = now - ADMIN_SIGN_IN_WINDOW_MS;
  const recent = await countRecentAdminSignInFailures(ctx, normalized, windowStart);
  return recent.length >= ADMIN_SIGN_IN_MAX_FAILURES_PER_HOUR;
}

export async function recordAdminSignInFailure(ctx: MutationCtx, email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return;
  }

  const now = Date.now();
  await ctx.db.insert("rateLimits", {
    bucket: ADMIN_SIGN_IN_FAILURE_BUCKET,
    key: normalized,
    createdAt: now,
  });

  const cutoff = now - ADMIN_SIGN_IN_WINDOW_MS;
  const stale = await countRecentAdminSignInFailures(ctx, normalized, 0);
  for (const entry of stale) {
    if (entry.createdAt < cutoff) {
      await ctx.db.delete(entry._id);
    }
  }
}
