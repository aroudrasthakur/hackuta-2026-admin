"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { sendTrackedEmail } from "../email/emailService";
import type { EmailDeliveryKind } from "../lib/emailDeliveries";
import { buildDecisionEmailContent } from "./decisionEmailTemplates";

const decisionEmailKind: Record<
  "accepted" | "rejected" | "waitlisted",
  EmailDeliveryKind
> = {
  accepted: "application_accepted",
  rejected: "application_rejected",
  waitlisted: "application_waitlisted",
};

/** Sends a single decision notification (acceptance, rejection, or waitlist). */
export const sendDecisionEmail = internalAction({
  args: {
    decision: v.union(v.literal("accepted"), v.literal("rejected"), v.literal("waitlisted")),
    email: v.string(),
    applicantName: v.string(),
    hackathonName: v.string(),
  },
  handler: async (ctx, args) => {
    const content = buildDecisionEmailContent(args);
    await sendTrackedEmail(ctx, decisionEmailKind[args.decision], {
      to: args.email,
      subject: content.subject,
      text: content.text,
    });
  },
});
