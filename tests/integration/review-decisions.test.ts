import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logApplicationReviewActionRef, setApplicationDecisionRef } from "../../src/convex/adminApi";
import { createConvexTest, type ConvexTestInstance } from "../helpers/convexTestContext";
// Load the action before fake-timer pumps can race its asynchronous module transform.
import "../../convex/admin/sendDecisionEmails";
import {
  countRows,
  EMAIL_SERVICE_URL,
  getLogs,
  getReview,
  scheduledJobs,
  seedApplicant,
  seedStaff,
  snapshotApplicant,
  snapshotReviewState,
  stubEmailService,
  type Decision,
} from "../helpers/reviewTestKit";
import { expectAdminErrorCode } from "../helpers/adminErrors";
import type { AdminErrorCode } from "../../shared/admin/errors";

const decisions: Array<{ decision: Decision; note: string; subject: RegExp }> = [
  { decision: "accepted", note: "application_accepted", subject: /accepted/i },
  { decision: "rejected", note: "application_rejected", subject: /update on your/i },
  { decision: "waitlisted", note: "application_waitlisted", subject: /waitlist/i },
];

let email: ReturnType<typeof stubEmailService>;

beforeEach(() => {
  vi.useFakeTimers();
  email = stubEmailService();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** Runs scheduled jobs (the decision email action) to completion. */
async function flushScheduled(t: ConvexTestInstance) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

async function setup(role: "reviewer" | "admin" = "reviewer") {
  const t = createConvexTest();
  const staff = await seedStaff(t, { role, name: "Jordan Reviewer" });
  const applicant = await seedApplicant(t, { email: "taylor@example.com" });
  const decide = (decision: Decision) =>
    t.mutation(setApplicationDecisionRef, {
      sessionToken: staff.sessionToken,
      applicationId: applicant.applicationId,
      decision,
    });
  return { t, staff, applicant, decide };
}

describe.each(decisions)("$decision decision", ({ decision, note, subject }) => {
  it("changes nothing before it is confirmed", async () => {
    const { t, staff, applicant } = await setup();
    // Opening and starting a review is everything that happens before confirming.
    await t.mutation(logApplicationReviewActionRef, {
      sessionToken: staff.sessionToken,
      applicationId: applicant.applicationId,
      action: "started_review",
    });
    await flushScheduled(t);

    expect((await getReview(t, applicant.applicationId))?.status).toBe("under_review");
    expect((await getReview(t, applicant.applicationId))?.completedAt).toBeUndefined();
    expect((await getLogs(t, applicant.applicationId)).map((log) => log.action)).toEqual([
      "started_review",
    ]);
    expect(await scheduledJobs(t)).toHaveLength(0);
    expect(email.fetchMock).not.toHaveBeenCalled();
  });

  it.each(["reviewer", "admin"] as const)(
    "stores the decision, one audit event, and one email after %s confirms",
    async (role) => {
      const { t, staff, applicant, decide } = await setup(role);

      const result = await decide(decision);
      expect(result.duplicate).toBe(false);

      const review = await getReview(t, applicant.applicationId);
      expect(review).toMatchObject({ status: decision, reviewedBy: staff.adminId });
      expect(review?.completedAt).toEqual(expect.any(Number));

      const logs = await getLogs(t, applicant.applicationId);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        _id: result.logId,
        action: decision,
        adminId: staff.adminId,
        createdAt: review?.completedAt,
      });

      const jobs = await scheduledJobs(t);
      expect(jobs).toHaveLength(1);
      expect(jobs[0]!.name).toContain("sendDecisionEmail");
      expect(jobs[0]!.args[0]).toMatchObject({
        decision,
        email: "taylor@example.com",
        applicantName: "Taylor Student",
      });

      await flushScheduled(t);
      const sent = email.sentEmails();
      expect(sent).toHaveLength(1);
      expect(sent[0]!.url).toBe(`${EMAIL_SERVICE_URL}/send-email`);
      expect(sent[0]!.body).toMatchObject({ email: "taylor@example.com", note });
      expect(sent[0]!.body.subject).toMatch(subject);
      expect(sent[0]!.body.body).toContain("Hi Taylor Student,");
    },
  );

  it("does not repeat the decision, audit event, or email when confirmed again", async () => {
    const { t, applicant, decide } = await setup();

    const first = await decide(decision);
    await flushScheduled(t);
    const reviewAfterFirst = await getReview(t, applicant.applicationId);
    const participantsAfterFirst = await countRows(t, "participants");

    const second = await decide(decision);
    const third = await decide(decision);
    await flushScheduled(t);

    expect(second).toEqual({ logId: first.logId, duplicate: true });
    expect(third).toEqual({ logId: first.logId, duplicate: true });
    expect(await getReview(t, applicant.applicationId)).toEqual(reviewAfterFirst);
    expect(await getLogs(t, applicant.applicationId)).toHaveLength(1);
    expect(await countRows(t, "participants")).toBe(participantsAfterFirst);
    expect(email.fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blocks a different decision once this one is final", async () => {
    const { t, decide } = await setup();
    await decide(decision);
    await flushScheduled(t);
    const before = await snapshotReviewState(t);

    const other =
      decision === "waitlisted"
        ? "rejected"
        : decisions.find((entry) => entry.decision !== decision)!.decision;
    await expectAdminErrorCode(decide(other), "REVIEW_FINALIZED");
    expect(await snapshotReviewState(t)).toEqual(before);
    expect(email.fetchMock).toHaveBeenCalledTimes(1);
  });

  it("leaves applicant answers and account unchanged", async () => {
    const { t, staff, applicant, decide } = await setup();
    const before = await snapshotApplicant(t, applicant);

    for (const action of ["viewed", "started_review", "review_ended"] as const) {
      await t.mutation(logApplicationReviewActionRef, {
        sessionToken: staff.sessionToken,
        applicationId: applicant.applicationId,
        action,
      });
    }
    await decide(decision);
    await decide(decision);
    await flushScheduled(t);

    expect(await snapshotApplicant(t, applicant)).toEqual(before);
  });
});

describe("acceptance", () => {
  it("promotes a waitlisted applicant once, preserving both decisions in history", async () => {
    const { t, applicant, decide } = await setup();
    await decide("waitlisted");
    await flushScheduled(t);
    expect(await countRows(t, "participants")).toBe(0);
    const accepted = await decide("accepted");
    await flushScheduled(t);
    expect((await getReview(t, applicant.applicationId))?.status).toBe("accepted");
    expect((await getLogs(t, applicant.applicationId)).map((log) => log.action)).toEqual(["waitlisted", "accepted"]);
    expect(await countRows(t, "participants")).toBe(1);
    expect(email.sentEmails().map((sent) => sent.body.note)).toEqual(["application_waitlisted", "application_accepted"]);
    expect(await decide("accepted")).toEqual({ logId: accepted.logId, duplicate: true });
    await flushScheduled(t);
    expect(await countRows(t, "participants")).toBe(1);
    expect(email.fetchMock).toHaveBeenCalledTimes(2);
  });

  it("creates exactly one participant linked to the applicant", async () => {
    const { t, staff, applicant, decide } = await setup();
    await decide("accepted");
    await decide("accepted");

    const participants = await t.run((ctx) => ctx.db.query("participants").collect());
    expect(participants).toHaveLength(1);
    expect(participants[0]).toMatchObject({
      applicationId: applicant.applicationId,
      authUserId: applicant.userId,
      acceptedBy: staff.adminId,
    });
    expect(participants[0]!.qrCodeToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each(["rejected", "waitlisted"] as const)("does not create a participant when %s", async (decision) => {
    const { t, decide } = await setup();
    await decide(decision);
    expect(await countRows(t, "participants")).toBe(0);
  });

  it("fails without writes when the applicant account is missing", async () => {
    const { t, applicant, decide } = await setup();
    await t.run((ctx) => ctx.db.delete(applicant.userId));
    const before = await snapshotReviewState(t);

    await expectAdminErrorCode(decide("accepted"), "APPLICANT_ACCOUNT_MISSING");
    expect(await snapshotReviewState(t)).toEqual(before);
  });

  it("fails without writes when the applicant already has a participant for another application", async () => {
    const { t, staff, applicant, decide } = await setup();
    await t.run(async (ctx) => {
      const otherApplicationId = await ctx.db.insert("applications", {
        authUserId: applicant.userId,
        email: "taylor@example.com",
        createdAt: 1,
      });
      await ctx.db.insert("participants", {
        applicationId: otherApplicationId,
        authUserId: applicant.userId,
        acceptedAt: 1,
        acceptedBy: staff.adminId,
        qrCodeToken: "0".repeat(64),
        createdAt: 1,
        updatedAt: 1,
      });
    });
    const before = await snapshotReviewState(t);

    await expectAdminErrorCode(decide("accepted"), "PARTICIPANT_CONFLICT");
    expect(await snapshotReviewState(t)).toEqual(before);
  });
});

describe("decision email details", () => {
  it("uses the event name from event config", async () => {
    const { t, decide } = await setup();
    await t.run((ctx) =>
      ctx.db.insert("eventConfig", {
        key: "current",
        name: "HackUTA 8",
        updatedAt: 1,
      }),
    );
    await decide("waitlisted");
    await flushScheduled(t);
    expect(email.sentEmails()[0]!.body.subject).toBe("You're on the HackUTA 8 waitlist");
  });

  it("falls back to the email address when the applicant has no name", async () => {
    const t = createConvexTest();
    const { sessionToken } = await seedStaff(t);
    const { applicationId } = await seedApplicant(t, {
      email: "noname@example.com",
      fields: { firstName: undefined, lastName: undefined },
    });
    await t.mutation(setApplicationDecisionRef, { sessionToken, applicationId, decision: "rejected" });
    expect((await scheduledJobs(t))[0]!.args[0]).toMatchObject({ applicantName: "noname@example.com" });
  });

  it("still saves the decision but sends no email when the application has no email", async () => {
    const t = createConvexTest();
    const { sessionToken } = await seedStaff(t);
    const { applicationId } = await seedApplicant(t, { email: "   " });
    await t.mutation(setApplicationDecisionRef, { sessionToken, applicationId, decision: "rejected" });
    await flushScheduled(t);

    expect((await getReview(t, applicationId))?.status).toBe("rejected");
    expect(await scheduledJobs(t)).toHaveLength(0);
    expect(email.fetchMock).not.toHaveBeenCalled();
  });
});

describe("invalid application requests", () => {
  async function expectNoWrites(
    t: ConvexTestInstance,
    run: () => Promise<unknown>,
    expected: AdminErrorCode | RegExp,
  ) {
    const before = await snapshotReviewState(t);
    if (typeof expected === "string") await expectAdminErrorCode(run, expected);
    else await expect(run()).rejects.toThrow(expected);
    expect(await snapshotReviewState(t)).toEqual(before);
    expect(email.fetchMock).not.toHaveBeenCalled();
  }

  it.each(decisions.map((entry) => entry.decision))("rejects %s on a deleted application", async (decision) => {
    const { t, applicant, decide } = await setup();
    await t.run((ctx) => ctx.db.delete(applicant.applicationId));
    await expectNoWrites(t, () => decide(decision), "APPLICATION_NOT_FOUND");
  });

  it.each(decisions.map((entry) => entry.decision))("rejects %s on a draft application", async (decision) => {
    const t = createConvexTest();
    const { sessionToken } = await seedStaff(t);
    const { applicationId } = await seedApplicant(t, { submitted: false });
    await expectNoWrites(
      t,
      () => t.mutation(setApplicationDecisionRef, { sessionToken, applicationId, decision }),
      "APPLICATION_NOT_SUBMITTED",
    );
  });

  it.each(decisions.map((entry) => entry.decision))(
    "rejects %s when the application has no review row",
    async (decision) => {
      const t = createConvexTest();
      const { sessionToken } = await seedStaff(t);
      const { applicationId } = await seedApplicant(t, { review: null });
      await expectNoWrites(
        t,
        () => t.mutation(setApplicationDecisionRef, { sessionToken, applicationId, decision }),
        /review not found/i,
      );
    },
  );

  it("rejects an ID from another table", async () => {
    const { t, staff, applicant } = await setup();
    await expectNoWrites(
      t,
      () =>
        t.mutation(setApplicationDecisionRef, {
          sessionToken: staff.sessionToken,
          applicationId: applicant.userId as never,
          decision: "accepted",
        }),
      /validator|applications/i,
    );
  });

  it("rejects an unknown decision value", async () => {
    const { t, staff, applicant } = await setup();
    await expectNoWrites(
      t,
      () =>
        t.mutation(setApplicationDecisionRef, {
          sessionToken: staff.sessionToken,
          applicationId: applicant.applicationId,
          decision: "withdrawn" as never,
        }),
      /validator/i,
    );
  });

  it("rejects a decision on a withdrawn application", async () => {
    const t = createConvexTest();
    const { sessionToken } = await seedStaff(t);
    const { applicationId } = await seedApplicant(t, { review: { status: "withdrawn" } });
    await expectNoWrites(
      t,
      () => t.mutation(setApplicationDecisionRef, { sessionToken, applicationId, decision: "accepted" }),
      "REVIEW_FINALIZED",
    );
  });

  it("rejects a matching decision that has no audit event to return", async () => {
    const t = createConvexTest();
    const { sessionToken } = await seedStaff(t);
    const { applicationId } = await seedApplicant(t, { review: { status: "rejected" } });
    await expectNoWrites(
      t,
      () => t.mutation(setApplicationDecisionRef, { sessionToken, applicationId, decision: "rejected" }),
      "REVIEW_FINALIZED",
    );
  });
});
