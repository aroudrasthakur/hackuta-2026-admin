"use node";

import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { action } from "../_generated/server";
import { getEmailStatus } from "../email/emailService";
import { sessionTokenArgs } from "./staffAuth";
import type { DecisionNotification } from "./fields";

export const checkDecisionNotification = action({
  args: { ...sessionTokenArgs, applicationId: v.id("applications") },
  handler: async (ctx, args): Promise<void> => {
    const notification: DecisionNotification | null = await ctx.runQuery(
      makeFunctionReference<"query">("admin/decisionNotifications:getNotificationForStaff"), args,
    );
    if (!notification?.serviceId) throw new Error("No email service ID is available to check.");
    const result = await getEmailStatus(notification.serviceId);
    const status = result.status.toLowerCase();
    await ctx.runMutation(makeFunctionReference<"mutation">("admin/decisionNotifications:recordNotification"), {
      applicationId: args.applicationId, logId: notification.logId, attempt: notification.attempt,
      status: ["sent", "delivered"].includes(status) ? "sent"
        : ["failed", "error", "bounced"].includes(status) ? "failed" : "queued",
      serviceStatus: result.status,
    });
  },
});
