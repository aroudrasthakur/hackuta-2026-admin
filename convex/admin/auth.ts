import { v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import { normalizeEmail } from "../lib/normalizeEmail";
import { validatePasswordRequirements } from "../../shared/auth/password";
import { hashPassword, verifyPassword } from "./passwordHash";
import { createAdminSession, invalidateAdminSessions } from "./sessionLifecycle";
import {
  ADMIN_SIGN_IN_RATE_LIMIT_MESSAGE,
  clearAdminSignInFailures,
  isAdminSignInRateLimited,
  recordFailedAdminSignIn,
} from "./adminSignInRateLimit";
import { hashSessionToken, requireAdminRole, resolveAdminSession, sessionTokenArgs } from "./staffAuth";

const INVALID_CREDENTIALS = "Invalid email or password.";
const INACTIVE_ACCOUNT = "This account is inactive.";

// Pre-computed Scrypt hash to ensure constant-time password verification on invalid email
const DUMMY_PASSWORD_HASH =
  "bb6f7d995cfc347c9a863503584ff172:88566a22c94ca8c063511cad240defeb8ace7c299640b4df747b4ff19384a7805bd18f49bf3f8771ba28d81c02ee21bd17740193d9b98bc918523c14ce1da0f4";

/** Email + password sign-in for provisioned organizer accounts only. */
export const signIn = mutation({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, { email, password }) => {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !password) {
      return { ok: false as const, error: INVALID_CREDENTIALS };
    }

    if (await isAdminSignInRateLimited(ctx, normalizedEmail)) {
      return { ok: false as const, error: ADMIN_SIGN_IN_RATE_LIMIT_MESSAGE };
    }

    const admin = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .unique();

    const authAccount = admin
      ? await ctx.db
          .query("adminAuthAccounts")
          .withIndex("by_admin", (q) => q.eq("adminId", admin._id))
          .unique()
      : null;

    const valid = await verifyPassword(
      authAccount?.passwordHash ?? DUMMY_PASSWORD_HASH,
      password,
    );

    if (!admin || !authAccount || !valid) {
      await recordFailedAdminSignIn(ctx, normalizedEmail);
      return { ok: false as const, error: INVALID_CREDENTIALS };
    }

    if (!admin.active) {
      await recordFailedAdminSignIn(ctx, normalizedEmail);
      return { ok: false as const, error: INACTIVE_ACCOUNT };
    }

    await clearAdminSignInFailures(ctx, normalizedEmail);
    const session = await createAdminSession(ctx, admin._id);
    return { ok: true as const, ...session };
  },
});

/** Invalidates the current organizer session. */
export const signOut = mutation({
  args: sessionTokenArgs,
  handler: async (ctx, { sessionToken }) => {
    const sessionTokenHash = await hashSessionToken(sessionToken);
    const session = await ctx.db
      .query("adminSessions")
      .withIndex("by_token_hash", (q) => q.eq("sessionTokenHash", sessionTokenHash))
      .unique();
    if (session) {
      await ctx.db.delete(session._id);
    }
    return { ok: true as const };
  },
});

/** Returns staff profile from a valid session; role always comes from `admins`. */
export const getCurrentStaff = query({
  args: sessionTokenArgs,
  handler: async (ctx, { sessionToken }) => {
    const resolved = await resolveAdminSession(ctx, sessionToken);
    if (!resolved) {
      return null;
    }
    const { admin, session } = resolved;
    return {
      adminId: admin._id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      expiresAt: session.expiresAt,
    };
  },
});

/** Developer provisioning — sets password hash and clears existing sessions. */
export const provisionAdminAuthAccount = internalMutation({
  args: {
    adminId: v.id("admins"),
    password: v.string(),
  },
  handler: async (ctx, { adminId, password }) => {
    validatePasswordRequirements(password);

    const admin = await ctx.db.get(adminId);
    if (!admin) {
      throw new Error("Admin not found.");
    }

    const passwordHash = await hashPassword(password);
    const now = Date.now();
    const existing = await ctx.db
      .query("adminAuthAccounts")
      .withIndex("by_admin", (q) => q.eq("adminId", adminId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { passwordHash, updatedAt: now });
    } else {
      await ctx.db.insert("adminAuthAccounts", {
        adminId,
        passwordHash,
        createdAt: now,
        updatedAt: now,
      });
    }

    await invalidateAdminSessions(ctx, adminId);
    return { ok: true as const };
  },
});

/** Organizer provisioning — creates or updates an admin row and sets credentials. Restricted to existing admins. */
export const createAndProvisionAdmin = mutation({
  args: {
    ...sessionTokenArgs,
    email: v.string(),
    name: v.string(),
    role: v.union(v.literal("reviewer"), v.literal("admin")),
    password: v.string(),
  },
  handler: async (ctx, { sessionToken, email, name, role, password }) => {
    await requireAdminRole(ctx, sessionToken);

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      throw new Error("Invalid email.");
    }
    validatePasswordRequirements(password);

    const now = Date.now();
    const existingAdmin = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .unique();

    const profile = { name, role, active: true, updatedAt: now };
    const adminId =
      existingAdmin?._id ??
      (await ctx.db.insert("admins", {
        ...profile,
        email: normalizedEmail,
        createdAt: now,
      }));
    if (existingAdmin) {
      await ctx.db.patch(adminId, profile);
    }

    const passwordHash = await hashPassword(password);
    const existingAccount = await ctx.db
      .query("adminAuthAccounts")
      .withIndex("by_admin", (q) => q.eq("adminId", adminId))
      .unique();

    if (existingAccount) {
      await ctx.db.patch(existingAccount._id, { passwordHash, updatedAt: now });
    } else {
      await ctx.db.insert("adminAuthAccounts", {
        adminId,
        passwordHash,
        createdAt: now,
        updatedAt: now,
      });
    }

    await invalidateAdminSessions(ctx, adminId);
    return { adminId, email: normalizedEmail, ok: true as const };
  },
});
