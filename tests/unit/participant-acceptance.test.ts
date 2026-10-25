import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { releaseDecisionEmailsRef, setApplicationDecisionRef as setDecision } from "../../src/convex/adminApi";
import "../../convex/admin/decisionEmailRelease";
import "../../convex/admin/sendDecisionEmails";
import { createConvexTest, type ConvexTestInstance } from "../helpers/convexTestContext";
import {
  createStaffAuthorizationFixture,
  seedSubmittedApplication,
} from "../helpers/staffTestFixtures";
import { stubEmailService } from "../helpers/reviewTestKit";

async function fixture(role: "reviewer" | "admin" = "admin") {
  const t = createConvexTest();
  return { t, ...await createStaffAuthorizationFixture(t, role) };
}

async function snapshot(t: ConvexTestInstance) {
  return t.run(async (ctx) => ({
    users: await ctx.db.query("users").collect(),
    reviews: await ctx.db.query("applicationReviews").collect(),
    participants: await ctx.db.query("participants").collect(),
    logs: await ctx.db.query("applicationReviewLogs").collect(),
    queue: await ctx.db.query("decisionEmailQueue").collect(),
  }));
}

async function release(t: ConvexTestInstance, sessionToken: string) {
  return t.action(releaseDecisionEmailsRef, { sessionToken });
}

describe("confirmed acceptance participant creation (#17)", () => {
  beforeEach(() => {
    stubEmailService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each(["reviewer", "admin"] as const)(
    "%s confirmation queues acceptance without a participant or email job",
    async (role) => {
      const { t, applicationId, adminId, sessionToken } = await fixture(role);
      const before = await snapshot(t);

      const result = await t.mutation(setDecision, { sessionToken, applicationId, decision: "accepted" });

      const after = await snapshot(t);
      expect(result).toEqual({ queued: true, duplicate: false });
      expect(after.users).toEqual(before.users);
      expect(after.participants).toEqual([]);
      expect(after.reviews).toEqual(before.reviews);
      expect(after.logs).toEqual([]);
      expect(after.queue).toHaveLength(1);
      expect(after.queue[0]).toMatchObject({
        applicationId,
        decision: "accepted",
        status: "queued",
        queuedBy: adminId,
      });
    },
  );

  it("creates one participant only after the acceptance email is accepted", async () => {
    const { t, applicationId, adminId, sessionToken } = await fixture("admin");
    await t.run(async (ctx) => {
      await ctx.db.patch(applicationId, { dietaryRestrictions: ["Vegetarian"] });
    });
    const application = await t.run((ctx) => ctx.db.get(applicationId));
    await t.mutation(setDecision, { sessionToken, applicationId, decision: "accepted" });

    const result = await release(t, sessionToken);

    const after = await snapshot(t);
    expect(result).toEqual({ sent: 1, failed: 0, total: 1 });
    const participant = after.participants[0];
    const review = after.reviews[0];
    expect(review).toMatchObject({ status: "accepted", reviewedBy: adminId });
    expect(review?.completedAt).toBeGreaterThan(1);
    expect(participant).toMatchObject({
      applicationId,
      authUserId: application!.authUserId,
      acceptedBy: adminId,
      acceptedAt: review?.completedAt,
      foodRestriction: "Vegetarian",
      points: 0,
    });
    expect(participant?.createdAt).toBeGreaterThanOrEqual(review?.completedAt ?? 0);
    expect(participant?.updatedAt).toBe(participant?.createdAt);
    expect(participant?.qrCodeToken).toMatch(/^[a-f0-9]{64}$/);
    expect(after.logs).toHaveLength(1);
    expect(after.logs[0]).toMatchObject({
      applicationId, adminId, action: "accepted", createdAt: review?.completedAt,
    });
    expect(after.queue[0]).toMatchObject({ status: "sent" });
  });

  it("repeated confirmation before release does not create a participant", async () => {
    const { t, applicationId, sessionToken } = await fixture();
    const first = await t.mutation(setDecision, { sessionToken, applicationId, decision: "accepted" });
    const beforeRetry = await snapshot(t);

    const retry = await t.mutation(setDecision, { sessionToken, applicationId, decision: "accepted" });

    expect(first).toEqual({ queued: true, duplicate: false });
    expect(retry).toEqual({ queued: true, duplicate: true });
    expect(await snapshot(t)).toEqual(beforeRetry);
    expect((await snapshot(t)).participants).toEqual([]);
  });

  it("different accepted applicants get different QR tokens after release", async () => {
    const { t, applicationId, sessionToken } = await fixture();
    const secondApplicationId = await seedSubmittedApplication(t, "second@example.com");
    for (const id of [applicationId, secondApplicationId]) {
      await t.mutation(setDecision, { sessionToken, applicationId: id, decision: "accepted" });
    }

    await release(t, sessionToken);

    const { participants } = await snapshot(t);
    expect(participants).toHaveLength(2);
    expect(new Set(participants.map((participant) => participant.qrCodeToken)).size).toBe(2);
  });

  it("leaves the review unpublished when QR generation fails during release", async () => {
    const { t, applicationId, sessionToken } = await fixture();
    await t.mutation(setDecision, { sessionToken, applicationId, decision: "accepted" });
    const before = await snapshot(t);
    vi.spyOn(crypto, "getRandomValues").mockImplementationOnce(() => {
      throw new Error("Random source unavailable");
    });

    await expect(release(t, sessionToken)).resolves.toEqual({ sent: 0, failed: 1, total: 1 });

    const after = await snapshot(t);
    expect(after.reviews).toEqual(before.reviews);
    expect(after.participants).toEqual([]);
    expect(after.logs).toEqual([]);
    expect(after.queue[0]).toMatchObject({
      status: "failed",
      errorMessage: expect.stringMatching(/random source unavailable/i),
    });
  });

  it.each(["rejected", "waitlisted"] as const)("%s release creates no participant", async (decision) => {
    const { t, applicationId, sessionToken } = await fixture();
    await t.mutation(setDecision, { sessionToken, applicationId, decision });

    await release(t, sessionToken);

    const after = await snapshot(t);
    expect(after.participants).toEqual([]);
    expect(after.reviews[0]?.status).toBe(decision);
    expect(after.logs).toHaveLength(1);
  });

  it("reuses an existing matching participant without changing its QR token", async () => {
    const { t, applicationId, adminId, sessionToken } = await fixture();
    await t.run(async (ctx) => {
      const application = await ctx.db.get(applicationId);
      await ctx.db.insert("participants", {
        applicationId, authUserId: application!.authUserId, acceptedBy: adminId,
        acceptedAt: 10, qrCodeToken: "b".repeat(64), createdAt: 10, updatedAt: 10,
      });
    });
    await t.mutation(setDecision, { sessionToken, applicationId, decision: "accepted" });
    const before = await snapshot(t);

    await release(t, sessionToken);

    const after = await snapshot(t);
    expect(after.participants).toEqual(before.participants);
    expect(after.reviews[0]?.status).toBe("accepted");
    expect(after.logs).toHaveLength(1);
    expect(after.queue[0]).toMatchObject({ status: "sent" });
  });

  it.each(["missing user", "conflicting participant"] as const)(
    "%s leaves the review unpublished when release cannot create the participant",
    async (failure) => {
      const { t, applicationId, adminId, sessionToken } = await fixture();
      await t.mutation(setDecision, { sessionToken, applicationId, decision: "accepted" });
      await t.run(async (ctx) => {
        const application = await ctx.db.get(applicationId);
        if (failure === "missing user") {
          await ctx.db.delete(application!.authUserId);
        } else {
          const otherUserId = await ctx.db.insert("users", { email: "other@example.com" });
          await ctx.db.insert("participants", {
            applicationId, authUserId: otherUserId, acceptedBy: adminId,
            acceptedAt: 10, qrCodeToken: "c".repeat(64), createdAt: 10, updatedAt: 10,
          });
        }
      });
      const before = await snapshot(t);

      await expect(release(t, sessionToken)).resolves.toMatchObject({ sent: 0, failed: 1, total: 1 });

      const after = await snapshot(t);
      expect(after.reviews).toEqual(before.reviews);
      expect(after.logs).toEqual(before.logs);
      expect(after.participants).toEqual(before.participants);
      expect(after.queue[0]?.status).toBe("failed");
    },
  );
});
