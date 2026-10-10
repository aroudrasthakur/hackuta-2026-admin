import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { hashSessionToken } from "../../convex/admin/staffAuth";
import { getApplicationRef, logApplicationReviewActionRef } from "../../src/convex/adminApi";

const modules = import.meta.glob("../../convex/**/*.ts", { eager: false });
const sessionToken = "a".repeat(64);

async function createFixture() {
  const t = convexTest(schema, modules);
  const sessionTokenHash = await hashSessionToken(sessionToken);
  const records = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("admins", {
      email: "staff@hackuta.org", name: "Staff", role: "reviewer", active: true,
      createdAt: 1, updatedAt: 1,
    });
    const sessionId = await ctx.db.insert("adminSessions", {
      adminId, sessionTokenHash, createdAt: Date.now(), expiresAt: Date.now() + 60_000,
    });
    const userId = await ctx.db.insert("users", { email: "applicant@example.com" });
    const applicationId = await ctx.db.insert("applications", {
      authUserId: userId, email: "applicant@example.com", createdAt: 1,
      formSubmitted: true, submittedAt: 2, firstName: "Taylor", lastName: "Student",
      builtOrWantToBuild: "My project", shortDeadlineLearning: "My experience",
    });
    return { adminId, sessionId, userId, applicationId };
  });
  return { t, ...records };
}

describe("read-only submitted application detail", () => {
  let fixture: Awaited<ReturnType<typeof createFixture>>;
  beforeEach(async () => { fixture = await createFixture(); });

  it.each(["reviewer", "admin"] as const)("records repeated %s views without claiming or changing the application", async (role) => {
    const { t, adminId, applicationId } = fixture;
    await t.run((ctx) => ctx.db.patch(adminId, { role }));
    const before = await t.run((ctx) => ctx.db.get(applicationId));
    const earliest = Date.now();
    const ids = [];
    for (let visit = 0; visit < 2; visit++) {
      ids.push(await t.mutation(logApplicationReviewActionRef, { sessionToken, applicationId, action: "viewed" }));
    }
    expect(ids[0]).not.toBe(ids[1]);
    const latest = Date.now();
    const logs = await t.run((ctx) => ctx.db.query("applicationReviewLogs").collect());
    expect(logs).toHaveLength(2);
    for (const log of logs) {
      expect(log).toMatchObject({ applicationId, adminId, action: "viewed" });
      expect(log.createdAt).toBeGreaterThanOrEqual(earliest);
      expect(log.createdAt).toBeLessThanOrEqual(latest);
    }
    expect(await t.run((ctx) => ctx.db.get(applicationId))).toEqual(before);
    expect(await t.run((ctx) => ctx.db.query("applicationReviews").collect())).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("participants").collect())).toEqual([]);
  });

  it("keeps separate reviewers' views and preserves existing review state", async () => {
    const { t, adminId, applicationId } = fixture;
    const otherToken = "b".repeat(64);
    const sessionTokenHash = await hashSessionToken(otherToken);
    const { otherAdminId, reviewId } = await t.run(async (ctx) => {
      const otherAdminId = await ctx.db.insert("admins", {
        email: "other@hackuta.org", name: "Other", role: "reviewer", active: true, createdAt: 1, updatedAt: 1,
      });
      await ctx.db.insert("adminSessions", {
        adminId: otherAdminId, sessionTokenHash, createdAt: 1, expiresAt: Date.now() + 60_000,
      });
      const reviewId = await ctx.db.insert("applicationReviews", {
        applicationId, status: "under_review", reviewedByAdmin: adminId, createdAt: 1, updatedAt: 1,
      });
      return { otherAdminId, reviewId };
    });
    const before = await t.run((ctx) => ctx.db.get(reviewId));
    for (const token of [sessionToken, otherToken]) {
      await t.mutation(logApplicationReviewActionRef, { sessionToken: token, applicationId, action: "viewed" });
    }
    const logs = await t.run((ctx) => ctx.db.query("applicationReviewLogs").collect());
    expect(logs.map((log) => log.adminId)).toEqual([adminId, otherAdminId]);
    expect(await t.run((ctx) => ctx.db.get(reviewId))).toEqual(before);
  });

  it("rejects malformed, wrong-table, deleted, and draft applications without logging", async () => {
    const { t, applicationId, userId } = fixture;
    await t.run((ctx) => ctx.db.patch(applicationId, { formSubmitted: undefined, submittedAt: undefined }));
    for (const id of ["bad-id", userId, applicationId]) {
      await expect(t.mutation(logApplicationReviewActionRef, {
        sessionToken, applicationId: id as typeof applicationId, action: "viewed",
      })).rejects.toThrow();
    }
    await t.run((ctx) => ctx.db.delete(applicationId));
    await expect(t.mutation(logApplicationReviewActionRef, {
      sessionToken, applicationId, action: "viewed",
    })).rejects.toThrow(/application not found/i);
    expect(await t.run((ctx) => ctx.db.query("applicationReviewLogs").collect())).toEqual([]);
  });

  it.each(["reviewer", "admin"] as const)("allows active %s accounts without writes or history", async (role) => {
    const { t, adminId, applicationId } = fixture;
    await t.run(async (ctx) => {
      await ctx.db.patch(adminId, { role });
      await ctx.db.insert("applicationReviews", {
        applicationId, status: "accepted", reviewedByAdmin: adminId, createdAt: 2, updatedAt: 3,
      });
      await ctx.db.insert("applicationReviewLogs", {
        applicationId, adminId, action: "accepted", createdAt: 3,
      });
    });
    const snapshot = () => t.run(async (ctx) => ({
      application: await ctx.db.get(applicationId),
      reviews: await ctx.db.query("applicationReviews").collect(),
      logs: await ctx.db.query("applicationReviewLogs").collect(),
      participants: await ctx.db.query("participants").collect(),
    }));
    const before = await snapshot();
    for (let read = 0; read < 2; read++) {
      const detail = await t.query(getApplicationRef, { sessionToken, applicationId });
      expect(detail).toEqual({
        application: before.application, reviewStatus: "accepted",
        resume: { status: "none", url: null, filename: null },
      });
    }
    expect(await snapshot()).toEqual(before);
  });

  it("returns submitted applications without creating a missing review record", async () => {
    const { t, applicationId } = fixture;
    const detail = await t.query(getApplicationRef, { sessionToken, applicationId });
    expect(detail?.reviewStatus).toBeNull();
    expect(await t.run((ctx) => ctx.db.query("applicationReviews").collect())).toEqual([]);
  });

  it("recognizes legacy submission timestamps and rejects drafts", async () => {
    const { t, applicationId } = fixture;
    await t.run((ctx) => ctx.db.patch(applicationId, { formSubmitted: undefined }));
    expect(await t.query(getApplicationRef, { sessionToken, applicationId })).not.toBeNull();
    await t.run((ctx) => ctx.db.patch(applicationId, { submittedAt: undefined }));
    expect(await t.query(getApplicationRef, { sessionToken, applicationId })).toBeNull();
    await t.run((ctx) => ctx.db.patch(applicationId, { formSubmitted: true }));
    expect(await t.query(getApplicationRef, { sessionToken, applicationId })).not.toBeNull();
  });

  it("returns not found for malformed, wrong-table, and deleted IDs", async () => {
    const { t, userId, applicationId } = fixture;
    await t.run((ctx) => ctx.db.delete(applicationId));
    for (const id of ["", "bad-id", userId, applicationId]) {
      expect(await t.query(getApplicationRef, { sessionToken, applicationId: id })).toBeNull();
    }
  });

  it.each(["missing", "fake", "expired", "revoked", "orphaned", "inactive"] as const)(
    "rejects %s staff sessions before returning application data", async (condition) => {
      const { t, adminId, sessionId, applicationId } = fixture;
      await t.run(async (ctx) => {
        if (condition === "expired") await ctx.db.patch(sessionId, { expiresAt: Date.now() - 1 });
        if (condition === "revoked") await ctx.db.delete(sessionId);
        if (condition === "orphaned") await ctx.db.delete(adminId);
        if (condition === "inactive") await ctx.db.patch(adminId, { active: false });
      });
      const token = condition === "missing" ? "" : condition === "fake" ? "b".repeat(64) : sessionToken;
      await expect(t.query(getApplicationRef, { sessionToken: token, applicationId })).rejects.toThrow(/not authenticated/i);
    },
  );

  it("rejects applicant identity even with a matching staff email", async () => {
    const { t, adminId, userId, applicationId } = fixture;
    await t.run((ctx) => ctx.db.patch(adminId, { role: "admin", email: "applicant@example.com" }));
    const applicant = t.withIdentity({ subject: userId, email: "applicant@example.com" });
    await expect(applicant.query(getApplicationRef, { sessionToken: "", applicationId })).rejects.toThrow(/not authenticated/i);
  });

  it("resolves an attached resume and distinguishes a deleted file", async () => {
    const { t, applicationId } = fixture;
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["resume"], { type: "application/pdf" })));
    await t.run((ctx) => ctx.db.patch(applicationId, { resumeStorageId: storageId, resumeFilename: "resume.pdf" }));
    const detail = await t.query(getApplicationRef, { sessionToken, applicationId });
    expect(detail?.resume).toMatchObject({ status: "available", filename: "resume.pdf" });
    expect(detail?.resume.url).toEqual(expect.any(String));
    await t.run((ctx) => ctx.storage.delete(storageId));
    const missing = await t.query(getApplicationRef, { sessionToken, applicationId });
    expect(missing?.resume).toEqual({ status: "missing", url: null, filename: "resume.pdf" });
    expect(missing?.application.resumeStorageId).toBe(storageId);
  });
});
