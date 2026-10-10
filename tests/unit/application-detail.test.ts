import { convexTest } from "convex-test";
import { makeFunctionReference, type FunctionArgs, type FunctionReturnType } from "convex/server";
import { describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import type { getApplication } from "../../convex/admin/applications";
import { hashSessionToken } from "../../convex/admin/staffAuth";

const modules = import.meta.glob("../../convex/**/*.ts", { eager: false });
const createTest = () => convexTest(schema, modules);
type TestInstance = ReturnType<typeof createTest>;
const detailRef = makeFunctionReference<
  "query", FunctionArgs<typeof getApplication>, FunctionReturnType<typeof getApplication>
>("admin/applications:getApplication");
const sessionToken = "a".repeat(64);

async function seedStaff(t: TestInstance, role: "reviewer" | "admin" = "reviewer") {
  const sessionTokenHash = await hashSessionToken(sessionToken);
  return t.run(async (ctx) => {
    const adminId = await ctx.db.insert("admins", {
      email: "staff@hackuta.org", name: "Staff", role, active: true,
      createdAt: 1, updatedAt: 1,
    });
    const sessionId = await ctx.db.insert("adminSessions", {
      adminId, sessionTokenHash, createdAt: Date.now(), expiresAt: Date.now() + 60_000,
    });
    return { adminId, sessionId };
  });
}

async function seedApplication(t: TestInstance) {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "applicant@example.com" });
    const applicationId = await ctx.db.insert("applications", {
      authUserId: userId, email: "applicant@example.com", createdAt: 1,
      formSubmitted: true, submittedAt: 2, firstName: "Taylor", lastName: "Student",
      builtOrWantToBuild: "My project", shortDeadlineLearning: "My experience",
    });
    return { userId, applicationId };
  });
}

describe("read-only submitted application detail", () => {
  it.each(["reviewer", "admin"] as const)("allows active %s accounts without writes or history", async (role) => {
    const t = createTest();
    const { adminId } = await seedStaff(t, role);
    const { applicationId } = await seedApplication(t);
    await t.run(async (ctx) => {
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
      const detail = await t.query(detailRef, { sessionToken, applicationId });
      expect(detail).toEqual({
        application: before.application, reviewStatus: "accepted",
        resume: { status: "none", url: null, filename: null },
      });
    }
    expect(await snapshot()).toEqual(before);
  });

  it("returns submitted applications without creating a missing review record", async () => {
    const t = createTest();
    await seedStaff(t);
    const { applicationId } = await seedApplication(t);
    const detail = await t.query(detailRef, { sessionToken, applicationId });
    expect(detail?.reviewStatus).toBeNull();
    expect(await t.run((ctx) => ctx.db.query("applicationReviews").collect())).toEqual([]);
  });

  it("recognizes legacy submission timestamps and rejects drafts", async () => {
    const t = createTest();
    await seedStaff(t);
    const { applicationId } = await seedApplication(t);
    await t.run((ctx) => ctx.db.patch(applicationId, { formSubmitted: undefined }));
    expect(await t.query(detailRef, { sessionToken, applicationId })).not.toBeNull();
    await t.run((ctx) => ctx.db.patch(applicationId, { submittedAt: undefined }));
    expect(await t.query(detailRef, { sessionToken, applicationId })).toBeNull();
    await t.run((ctx) => ctx.db.patch(applicationId, { formSubmitted: true }));
    expect(await t.query(detailRef, { sessionToken, applicationId })).not.toBeNull();
  });

  it("returns not found for malformed, wrong-table, and deleted IDs", async () => {
    const t = createTest();
    await seedStaff(t);
    const { userId, applicationId } = await seedApplication(t);
    await t.run((ctx) => ctx.db.delete(applicationId));
    for (const id of ["", "bad-id", userId, applicationId]) {
      expect(await t.query(detailRef, { sessionToken, applicationId: id })).toBeNull();
    }
  });

  it.each(["missing", "fake", "expired", "revoked", "orphaned", "inactive"] as const)(
    "rejects %s staff sessions before returning application data", async (condition) => {
      const t = createTest();
      const { adminId, sessionId } = await seedStaff(t);
      const { applicationId } = await seedApplication(t);
      await t.run(async (ctx) => {
        if (condition === "expired") await ctx.db.patch(sessionId, { expiresAt: Date.now() - 1 });
        if (condition === "revoked") await ctx.db.delete(sessionId);
        if (condition === "orphaned") await ctx.db.delete(adminId);
        if (condition === "inactive") await ctx.db.patch(adminId, { active: false });
      });
      const token = condition === "missing" ? "" : condition === "fake" ? "b".repeat(64) : sessionToken;
      await expect(t.query(detailRef, { sessionToken: token, applicationId })).rejects.toThrow(/not authenticated/i);
    },
  );

  it("rejects applicant identity even with a matching staff email", async () => {
    const t = createTest();
    const { adminId } = await seedStaff(t, "admin");
    const { userId, applicationId } = await seedApplication(t);
    await t.run((ctx) => ctx.db.patch(adminId, { email: "applicant@example.com" }));
    const applicant = t.withIdentity({ subject: userId, email: "applicant@example.com" });
    await expect(applicant.query(detailRef, { sessionToken: "", applicationId })).rejects.toThrow(/not authenticated/i);
  });

  it("resolves an attached resume and distinguishes a deleted file", async () => {
    const t = createTest();
    await seedStaff(t);
    const { applicationId } = await seedApplication(t);
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["resume"], { type: "application/pdf" })));
    await t.run((ctx) => ctx.db.patch(applicationId, { resumeStorageId: storageId, resumeFilename: "resume.pdf" }));
    const detail = await t.query(detailRef, { sessionToken, applicationId });
    expect(detail?.resume).toMatchObject({ status: "available", filename: "resume.pdf" });
    expect(detail?.resume.url).toEqual(expect.any(String));
    await t.run((ctx) => ctx.storage.delete(storageId));
    const missing = await t.query(detailRef, { sessionToken, applicationId });
    expect(missing?.resume).toEqual({ status: "missing", url: null, filename: "resume.pdf" });
    expect(missing?.application.resumeStorageId).toBe(storageId);
  });
});
