import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  listDecisionEmailQueueRef,
  releaseDecisionEmailsRef,
  retryFailedDecisionEmailsRef,
  setApplicationDecisionRef,
  setDecisionEmailHoldRef,
} from "../../src/convex/adminApi";
import "../../convex/admin/decisionEmailRelease";
import "../../convex/admin/sendDecisionEmails";
import { createConvexTest } from "../helpers/convexTestContext";
import { expectAdminErrorCode } from "../helpers/adminErrors";
import {
  countRows,
  EMAIL_SERVICE_URL,
  getLogs,
  getReview,
  seedApplicant,
  seedStaff,
  stubEmailService,
} from "../helpers/reviewTestKit";

let email: ReturnType<typeof stubEmailService>;

beforeEach(() => {
  email = stubEmailService();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function setup() {
  const t = createConvexTest();
  const reviewer = await seedStaff(t, { role: "reviewer", name: "Riley Reviewer" });
  const admin = await seedStaff(t, { role: "admin", name: "Avery Admin" });
  const applicant = await seedApplicant(t, { email: "taylor@example.com" });
  const decide = (
    sessionToken: string,
    applicationId: typeof applicant.applicationId,
    decision: "accepted" | "rejected" | "waitlisted",
  ) =>
    t.mutation(setApplicationDecisionRef, { sessionToken, applicationId, decision });
  const release = (itemIds?: Array<string>) =>
    t.action(releaseDecisionEmailsRef, {
      sessionToken: admin.sessionToken,
      ...(itemIds ? { itemIds: itemIds as never } : {}),
    });
  return { t, reviewer, admin, applicant, decide, release };
}

describe("decision email queue", () => {
  it("does not expose a final decision on the register dashboard until release", async () => {
    const { t, admin, applicant, decide, release } = await setup();
    const asApplicant = t.withIdentity({ subject: applicant.userId, email: "taylor@example.com" });

    await decide(admin.sessionToken, applicant.applicationId, "accepted");
    const beforeRelease = (await asApplicant.query("applications:getMyApplicantDashboard", {})) as {
      registration: { status: string } | null;
    };
    expect(beforeRelease.registration?.status).not.toBe("accepted");
    expect(await countRows(t, "participants")).toBe(0);
    expect(email.fetchMock).not.toHaveBeenCalled();

    await release();
    const afterRelease = (await asApplicant.query("applications:getMyApplicantDashboard", {})) as {
      registration: { status: string } | null;
    };
    expect(afterRelease.registration?.status).toBe("accepted");
    expect(await countRows(t, "participants")).toBe(1);
    expect(email.sentEmails()).toHaveLength(1);
  });

  it("lets a reviewer read the queue and blocks them from sending", async () => {
    const { t, reviewer, applicant, decide } = await setup();
    await decide(reviewer.sessionToken, applicant.applicationId, "accepted");

    const queue = await t.query(listDecisionEmailQueueRef, { sessionToken: reviewer.sessionToken });
    expect(queue.counts).toMatchObject({ queued: 1, held: 0, sending: 0, failed: 0 });
    expect(queue.active).toHaveLength(1);
    expect(queue.active[0]).toMatchObject({
      decision: "accepted",
      recipientEmail: "taylor@example.com",
      applicantName: "Taylor Student",
      status: "queued",
    });

    await expectAdminErrorCode(
      t.action(releaseDecisionEmailsRef, { sessionToken: reviewer.sessionToken }),
      "ADMIN_ONLY",
    );
    expect((await getReview(t, applicant.applicationId))?.status).not.toBe("accepted");
    expect(email.fetchMock).not.toHaveBeenCalled();
  });

  it("sends every queued email and publishes the decision only after the mailer accepts it", async () => {
    const { t, admin, applicant, decide, release } = await setup();
    await decide(admin.sessionToken, applicant.applicationId, "accepted");
    expect(await countRows(t, "participants")).toBe(0);

    const result = await release();
    expect(result).toEqual({ sent: 1, failed: 0, total: 1 });

    const sent = email.sentEmails();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe(`${EMAIL_SERVICE_URL}/send-email`);
    expect(sent[0]!.body).toMatchObject({
      email: "taylor@example.com",
      note: "application_accepted",
    });
    expect(sent[0]!.body.subject).toMatch(/accepted/i);
    expect((await getReview(t, applicant.applicationId))?.status).toBe("accepted");
    expect((await getLogs(t, applicant.applicationId)).map((log) => log.action)).toEqual(["accepted"]);
    expect(await countRows(t, "participants")).toBe(1);
    expect(await t.run((ctx) => ctx.db.query("decisionEmailQueue").unique())).toMatchObject({
      status: "sent",
    });
  });

  it("sends only the selected rows", async () => {
    const { t, admin, decide, release } = await setup();
    const first = await seedApplicant(t, { email: "first@example.com" });
    const second = await seedApplicant(t, { email: "second@example.com" });
    await decide(admin.sessionToken, first.applicationId, "rejected");
    await decide(admin.sessionToken, second.applicationId, "accepted");
    const selected = await t.run((ctx) =>
      ctx.db
        .query("decisionEmailQueue")
        .withIndex("by_application", (q) => q.eq("applicationId", first.applicationId))
        .unique(),
    );

    const result = await release([selected!._id]);
    expect(result).toEqual({ sent: 1, failed: 0, total: 1 });
    expect((await getReview(t, first.applicationId))?.status).toBe("rejected");
    expect((await getReview(t, second.applicationId))?.status).not.toBe("accepted");
    expect(await countRows(t, "participants")).toBe(0);
    const remaining = await t.run((ctx) =>
      ctx.db
        .query("decisionEmailQueue")
        .withIndex("by_application", (q) => q.eq("applicationId", second.applicationId))
        .unique(),
    );
    expect(remaining).toMatchObject({ status: "queued", decision: "accepted" });
    expect(email.sentEmails().map((sent) => sent.body.note)).toEqual(["application_rejected"]);
  });

  it("leaves held rows out of send-all", async () => {
    const { t, admin, decide, release } = await setup();
    const heldApplicant = await seedApplicant(t, { email: "held@example.com" });
    const queuedApplicant = await seedApplicant(t, { email: "go@example.com" });
    await decide(admin.sessionToken, heldApplicant.applicationId, "waitlisted");
    await decide(admin.sessionToken, queuedApplicant.applicationId, "rejected");
    const held = await t.run((ctx) =>
      ctx.db
        .query("decisionEmailQueue")
        .withIndex("by_application", (q) => q.eq("applicationId", heldApplicant.applicationId))
        .unique(),
    );
    await t.mutation(setDecisionEmailHoldRef, {
      sessionToken: admin.sessionToken,
      itemId: held!._id,
      held: true,
    });

    const result = await release();
    expect(result).toEqual({ sent: 1, failed: 0, total: 1 });
    expect(await t.run((ctx) => ctx.db.get(held!._id))).toMatchObject({ status: "held" });
    expect((await getReview(t, heldApplicant.applicationId))?.status).not.toBe("waitlisted");
    expect((await getReview(t, queuedApplicant.applicationId))?.status).toBe("rejected");
  });

  it("keeps review status unchanged when the mailer fails, then retries successfully", async () => {
    const { t, admin, applicant, decide, release } = await setup();
    await decide(admin.sessionToken, applicant.applicationId, "accepted");
    email.fetchMock.mockRejectedValueOnce(new Error("smtp down"));

    const failed = await release();
    expect(failed).toEqual({ sent: 0, failed: 1, total: 1 });
    expect((await getReview(t, applicant.applicationId))?.status).not.toBe("accepted");
    expect(await countRows(t, "participants")).toBe(0);
    expect(await getLogs(t, applicant.applicationId)).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("decisionEmailQueue").unique())).toMatchObject({
      status: "failed",
      errorMessage: "Email service is unreachable.",
    });

    await t.mutation(retryFailedDecisionEmailsRef, { sessionToken: admin.sessionToken });
    const retried = await t.run((ctx) => ctx.db.query("decisionEmailQueue").unique());
    expect(retried?.status).toBe("queued");
    expect(retried?.errorMessage).toBeUndefined();

    const sent = await release();
    expect(sent).toEqual({ sent: 1, failed: 0, total: 1 });
    expect((await getReview(t, applicant.applicationId))?.status).toBe("accepted");
    expect(await countRows(t, "participants")).toBe(1);
  });

  it("rejects a second release while a row is already sending", async () => {
    const { t, admin, applicant, decide, release } = await setup();
    await decide(admin.sessionToken, applicant.applicationId, "rejected");
    await t.run(async (ctx) => {
      const row = await ctx.db.query("decisionEmailQueue").unique();
      await ctx.db.patch(row!._id, { status: "sending" });
    });

    await expectAdminErrorCode(release(), "DECISION_EMAIL_SEND_IN_PROGRESS");
    expect((await getReview(t, applicant.applicationId))?.status).not.toBe("rejected");
    expect(email.fetchMock).not.toHaveBeenCalled();
  });

  it("keeps a released waitlist in place until a later acceptance email is accepted", async () => {
    const { t, admin, applicant, decide, release } = await setup();
    await decide(admin.sessionToken, applicant.applicationId, "waitlisted");
    await release();
    expect((await getReview(t, applicant.applicationId))?.status).toBe("waitlisted");
    expect(await countRows(t, "participants")).toBe(0);

    await decide(admin.sessionToken, applicant.applicationId, "accepted");
    expect((await getReview(t, applicant.applicationId))?.status).toBe("waitlisted");
    expect(await countRows(t, "participants")).toBe(0);
    const rows = await t.run((ctx) => ctx.db.query("decisionEmailQueue").collect());
    expect(rows.map((row) => row.status).sort()).toEqual(["queued", "sent"]);

    await release();
    expect((await getReview(t, applicant.applicationId))?.status).toBe("accepted");
    expect(await countRows(t, "participants")).toBe(1);
    expect(email.sentEmails().map((sent) => sent.body.note)).toEqual([
      "application_waitlisted",
      "application_accepted",
    ]);
  });
});
