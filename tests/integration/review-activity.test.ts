import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTIVE_REVIEW_STALE_MS } from "../../convex/admin/reviewClaim";
import {
  getApplicationRef,
  listApplicationReviewLogsRef,
  listSubmittedApplicationsRef,
  logApplicationReviewActionRef,
  setApplicationDecisionRef,
} from "../../src/convex/adminApi";
import { createConvexTest, type ConvexTestInstance } from "../helpers/convexTestContext";
import {
  countRows,
  getLogs,
  getReview,
  seedApplicant,
  seedStaff,
  snapshotApplicant,
  snapshotReviewState,
} from "../helpers/reviewTestKit";
import { expectAdminErrorCode } from "../helpers/adminErrors";

type Action = "viewed" | "started_review" | "review_ended";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

async function setup() {
  const t = createConvexTest();
  const first = await seedStaff(t, { name: "First Reviewer" });
  const second = await seedStaff(t, { name: "Second Reviewer" });
  const applicant = await seedApplicant(t);
  const act = (staff: { sessionToken: string }, action: Action) =>
    t.mutation(logApplicationReviewActionRef, {
      sessionToken: staff.sessionToken,
      applicationId: applicant.applicationId,
      action,
    });
  return { t, first, second, applicant, act };
}

describe("view logging", () => {
  it("does not log when the dashboard is listed, refreshed, or an application is loaded", async () => {
    const { t, first, applicant } = await setup();
    await seedApplicant(t);
    const before = await snapshotReviewState(t);

    for (let i = 0; i < 3; i += 1) {
      await t.query(listSubmittedApplicationsRef, { sessionToken: first.sessionToken });
    }
    await t.query(getApplicationRef, {
      sessionToken: first.sessionToken,
      applicationId: applicant.applicationId,
    });

    expect(await snapshotReviewState(t)).toEqual(before);
  });

  it("logs one viewed event per open without touching review state", async () => {
    const { t, first, applicant, act } = await setup();
    const reviewBefore = await getReview(t, applicant.applicationId);

    const logId = await act(first, "viewed");
    vi.advanceTimersByTime(1_000);
    await act(first, "viewed");

    const logs = await getLogs(t, applicant.applicationId);
    expect(logs.map((log) => log.action)).toEqual(["viewed", "viewed"]);
    expect(logs[0]).toMatchObject({ _id: logId, adminId: first.adminId, createdAt: Date.now() - 1_000 });
    expect(await getReview(t, applicant.applicationId)).toEqual(reviewBefore);
  });

  it.each(["viewed", "started_review"] as const)("rejects %s on a draft application", async (action) => {
    const t = createConvexTest();
    const staff = await seedStaff(t);
    const { applicationId } = await seedApplicant(t, { submitted: false });
    const before = await snapshotReviewState(t);
    await expectAdminErrorCode(
      t.mutation(logApplicationReviewActionRef, { sessionToken: staff.sessionToken, applicationId, action }),
      "APPLICATION_NOT_FOUND",
    );
    expect(await snapshotReviewState(t)).toEqual(before);
  });

  it.each(["viewed", "started_review", "review_ended"] as const)(
    "rejects %s on a deleted application",
    async (action) => {
      const { t, first, applicant, act } = await setup();
      await t.run((ctx) => ctx.db.delete(applicant.applicationId));
      await expectAdminErrorCode(act(first, action), "APPLICATION_NOT_FOUND");
      expect(await countRows(t, "applicationReviewLogs")).toBe(0);
    },
  );

  it("rejects review_ended when there is no review row", async () => {
    const t = createConvexTest();
    const staff = await seedStaff(t);
    const { applicationId } = await seedApplicant(t, { review: null });
    await expect(
      t.mutation(logApplicationReviewActionRef, {
        sessionToken: staff.sessionToken,
        applicationId,
        action: "review_ended",
      }),
    ).rejects.toThrow(/review not found/i);
  });
});

describe("starting a review", () => {
  it("claims the application and logs started_review", async () => {
    const { t, first, applicant, act } = await setup();
    await act(first, "started_review");

    expect(await getReview(t, applicant.applicationId)).toMatchObject({
      status: "under_review",
      reviewedBy: first.adminId,
      startedAt: Date.now(),
      lastActiveAt: Date.now(),
    });
    expect((await getLogs(t, applicant.applicationId)).map((log) => log.action)).toEqual([
      "started_review",
    ]);
  });

  it("does not let a second reviewer silently take over an active review", async () => {
    const { t, first, second, applicant, act } = await setup();
    await act(first, "started_review");
    vi.advanceTimersByTime(ACTIVE_REVIEW_STALE_MS - 1_000);
    const before = await snapshotReviewState(t);

    await expectAdminErrorCode(act(second, "started_review"), "REVIEW_CLAIMED");
    expect(await snapshotReviewState(t)).toEqual(before);
    expect((await getReview(t, applicant.applicationId))?.reviewedBy).toBe(first.adminId);
  });

  it("does not let a second reviewer finalize while the first claim is active", async () => {
    const { t, first, second, applicant, act } = await setup();
    await act(first, "started_review");
    vi.advanceTimersByTime(ACTIVE_REVIEW_STALE_MS - 1_000);

    await expectAdminErrorCode(
      t.mutation(setApplicationDecisionRef, {
        sessionToken: second.sessionToken,
        applicationId: applicant.applicationId,
        decision: "waitlisted",
      }),
      "REVIEW_CLAIMED",
    );
  });

  it("keeps ownership and start time when the same reviewer reopens", async () => {
    const { t, first, applicant, act } = await setup();
    await act(first, "started_review");
    const startedAt = Date.now();
    vi.advanceTimersByTime(60_000);

    await expect(act(first, "started_review")).resolves.toBeNull();

    expect(await getReview(t, applicant.applicationId)).toMatchObject({
      reviewedBy: first.adminId,
      startedAt,
      lastActiveAt: startedAt + 60_000,
    });
    expect(await getLogs(t, applicant.applicationId)).toHaveLength(1);
  });

  it("lets another reviewer take over after the claim goes stale", async () => {
    const { t, first, second, applicant, act } = await setup();
    await act(first, "started_review");
    vi.advanceTimersByTime(ACTIVE_REVIEW_STALE_MS + 1);

    await act(second, "started_review");

    expect(await getReview(t, applicant.applicationId)).toMatchObject({
      reviewedBy: second.adminId,
      startedAt: Date.now(),
    });
    expect((await getLogs(t, applicant.applicationId)).map((log) => log.adminId)).toEqual([
      first.adminId,
      second.adminId,
    ]);
  });

  it("keeps a review active while its reviewer reports activity", async () => {
    const { t, first, second, act } = await setup();
    await act(first, "started_review");
    vi.advanceTimersByTime(ACTIVE_REVIEW_STALE_MS - 1_000);
    await act(first, "review_ended");
    vi.advanceTimersByTime(ACTIVE_REVIEW_STALE_MS - 1_000);

    await expectAdminErrorCode(act(second, "started_review"), "REVIEW_CLAIMED");
    expect(await countRows(t, "applicationReviewLogs")).toBe(2);
  });

  it("creates the review row if one is missing", async () => {
    const t = createConvexTest();
    const staff = await seedStaff(t);
    const { applicationId } = await seedApplicant(t, { review: null });
    await t.mutation(logApplicationReviewActionRef, {
      sessionToken: staff.sessionToken,
      applicationId,
      action: "started_review",
    });
    expect(await getReview(t, applicationId)).toMatchObject({
      status: "under_review",
      reviewedBy: staff.adminId,
    });
  });

  it.each(["accepted", "rejected", "waitlisted", "withdrawn"] as const)(
    "does not reset a %s application",
    async (status) => {
      const t = createConvexTest();
      const staff = await seedStaff(t);
      const { applicationId } = await seedApplicant(t, {
        review: { status, reviewedBy: undefined, completedAt: 5 },
      });
      const before = await snapshotReviewState(t);

      await expectAdminErrorCode(
        t.mutation(logApplicationReviewActionRef, {
          sessionToken: staff.sessionToken,
          applicationId,
          action: "started_review",
        }),
        "REVIEW_FINALIZED",
      );
      expect(await snapshotReviewState(t)).toEqual(before);
    },
  );

  it("does not change applicant data", async () => {
    const { t, first, second, applicant, act } = await setup();
    const before = await snapshotApplicant(t, applicant);
    await act(first, "viewed");
    await act(first, "started_review");
    await expect(act(second, "started_review")).rejects.toThrow();
    await act(first, "review_ended");
    expect(await snapshotApplicant(t, applicant)).toEqual(before);
  });
});

describe("review status shown to organizers", () => {
  it("reports an active claim, then a stale one, on the detail view", async () => {
    const { t, first, second, applicant, act } = await setup();
    await act(first, "started_review");
    const load = () =>
      t.query(getApplicationRef, { sessionToken: second.sessionToken, applicationId: applicant.applicationId });

    expect((await load())?.reviewActivity).toMatchObject({
      reviewedBy: first.adminId,
      currentReviewerName: "First Reviewer",
      isStale: false,
      isFinal: false,
    });
    vi.advanceTimersByTime(ACTIVE_REVIEW_STALE_MS + 1);
    expect((await load())?.reviewActivity.isStale).toBe(true);
  });

  it("shows the current reviewer on the dashboard", async () => {
    const { t, first, act } = await setup();
    await act(first, "started_review");
    const [item] = await t.query(listSubmittedApplicationsRef, { sessionToken: first.sessionToken });
    expect(item).toMatchObject({ reviewStatus: "under_review", currentReviewerName: "First Reviewer" });
  });
});

describe("audit log", () => {
  async function runFullReview(t: ConvexTestInstance, sessionToken: string, applicationId: Parameters<typeof getLogs>[1]) {
    const steps: Array<() => Promise<unknown>> = [
      () => t.mutation(logApplicationReviewActionRef, { sessionToken, applicationId, action: "viewed" }),
      () => t.mutation(logApplicationReviewActionRef, { sessionToken, applicationId, action: "started_review" }),
      () => t.mutation(logApplicationReviewActionRef, { sessionToken, applicationId, action: "review_ended" }),
      () => t.mutation(setApplicationDecisionRef, { sessionToken, applicationId, decision: "accepted" }),
      () => t.mutation(setApplicationDecisionRef, { sessionToken, applicationId, decision: "accepted" }),
      () => t.mutation(logApplicationReviewActionRef, { sessionToken, applicationId, action: "viewed" }),
    ];
    const snapshots = [];
    for (const step of steps) {
      await step();
      vi.advanceTimersByTime(1_000);
      snapshots.push(await getLogs(t, applicationId));
    }
    return snapshots;
  }

  it("only ever appends events; earlier events never change", async () => {
    const { t, first, applicant } = await setup();
    const snapshots = await runFullReview(t, first.sessionToken, applicant.applicationId);

    for (let i = 1; i < snapshots.length; i += 1) {
      const previous = snapshots[i - 1]!;
      expect(snapshots[i]!.slice(0, previous.length)).toEqual(previous);
    }
    expect(snapshots.at(-1)!.map((log) => log.action)).toEqual([
      "viewed",
      "started_review",
      "review_ended",
      "viewed",
    ]);
  });

  it("is readable in full by admins, newest first, with organizer names", async () => {
    const t = createConvexTest();
    const reviewer = await seedStaff(t, { role: "reviewer", name: "Riley Reviewer" });
    const admin = await seedStaff(t, { role: "admin", name: "Avery Admin" });
    const { applicationId } = await seedApplicant(t);
    await runFullReview(t, reviewer.sessionToken, applicationId);

    const history = await t.query(listApplicationReviewLogsRef, {
      sessionToken: admin.sessionToken,
      applicationId,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(history.page.map((event) => event.action)).toEqual([
      "viewed",
      "review_ended",
      "started_review",
      "viewed",
    ]);
    expect(new Set(history.page.map((event) => event.actorName))).toEqual(new Set(["Riley Reviewer"]));
    expect(Object.keys(history.page[0]!).sort()).toEqual(["_id", "action", "actorName", "createdAt"]);
  });

  it("is not readable by the reviewer who wrote it", async () => {
    const { t, first, applicant } = await setup();
    await runFullReview(t, first.sessionToken, applicant.applicationId);
    await expectAdminErrorCode(
      t.query(listApplicationReviewLogsRef, {
        sessionToken: first.sessionToken,
        applicationId: applicant.applicationId,
        paginationOpts: { numItems: 10, cursor: null },
      }),
      "ADMIN_ONLY",
    );
  });
});
