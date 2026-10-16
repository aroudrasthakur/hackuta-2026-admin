import { beforeEach, describe, expect, it } from "vitest";
import { hashSessionToken } from "../../convex/admin/staffAuth";
import { listSubmittedApplicationsRef } from "../../src/convex/adminApi";
import { createConvexTest } from "../helpers/convexTestContext";

const sessionToken = "a".repeat(64);

async function createFixture(role: "reviewer" | "admin" = "reviewer") {
  const t = createConvexTest();
  const sessionTokenHash = await hashSessionToken(sessionToken);
  const records = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("admins", {
      email: "staff@hackuta.org",
      name: "Jordan Reviewer",
      role,
      active: true,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("adminSessions", {
      adminId,
      sessionTokenHash,
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    });
    const draftUser = await ctx.db.insert("users", { email: "draft@example.com" });
    await ctx.db.insert("applications", {
      authUserId: draftUser,
      email: "draft@example.com",
      createdAt: 1,
      firstName: "Draft",
      lastName: "Only",
    });
    const submittedUser = await ctx.db.insert("users", { email: "taylor@example.com" });
    const submittedId = await ctx.db.insert("applications", {
      authUserId: submittedUser,
      email: "taylor@example.com",
      createdAt: 1,
      formSubmitted: true,
      submittedAt: 100,
      firstName: "Taylor",
      lastName: "Student",
      school: "Example University",
    });
    const reviewedUser = await ctx.db.insert("users", { email: "sam@example.com" });
    const reviewedId = await ctx.db.insert("applications", {
      authUserId: reviewedUser,
      email: "sam@example.com",
      createdAt: 1,
      submittedAt: 200,
      firstName: "Sam",
      lastName: "Lee",
      school: "Other (Please Specify)",
      otherSchool: "Community College",
    });
    await ctx.db.insert("applicationReviews", {
      applicationId: reviewedId,
      status: "under_review",
      reviewedBy: adminId,
      createdAt: 1,
      updatedAt: 1,
    });
    return { adminId, submittedId, reviewedId };
  });
  return { t, ...records };
}

describe("submitted applications dashboard query", () => {
  let fixture: Awaited<ReturnType<typeof createFixture>>;
  beforeEach(async () => {
    fixture = await createFixture();
  });

  it.each(["reviewer", "admin"] as const)("lists only submitted applications for %s", async (role) => {
    const { t, adminId, submittedId, reviewedId } = fixture;
    await t.run((ctx) => ctx.db.patch(adminId, { role }));
    const list = await t.query(listSubmittedApplicationsRef, { sessionToken });
    expect(list.map((item) => item.applicationId)).toEqual([reviewedId, submittedId]);
    expect(list[0]).toMatchObject({
      applicantName: "Sam Lee",
      school: "Community College",
      reviewStatus: "under_review",
      currentReviewerName: "Jordan Reviewer",
    });
    expect(list[1]).toMatchObject({
      applicantName: "Taylor Student",
      reviewStatus: null,
      currentReviewerName: null,
    });
  });

  it("does not append review logs when listing the dashboard", async () => {
    const { t } = fixture;
    await t.query(listSubmittedApplicationsRef, { sessionToken });
    expect(await t.run((ctx) => ctx.db.query("applicationReviewLogs").collect())).toEqual([]);
  });

  it("includes claim expiration while distinguishing new unassigned submissions", async () => {
    const { t, submittedId, reviewedId, adminId } = fixture;
    await t.run((ctx) => ctx.db.insert("applicationReviews", {
      applicationId: submittedId, status: "under_review", createdAt: Date.now(), updatedAt: Date.now(),
    }));
    const list = await t.query(listSubmittedApplicationsRef, { sessionToken });
    expect(list.find((item) => item.applicationId === submittedId)?.reviewClaim).toBeUndefined();
    expect(list.find((item) => item.applicationId === reviewedId)?.reviewClaim).toEqual({ reviewedBy: adminId, expiresAt: 1 + 30 * 60_000 });
  });
});
