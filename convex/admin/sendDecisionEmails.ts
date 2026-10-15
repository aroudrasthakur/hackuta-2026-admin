"use node";

import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalAction } from "../_generated/server";
import { buildDecisionEmailContent } from "./decisionEmailTemplates";
import { sendDecisionEmailMessage } from "./decisionEmailService";
import { getEmailServiceConfig } from "../email/emailService";

/** Sends a single decision notification (acceptance, rejection, or waitlist). */
export const sendDecisionEmail = internalAction({
  args: {
    decision: v.union(v.literal("accepted"), v.literal("rejected"), v.literal("waitlisted")),
    email: v.string(),
    applicantName: v.string(),
    hackathonName: v.string(),
    // Optional to allow already-scheduled jobs from the previous deployment to finish.
    applicationId: v.optional(v.id("applications")),
    logId: v.optional(v.id("applicationReviewLogs")),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = args.applicationId && args.logId && args.attempt
      ? { applicationId: args.applicationId, logId: args.logId, attempt: args.attempt } : null;
    if (identity && !await ctx.runMutation(makeFunctionReference<"mutation">("admin/decisionNotifications:beginNotification"), identity)) return;
    const record = async (status: "failed" | "unknown" | "queued", serviceId?: string) => {
      if (identity) await ctx.runMutation(makeFunctionReference<"mutation">("admin/decisionNotifications:recordNotification"), { ...identity, status, ...(serviceId ? { serviceId } : {}) });
    };
    try {
      getEmailServiceConfig();
    } catch {
      await record("failed");
      return;
    }
    const content = buildDecisionEmailContent(args);
    let serviceId: string;
    try {
      const result = await sendDecisionEmailMessage(ctx, args.decision, { to: args.email, subject: content.subject, text: content.text });
      serviceId = result.id;
    } catch {
      // A failed response may still have queued the message. Never automatically resend.
      await record("unknown");
      return;
    }
    await record("queued", serviceId);
  },
});
