import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logApplicationReviewActionRef, setApplicationDecisionRef } from "../../src/convex/adminApi";
import { createConvexTest, type ConvexTestInstance } from "../helpers/convexTestContext";
// Load the action before fake-timer pumps can race its asynchronous module transform.
import "../../convex/admin/sendDecisionEmails";
import {
  countRows,
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

const decisions: Decision[] = ["accepted", "rejected", "waitlisted"];

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

describe.each(decisions)("$decision decision", (decision) => {
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
    "queues the decision without changing review status, audit logs, participants, or email after %s confirms",
    async (role) => {
      const { t, staff, applicant, decide } = await setup(role);
      const reviewBefore = await getReview(t, applicant.applicationId);

      const result = await decide(decision);
      expect(result).toEqual({ queued: true, duplicate: false });

      expect(await getReview(t, applicant.applicationId)).toEqual(reviewBefore);
      expect(await getLogs(t, applicant.applicationId)).toEqual([]);
      expect(await countRows(t, "participants")).toBe(0);
      expect(await scheduledJobs(t)).toHaveLength(0);
      expect(email.fetchMock).not.toHaveBeenCalled();
      const queued = await t.run((ctx) => ctx.db.query("decisionEmailQueue").unique());
      expect(queued).toMatchObject({
        applicationId: applicant.applicationId,
        decision,
        status: "queued",
        recipientEmail: "taylor@example.com",
        applicantName: "Taylor Student",
        queuedBy: staff.adminId,
      });
    },
  );

  it("does not add a second open queue row when confirmed again", async () => {
    const { t, applicant, decide } = await setup();

    const first = await decide(decision);
    const reviewAfterFirst = await getReview(t, applicant.applicationId);

    const second = await decide(decision);
    const third = await decide(decision);

    expect(first).toEqual({ queued: true, duplicate: false });
    expect(second).toEqual({ queued: true, duplicate: true });
    expect(third).toEqual({ queued: true, duplicate: true });
    expect(await getReview(t, applicant.applicationId)).toEqual(reviewAfterFirst);
    expect(await getLogs(t, applicant.applicationId)).toEqual([]);
    expect(await countRows(t, "participants")).toBe(0);
    expect(await t.run((ctx) => ctx.db.query("decisionEmailQueue").collect())).toHaveLength(1);
    expect(email.fetchMock).not.toHaveBeenCalled();
  });

  it("replaces the queued decision when a different choice is confirmed before release", async () => {
    const { t, decide } = await setup();
    await decide(decision);
    const before = await snapshotReviewState(t);

    const other =
      decision === "waitlisted"
        ? "rejected"
        : decisions.find((entry) => entry !== decision)!;
    await decide(other);
    expect(await snapshotReviewState(t)).toEqual(before);
    const queued = await t.run((ctx) => ctx.db.query("decisionEmailQueue").collect());
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ decision: other, status: "queued" });
    expect(email.fetchMock).not.toHaveBeenCalled();
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

describe("acceptance queue", () => {
  it("does not create a participant when a decision is queued", async () => {
    const { t, decide } = await setup();
    await decide("accepted");
    await decide("rejected");
    await decide("waitlisted");
    expect(await countRows(t, "participants")).toBe(0);
    expect(await t.run((ctx) => ctx.db.query("decisionEmailQueue").unique())).toMatchObject({
      decision: "waitlisted",
      status: "queued",
    });
  });

  it("rejects a queued decision when the application has no email", async () => {
    const t = createConvexTest();
    const { sessionToken } = await seedStaff(t);
    const { applicationId } = await seedApplicant(t, { email: "   " });
    await expectAdminErrorCode(
      t.mutation(setApplicationDecisionRef, { sessionToken, applicationId, decision: "rejected" }),
      "DECISION_EMAIL_MISSING",
    );
    expect(await scheduledJobs(t)).toHaveLength(0);
    expect(email.fetchMock).not.toHaveBeenCalled();
    expect((await getReview(t, applicationId))?.status).not.toBe("rejected");
  });
});

describe("decision email queue snapshots", () => {
  it("falls back to the email address when the applicant has no name", async () => {
    const t = createConvexTest();
    const { sessionToken } = await seedStaff(t);
    const { applicationId } = await seedApplicant(t, {
      email: "noname@example.com",
      fields: { firstName: undefined, lastName: undefined },
    });
    await t.mutation(setApplicationDecisionRef, { sessionToken, applicationId, decision: "rejected" });
    expect(await t.run((ctx) => ctx.db.query("decisionEmailQueue").unique())).toMatchObject({
      applicantName: "noname@example.com",
    });
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

  it.each(decisions)("rejects %s on a deleted application", async (decision) => {
    const { t, applicant, decide } = await setup();
    await t.run((ctx) => ctx.db.delete(applicant.applicationId));
    await expectNoWrites(t, () => decide(decision), "APPLICATION_NOT_FOUND");
  });

  it.each(decisions)("rejects %s on a draft application", async (decision) => {
    const t = createConvexTest();
    const { sessionToken } = await seedStaff(t);
    const { applicationId } = await seedApplicant(t, { submitted: false });
    await expectNoWrites(
      t,
      () => t.mutation(setApplicationDecisionRef, { sessionToken, applicationId, decision }),
      "APPLICATION_NOT_SUBMITTED",
    );
  });

  it.each(decisions)(
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

  it("treats a matching already-released decision as a duplicate without a new queue row", async () => {
    const t = createConvexTest();
    const { sessionToken } = await seedStaff(t);
    const { applicationId } = await seedApplicant(t, { review: { status: "rejected" } });
    const before = await snapshotReviewState(t);
    await expect(
      t.mutation(setApplicationDecisionRef, { sessionToken, applicationId, decision: "rejected" }),
    ).resolves.toEqual({ queued: true, duplicate: true });
    expect(await snapshotReviewState(t)).toEqual(before);
    expect(await t.run((ctx) => ctx.db.query("decisionEmailQueue").collect())).toHaveLength(0);
    expect(email.fetchMock).not.toHaveBeenCalled();
  });
});
