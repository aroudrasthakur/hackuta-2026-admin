import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { isValidEmailSyntax, normalizeEmail } from "../lib/normalizeEmail";
import { adminError } from "../../shared/admin/errors";
import { validatePasswordRequirements } from "../../shared/auth/password";
import { requireEligibleParticipant } from "./pointsLedger";
import { newVolunteerFields, requireAdminRole, sessionTokenArgs } from "./staffAuth";
import { setStaffPassword } from "./staffCredentials";

/** A new, distinct staff identity; existing staff accounts are never converted. */
export const createVolunteer = mutation({
  args: {
    ...sessionTokenArgs,
    email: v.string(),
    name: v.string(),
    password: v.string(),
    participantId: v.optional(v.id("participants")),
  },
  returns: v.object({ ok: v.literal(true), adminId: v.id("admins"), email: v.string() }),
  handler: async (ctx, { sessionToken, email, name, password, participantId }) => {
    const actor = await requireAdminRole(ctx, sessionToken);
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !isValidEmailSyntax(normalizedEmail)) throw adminError("INVALID_EMAIL");
    const normalizedName = name.trim();
    if (!normalizedName) throw adminError("INVALID_STAFF_NAME");
    validatePasswordRequirements(password);
    const existing = await ctx.db.query("admins")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail)).first();
    if (existing) throw adminError("STAFF_ACCOUNT_EXISTS");
    if (participantId) {
      await requireEligibleParticipant(ctx, participantId);
      const linked = await ctx.db.query("admins")
        .withIndex("by_participant", (q) => q.eq("participantId", participantId)).first();
      if (linked) throw adminError("STAFF_ACCOUNT_EXISTS");
    }
    const now = Date.now();
    const adminId = await ctx.db.insert("admins", {
      email: normalizedEmail, name: normalizedName, active: true,
      ...newVolunteerFields(),
      ...(participantId ? { participantId } : {}),
      createdAt: now, updatedAt: now,
    });
    await setStaffPassword(ctx, adminId, password);
    await ctx.db.insert("staffConfigLogs", {
      actorAdminId: actor._id, action: "volunteer_created", targetAdminId: adminId,
      ...(participantId ? { targetParticipantId: participantId } : {}),
      createdAt: now,
    });
    return { ok: true as const, adminId, email: normalizedEmail };
  },
});
