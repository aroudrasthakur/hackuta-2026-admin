import { v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import { normalizeEmail } from "../lib/normalizeEmail";
import { validatePasswordRequirements } from "../../shared/auth/password";
import { hashPassword, verifyPassword } from "./passwordHash";
import { createAdminSession, invalidateAdminSessions } from "./sessionLifecycle";
import { hashSessionToken, resolveAdminSession, sessionTokenArgs } from "./staffAuth";

const INVALID_CREDENTIALS = "Invalid email or password.";
const INACTIVE_ACCOUNT = "This account is inactive.";

/** Email + password sign-in for provisioned organizer accounts only. */
export const signIn = mutation({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, { email, password }) => {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !password) {
      throw new Error(INVALID_CREDENTIALS);
    }

    const admin = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .unique();
    if (!admin) {
      throw new Error(INVALID_CREDENTIALS);
    }
    if (!admin.active) {
      throw new Error(INACTIVE_ACCOUNT);
    }

    const authAccount = await ctx.db
      .query("adminAuthAccounts")
      .withIndex("by_admin", (q) => q.eq("adminId", admin._id))
      .unique();
    if (!authAccount) {
      throw new Error(INVALID_CREDENTIALS);
    }

    const valid = await verifyPassword(authAccount.passwordHash, password);
    if (!valid) {
      throw new Error(INVALID_CREDENTIALS);
    }

    return await createAdminSession(ctx, admin._id);
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
