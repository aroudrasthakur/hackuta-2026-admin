import { describe, expect, it } from "vitest";
import {
  ADMIN_SIGN_IN_FAILURE_BUCKET,
  ADMIN_SIGN_IN_MAX_FAILURES,
  ADMIN_SIGN_IN_WINDOW_MS,
  buildAdminSignInRateLimitKey,
  isAdminSignInRateLimited,
} from "../../convex/admin/adminSignInRateLimit";
import { createConvexTest } from "../helpers/convexTestContext";
import {
  mutateOrganizerSignIn,
  ORGANIZER_TEST_PASSWORD,
  seedAdminAccount,
} from "../helpers/staffTestFixtures";

describe("admin sign-in rate limit key", () => {
  it("normalizes email and includes client IP", () => {
    expect(buildAdminSignInRateLimitKey(" 203.0.113.1 ", " Admin@Hackuta.org ")).toBe(
      "203.0.113.1:admin@hackuta.org",
    );
  });

  it("uses unknown IP when client IP is omitted", () => {
    expect(buildAdminSignInRateLimitKey(undefined, "a@hackuta.org")).toBe(
      "unknown:a@hackuta.org",
    );
  });
});

describe("admin sign-in lockout window", () => {
  it("locks after N failures within the window", async () => {
    const t = createConvexTest();
    const key = buildAdminSignInRateLimitKey("10.0.0.1", "lock@hackuta.org")!;
    const now = Date.now();
    await t.run(async (ctx) => {
      for (let i = 0; i < ADMIN_SIGN_IN_MAX_FAILURES; i += 1) {
        await ctx.db.insert("rateLimits", {
          bucket: ADMIN_SIGN_IN_FAILURE_BUCKET,
          key,
          createdAt: now - i * 1000,
        });
      }
    });
    expect(await t.run((ctx) => isAdminSignInRateLimited(ctx, key))).toBe(true);
  });

  it("unlocks after failures fall outside the configured window", async () => {
    const t = createConvexTest();
    const key = buildAdminSignInRateLimitKey("10.0.0.2", "unlock@hackuta.org")!;
    const stale = Date.now() - ADMIN_SIGN_IN_WINDOW_MS - 60_000;
    await t.run(async (ctx) => {
      for (let i = 0; i < ADMIN_SIGN_IN_MAX_FAILURES; i += 1) {
        await ctx.db.insert("rateLimits", {
          bucket: ADMIN_SIGN_IN_FAILURE_BUCKET,
          key,
          createdAt: stale - i * 1000,
        });
      }
    });
    expect(await t.run((ctx) => isAdminSignInRateLimited(ctx, key))).toBe(false);
  });

  it("allows sign-in once stale failures no longer count", async () => {
    const t = createConvexTest();
    await seedAdminAccount(t, { email: "unlock@hackuta.org", role: "admin", active: true });
    const key = buildAdminSignInRateLimitKey("203.0.113.99", "unlock@hackuta.org")!;
    const stale = Date.now() - ADMIN_SIGN_IN_WINDOW_MS - 60_000;
    await t.run(async (ctx) => {
      for (let i = 0; i < ADMIN_SIGN_IN_MAX_FAILURES; i += 1) {
        await ctx.db.insert("rateLimits", {
          bucket: ADMIN_SIGN_IN_FAILURE_BUCKET,
          key,
          createdAt: stale - i * 1000,
        });
      }
    });

    const result = await mutateOrganizerSignIn(t, {
      email: "unlock@hackuta.org",
      password: ORGANIZER_TEST_PASSWORD,
      clientIp: "203.0.113.99",
    });
    expect(result.ok).toBe(true);
  });

  it("clears failures after a successful sign-in", async () => {
    const t = createConvexTest();
    await seedAdminAccount(t, { email: "clear@hackuta.org", role: "admin", active: true });
    const clientIp = "203.0.113.44";
    const key = buildAdminSignInRateLimitKey(clientIp, "clear@hackuta.org")!;

    for (let i = 0; i < ADMIN_SIGN_IN_MAX_FAILURES - 1; i += 1) {
      const wrong = await mutateOrganizerSignIn(t, {
        email: "clear@hackuta.org",
        password: "WrongPassword1!",
        clientIp,
      });
      expect(wrong.ok).toBe(false);
    }

    const success = await mutateOrganizerSignIn(t, {
      email: "clear@hackuta.org",
      password: ORGANIZER_TEST_PASSWORD,
      clientIp,
    });
    expect(success.ok).toBe(true);
    expect(await t.run((ctx) => isAdminSignInRateLimited(ctx, key))).toBe(false);
  });
});
