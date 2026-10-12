"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { sendMailMessage } from "../email/emailService";
import { buildDecisionEmailContent } from "./decisionEmailTemplates";

/** Sends a single decision notification (acceptance, rejection, or waitlist). */
export const sendDecisionEmail = internalAction({
  args: {
    decision: v.union(v.literal("accepted"), v.literal("rejected"), v.literal("waitlisted")),
    email: v.string(),
    applicantName: v.string(),
    hackathonName: v.string(),
  },
  handler: async (_ctx, args) => {
    const content = buildDecisionEmailContent(args);
    await sendMailMessage({
      to: args.email,
      subject: content.subject,
      text: content.text,
      note: `decision_${args.decision}`,
    });
  },
});
