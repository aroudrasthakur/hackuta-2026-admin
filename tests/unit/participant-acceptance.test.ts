import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setApplicationDecisionRef as setDecision } from "../../src/convex/adminApi";
import { createConvexTest, type ConvexTestInstance } from "../helpers/convexTestContext";
import {
  createStaffAuthorizationFixture,
  seedSubmittedApplication,
} from "../helpers/staffTestFixtures";

async function fixture(role: "reviewer" | "admin" = "reviewer") {
  const t = createConvexTest();
  return { t, ...await createStaffAuthorizationFixture(t, role) };
}

async function snapshot(t: ConvexTestInstance) {
  return t.run(async (ctx) => ({
    users: await ctx.db.query("users").collect(),
    reviews: await ctx.db.query("applicationReviews").collect(),
    participants: await ctx.db.query("participants").collect(),
    logs: await ctx.db.query("applicationReviewLogs").collect(),
    emails: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
}

describe("confirmed acceptance participant creation (#17)", () => {
  beforeEach(() => {
    // Inspect scheduled work without executing the real email action.
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it.each(["reviewer", "admin"] as const)(
    "%s confirmation creates one participant, reuses the user, and records acceptance atomically",
    async (role) => {
      const { t, applicationId, adminId, sessionToken } = await fixture(role);
      const before = await snapshot(t);
      const application = await t.run((ctx) => ctx.db.get(applicationId));

      const result = await t.mutation(setDecision, { sessionToken, applicationId, decision: "accepted" });

      const after = await snapshot(t);
      expect(result.duplicate).toBe(false);
      expect(after.users).toEqual(before.users);
      expect(after.participants).toHaveLength(1);
      const participant = after.participants[0];
      const review = after.reviews[0];
      expect(review).toMatchObject({ status: "accepted", reviewedBy: adminId });
      expect(review.completedAt).toBeGreaterThan(1);
      expect(participant).toMatchObject({
        applicationId,
        authUserId: application!.authUserId,
        acceptedBy: adminId,
        acceptedAt: review.completedAt,
        createdAt: review.completedAt,
        updatedAt: review.completedAt,
      });
      expect(participant.qrCodeToken).toMatch(/^[a-f0-9]{64}$/);
      expect(after.logs).toHaveLength(1);
      expect(after.logs[0]).toMatchObject({
        _id: result.logId, applicationId, adminId, action: "accepted", createdAt: review.completedAt,
      });
      expect(after.emails).toHaveLength(1);
      expect(after.emails[0]).toMatchObject({
        name: "admin/sendDecisionEmails:sendDecisionEmail",
        args: [expect.objectContaining({ decision: "accepted", email: application!.email })],
      });
    },
  );

  it("repeated confirmation preserves participant, QR token, attribution, timestamps, log, and email job", async () => {
    const { t, applicationId, sessionToken } = await fixture();
    const first = await t.mutation(setDecision, { sessionToken, applicationId, decision: "accepted" });
    const beforeRetry = await snapshot(t);
    vi.setSystemTime(Date.now() + 1_000);

    const retry = await t.mutation(setDecision, { sessionToken, applicationId, decision: "accepted" });

    expect(retry).toEqual({ logId: first.logId, duplicate: true });
    expect(await snapshot(t)).toEqual(beforeRetry);
  });

  it("different accepted applicants get different QR tokens", async () => {
    const { t, applicationId, sessionToken } = await fixture();
    const secondApplicationId = await seedSubmittedApplication(t, "second@example.com");
    for (const id of [applicationId, secondApplicationId]) {
      await t.mutation(setDecision, { sessionToken, applicationId: id, decision: "accepted" });
    }
    const { participants } = await snapshot(t);
    expect(participants).toHaveLength(2);
    expect(new Set(participants.map((participant) => participant.qrCodeToken)).size).toBe(2);
  });

  it("QR generation failure rolls back the review and audit writes as well as participant creation", async () => {
    const { t, applicationId, sessionToken } = await fixture();
    const before = await snapshot(t);
    vi.spyOn(crypto, "getRandomValues").mockImplementationOnce(() => {
      throw new Error("Random source unavailable");
    });

    await expect(t.mutation(setDecision, {
      sessionToken, applicationId, decision: "accepted",
    })).rejects.toThrow(/random source unavailable/i);

    expect(await snapshot(t)).toEqual(before);
  });

  it.each(["rejected", "waitlisted"] as const)("%s creates no participant", async (decision) => {
    const { t, applicationId, sessionToken } = await fixture();
    const before = await snapshot(t);

    await t.mutation(setDecision, { sessionToken, applicationId, decision });

    const after = await snapshot(t);
    expect(after.participants).toEqual([]);
    expect(after.users).toEqual(before.users);
    expect(after.reviews[0].status).toBe(decision);
  });

  it("reuses an existing matching participant without changing its QR token or metadata", async () => {
    const { t, applicationId, adminId, sessionToken } = await fixture();
    await t.run(async (ctx) => {
      const application = await ctx.db.get(applicationId);
      await ctx.db.insert("participants", {
        applicationId, authUserId: application!.authUserId, acceptedBy: adminId,
        acceptedAt: 10, qrCodeToken: "b".repeat(64), createdAt: 10, updatedAt: 10,
      });
    });
    const before = await snapshot(t);

    await t.mutation(setDecision, { sessionToken, applicationId, decision: "accepted" });

    const after = await snapshot(t);
    expect(after.participants).toEqual(before.participants);
    expect(after.reviews[0].status).toBe("accepted");
    expect(after.logs).toHaveLength(1);
    expect(after.emails).toHaveLength(1);
  });

  it.each(["missing user", "conflicting participant"] as const)(
    "%s aborts acceptance without partial review, audit, participant, or email changes",
    async (failure) => {
      const { t, applicationId, adminId, sessionToken } = await fixture();
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

      await expect(t.mutation(setDecision, {
        sessionToken, applicationId, decision: "accepted",
      })).rejects.toThrow(failure === "missing user"
        ? /APPLICANT_ACCOUNT_MISSING/
        : /authUserId does not match application/i);

      expect(await snapshot(t)).toEqual(before);
    },
  );
});
