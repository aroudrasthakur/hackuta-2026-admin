import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import { checkDecisionNotificationRef, retryDecisionNotificationRef, setApplicationDecisionRef } from "../../src/convex/adminApi";
import { createConvexTest } from "../helpers/convexTestContext";
import { getReview, seedApplicant, seedStaff, stubEmailService } from "../helpers/reviewTestKit";
import { NOTIFICATION_ATTEMPT_STALE_MS } from "../../shared/admin/decisionNotification";

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function setup() {
  const t = createConvexTest();
  const staff = await seedStaff(t);
  const { applicationId, reviewId } = await seedApplicant(t);
  const args = { sessionToken: staff.sessionToken, applicationId };
  const email = stubEmailService();
  const decide = (decision: "accepted" | "rejected" | "waitlisted") => t.mutation(setApplicationDecisionRef, { ...args, decision });
  const flush = () => t.finishAllScheduledFunctions(vi.runAllTimers);
  const notification = async () => (await getReview(t, applicationId))!.notification!;
  return { t, staff, applicationId, reviewId: reviewId!, args, email, decide, flush, notification };
}

describe("decision notification recovery", () => {
  it("persists the service ID and checks sent status without changing the decision", async () => {
    const f = await setup();
    await f.decide("accepted");
    expect(await f.notification()).toMatchObject({ status: "scheduled", attempt: 1, requestedBy: f.staff.adminId });
    await f.flush();
    expect(await f.notification()).toMatchObject({ status: "queued", serviceId: "queued-1" });
    f.email.fetchMock.mockResolvedValueOnce(Response.json({ status: "sent" }));
    await f.t.action(checkDecisionNotificationRef, f.args);
    expect(f.email.fetchMock.mock.lastCall?.[0]).toBe("https://email.test/email-status?id=queued-1");
    expect(await f.notification()).toMatchObject({ status: "sent", serviceStatus: "sent" });
    expect((await getReview(f.t, f.applicationId))?.status).toBe("accepted");
    await expect(f.t.mutation(retryDecisionNotificationRef, f.args)).rejects.toThrow(/already in progress or has been sent/);
  });

  it("records configuration failure and retries once after configuration is repaired", async () => {
    const f = await setup();
    vi.stubEnv("EMAIL_SERVICE_API_KEY", "");
    await f.decide("rejected");
    await f.flush();
    expect(await f.notification()).toMatchObject({ status: "failed" });
    expect(f.email.fetchMock).not.toHaveBeenCalled();
    vi.stubEnv("EMAIL_SERVICE_API_KEY", "fixed");
    await f.t.mutation(retryDecisionNotificationRef, f.args);
    await expect(f.t.mutation(retryDecisionNotificationRef, f.args)).rejects.toThrow(/already in progress/);
    await f.flush();
    expect(await f.notification()).toMatchObject({ status: "queued", attempt: 2 });
    expect(f.email.fetchMock).toHaveBeenCalledTimes(1);
    expect(await f.t.run((ctx) => ctx.db.query("applicationReviewLogs").collect())).toHaveLength(1);
  });

  it("records an ambiguous HTTP failure without automatically sending again", async () => {
    const f = await setup();
    f.email.fetchMock.mockRejectedValueOnce(new Error("connection lost"));
    await f.decide("waitlisted");
    await f.flush();
    expect(await f.notification()).toMatchObject({ status: "unknown" });
    expect(f.email.fetchMock).toHaveBeenCalledTimes(1);
    await f.t.mutation(retryDecisionNotificationRef, f.args);
    await f.flush();
    expect(await f.notification()).toMatchObject({ status: "queued", attempt: 2 });
    expect(f.email.fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(["failed", "pending", "delivered"])("persists provider status %s", async (status) => {
    const f = await setup();
    await f.decide("accepted"); await f.flush();
    f.email.fetchMock.mockResolvedValueOnce(Response.json({ status }));
    await f.t.action(checkDecisionNotificationRef, f.args);
    expect(await f.notification()).toMatchObject({ serviceStatus: status, status: status === "failed" ? "failed" : status === "delivered" ? "sent" : "queued" });
  });

  it("keeps the queue ID when a status lookup fails", async () => {
    const f = await setup();
    await f.decide("accepted"); await f.flush();
    const before = await f.notification();
    f.email.fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(f.t.action(checkDecisionNotificationRef, f.args)).rejects.toThrow(/unreachable/);
    expect(await f.notification()).toEqual(before);
  });

  it("ignores superseded waitlist jobs and late results after acceptance", async () => {
    const f = await setup();
    await f.decide("waitlisted");
    const old = await f.notification();
    await f.decide("accepted");
    await f.flush();
    expect(f.email.sentEmails().map((mail) => mail.body.note)).toEqual(["application_accepted"]);
    const current = await f.notification();
    await f.t.mutation(makeFunctionReference<"mutation">("admin/decisionNotifications:recordNotification"), {
      applicationId: f.applicationId, logId: old.logId, attempt: old.attempt, status: "failed",
    });
    expect(await f.notification()).toEqual(current);
  });

  it("supports an explicit resend of an older untracked decision", async () => {
    const f = await setup();
    await f.decide("accepted"); await f.flush();
    await f.t.run((ctx) => ctx.db.patch(f.reviewId, { notification: undefined }));
    await f.t.mutation(retryDecisionNotificationRef, f.args);
    await f.flush();
    expect(f.email.fetchMock).toHaveBeenCalledTimes(2);
  });

  it("records missing recipients without scheduling or silently claiming success", async () => {
    const f = await setup();
    await f.t.run((ctx) => ctx.db.patch(f.applicationId, { email: " " }));
    await f.decide("rejected"); await f.flush();
    expect(await f.notification()).toMatchObject({ status: "unavailable" });
    await expect(f.t.mutation(retryDecisionNotificationRef, f.args)).rejects.toThrow(/no email address/);
    expect(f.email.fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated resends and checks before contacting the service", async () => {
    const f = await setup();
    await f.decide("rejected"); await f.flush();
    f.email.fetchMock.mockClear();
    const args = { ...f.args, sessionToken: "invalid" };
    await expect(f.t.mutation(retryDecisionNotificationRef, args)).rejects.toThrow();
    await expect(f.t.action(checkDecisionNotificationRef, args)).rejects.toThrow();
    expect(f.email.fetchMock).not.toHaveBeenCalled();
  });

  it("requires a decision and a recorded event before resending", async () => {
    const f = await setup();
    await expect(f.t.mutation(retryDecisionNotificationRef, f.args)).rejects.toThrow(/decision is required/);
    await f.t.run((ctx) => ctx.db.patch(f.reviewId, { status: "accepted" }));
    await expect(f.t.mutation(retryDecisionNotificationRef, f.args)).rejects.toThrow(/No recorded decision/);
    await expect(f.t.action(checkDecisionNotificationRef, f.args)).rejects.toThrow(/No email service ID/);
  });

  it.each(["scheduled", "sending"] as const)("recovers an interrupted %s attempt without sending its old job again", async (status) => {
    const f = await setup();
    await f.decide("accepted");
    const previous = await f.notification();
    await f.t.run((ctx) => ctx.db.patch(f.reviewId, { notification: { ...previous, status } }));
    await expect(f.t.mutation(retryDecisionNotificationRef, f.args)).rejects.toThrow(/already in progress/);
    vi.setSystemTime(Date.now() + NOTIFICATION_ATTEMPT_STALE_MS + 1);
    await f.t.mutation(retryDecisionNotificationRef, f.args);
    await f.flush();
    expect(await f.notification()).toMatchObject({ status: "queued", attempt: 2 });
    expect(f.email.fetchMock).toHaveBeenCalledTimes(1);
    await f.t.mutation(makeFunctionReference<"mutation">("admin/decisionNotifications:recordNotification"), {
      applicationId: f.applicationId, logId: previous.logId, attempt: previous.attempt, status: "unknown",
    });
    expect(await f.notification()).toMatchObject({ status: "queued", attempt: 2 });
  });

  it("does not let a late pending lookup undo a sent status", async () => {
    const f = await setup();
    await f.decide("accepted"); await f.flush();
    f.email.fetchMock.mockResolvedValueOnce(Response.json({ status: "sent" }));
    await f.t.action(checkDecisionNotificationRef, f.args);
    f.email.fetchMock.mockResolvedValueOnce(Response.json({ status: "pending" }));
    await f.t.action(checkDecisionNotificationRef, f.args);
    expect(await f.notification()).toMatchObject({ status: "sent", serviceStatus: "sent" });
  });
});
