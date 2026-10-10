import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { hashSessionToken } from "../../convex/admin/staffAuth";
import { getApplicationRef } from "../../src/convex/adminApi";

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
