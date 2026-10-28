import type { GenericId } from "convex/values";
import { describe, expect, it } from "vitest";
import { hashSessionToken } from "../../convex/admin/staffAuth";
import { listApplicationReviewLogsRef, type ReviewHistoryEvent } from "../../src/convex/adminApi";
import { createConvexTest } from "../helpers/convexTestContext";
import { expectAdminErrorCode } from "../helpers/adminErrors";
const tokens = { admin: "a".repeat(64), other: "b".repeat(64), volunteer: "c".repeat(64) };
const firstPage = { numItems: 25, cursor: null };

async function createFixture() {
  const t = createConvexTest();
  const hashes = {
    admin: await hashSessionToken(tokens.admin),
    other: await hashSessionToken(tokens.other),
    volunteer: await hashSessionToken(tokens.volunteer),
  };
  const ids = await t.run(async (ctx) => {
    const addStaff = async (key: keyof typeof hashes, role: "admin" | "volunteer", name: string) => {
      const adminId = await ctx.db.insert("admins", {
        email: `${key}@hackuta.org`, name, role, active: true, createdAt: 1, updatedAt: 1,
      });
      await ctx.db.insert("adminSessions", {
        adminId, sessionTokenHash: hashes[key], createdAt: Date.now(), expiresAt: Date.now() + 60_000,
      });
      return adminId;
    };
    const adminId = await addStaff("admin", "admin", "Avery Admin");
    const reviewerId = await addStaff("other", "admin", "Riley Reviewer");
    await addStaff("volunteer", "volunteer", "Riley Volunteer");
    const userId = await ctx.db.insert("users", { email: "applicant@example.com" });
    const applicationId = await ctx.db.insert("applications", {
      authUserId: userId, email: "applicant@example.com", createdAt: 1, formSubmitted: true, submittedAt: 2,
    });
    return { adminId, reviewerId, applicationId };
  });
  return { t, ...ids };
}

type Fixture = Awaited<ReturnType<typeof createFixture>>;

async function seedHistory({ t, adminId, reviewerId, applicationId }: Fixture) {
  const events: [GenericId<"admins">, ReviewHistoryEvent["action"], number][] = [
    [reviewerId, "viewed", 300],
    [adminId, "viewed", 100],
    [reviewerId, "started_review", 200],
    [adminId, "accepted", 500],
    [reviewerId, "viewed", 400],
  ];
  await t.run(async (ctx) => {
    for (const [actor, action, createdAt] of events) {
      await ctx.db.insert("applicationReviewLogs", { applicationId, adminId: actor, action, createdAt });
    }
  });
}

const expectedHistory = [
  { actorName: "Avery Admin", action: "accepted", createdAt: 500 },
  { actorName: "Riley Reviewer", action: "viewed", createdAt: 400 },
  { actorName: "Riley Reviewer", action: "viewed", createdAt: 300 },
  { actorName: "Riley Reviewer", action: "started_review", createdAt: 200 },
  { actorName: "Avery Admin", action: "viewed", createdAt: 100 },
];

const withoutIds = (page: ReviewHistoryEvent[]) =>
  page.map(({ actorName, action, createdAt }) => ({ actorName, action, createdAt }));

describe("admin-only application review history", () => {
  it("rejects direct backend requests from volunteer sessions", async () => {
    const fixture = await createFixture();
    await seedHistory(fixture);
    await expectAdminErrorCode(fixture.t.query(listApplicationReviewLogsRef, {
      sessionToken: tokens.volunteer, applicationId: fixture.applicationId, paginationOpts: firstPage,
    }), "NOT_AUTHORIZED");
  });

  it("returns every event newest first with organizer names, scoped to the application", async () => {
    const fixture = await createFixture();
    await seedHistory(fixture);
    const { t, adminId, applicationId } = fixture;
    await t.run(async (ctx) => {
      const otherApplicationId = await ctx.db.insert("applications", {
        authUserId: (await ctx.db.get(applicationId))!.authUserId, email: "other@example.com", createdAt: 1,
      });
      await ctx.db.insert("applicationReviewLogs", {
        applicationId: otherApplicationId, adminId, action: "rejected", createdAt: 150,
      });
    });

    const result = await t.query(listApplicationReviewLogsRef, {
      sessionToken: tokens.admin, applicationId, paginationOpts: firstPage,
    });
    expect(withoutIds(result.page)).toEqual(expectedHistory);
    expect(result.isDone).toBe(true);
  });

  it("keeps newest-first order across pages", async () => {
    const fixture = await createFixture();
    await seedHistory(fixture);
    const events: ReviewHistoryEvent[] = [];
    let cursor: string | null = null;
    do {
      const result = await fixture.t.query(listApplicationReviewLogsRef, {
        sessionToken: tokens.admin, applicationId: fixture.applicationId, paginationOpts: { numItems: 2, cursor },
      });
      events.push(...result.page);
      cursor = result.isDone ? null : result.continueCursor;
    } while (cursor);
    expect(withoutIds(events)).toEqual(expectedHistory);
  });

  it("labels events from removed organizer accounts", async () => {
    const fixture = await createFixture();
    await seedHistory(fixture);
    await fixture.t.run((ctx) => ctx.db.delete(fixture.reviewerId));
    const result = await fixture.t.query(listApplicationReviewLogsRef, {
      sessionToken: tokens.admin, applicationId: fixture.applicationId, paginationOpts: firstPage,
    });
    expect(result.page.map((event) => event.actorName)).toEqual([
      "Avery Admin", "Unknown organizer", "Unknown organizer", "Unknown organizer", "Avery Admin",
    ]);
  });

  it("rejects applications that do not exist", async () => {
    const { t, applicationId } = await createFixture();
    await t.run((ctx) => ctx.db.delete(applicationId));
    await expectAdminErrorCode(t.query(listApplicationReviewLogsRef, {
      sessionToken: tokens.admin, applicationId, paginationOpts: firstPage,
    }), "APPLICATION_NOT_FOUND");
  });
});
