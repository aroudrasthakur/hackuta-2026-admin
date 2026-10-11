import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import type { GenericId } from "convex/values";
import { describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { hashPassword } from "../../convex/admin/passwordHash";
import { ADMIN_SESSION_TTL_MS, hashSessionToken } from "../../convex/admin/staffAuth";

const modules = import.meta.glob("../../convex/**/*.ts", { eager: false });

const ref = {
  signIn: makeFunctionReference<
    "mutation",
    { email: string; password: string },
    { sessionToken: string; expiresAt: number }
  >("admin/auth:signIn"),
  signOut: makeFunctionReference<"mutation", { sessionToken: string }>("admin/auth:signOut"),
  getCurrentStaff: makeFunctionReference<
    "query",
    { sessionToken: string },
    {
      adminId: string;
      email: string;
      name: string;
      role: "reviewer" | "admin";
      expiresAt: number;
    } | null
  >("admin/auth:getCurrentStaff"),
  logApplicationReviewAction: makeFunctionReference<
    "mutation",
    {
      sessionToken: string;
      applicationId: GenericId<"applications">;
      action: "viewed" | "started_review" | "review_ended";
    },
    GenericId<"applicationReviewLogs">
  >("admin/applicationReviewLogs:logApplicationReviewAction"),
  setApplicationDecision: makeFunctionReference<
    "mutation",
    {
      sessionToken: string;
      applicationId: GenericId<"applications">;
      decision: "accepted" | "rejected" | "waitlisted";
    },
    GenericId<"applicationReviewLogs">
  >("admin/applicationReviewLogs:setApplicationDecision"),
  listApplicationReviewLogs: makeFunctionReference<
    "query",
    {
      sessionToken: string;
      applicationId: GenericId<"applications">;
      paginationOpts: { numItems: number; cursor: null };
    },
    { page: unknown[] }
  >("admin/applicationReviewLogs:listApplicationReviewLogs"),
};

const createTest = () => convexTest(schema, modules);
type TestInstance = ReturnType<typeof createTest>;

const TEST_PASSWORD = "SecurePass1";

async function seedAdmin(
  t: TestInstance,
  fields: {
    email: string;
    role: "reviewer" | "admin";
    active: boolean;
    password?: string;
  },
) {
  const adminId = await t.run((ctx) =>
    ctx.db.insert("admins", {
      email: fields.email,
      name: "Test Organizer",
      role: fields.role,
      active: fields.active,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const passwordHash = await hashPassword(fields.password ?? TEST_PASSWORD);
  await t.run((ctx) =>
    ctx.db.insert("adminAuthAccounts", {
      adminId,
      passwordHash,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  return adminId;
}

async function seedApplication(t: TestInstance) {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { email: "applicant@example.com", name: "Applicant" }),
  );
  const applicationId = await t.run((ctx) =>
    ctx.db.insert("applications", {
      authUserId: userId,
      email: "applicant@example.com",
      createdAt: 1,
    }),
  );
  await t.run((ctx) =>
    ctx.db.insert("applicationReviews", {
      applicationId,
      status: "under_review",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  return applicationId;
}

describe("organizer auth boundary", () => {
  it("signs in with valid credentials and resolves staff from session token", async () => {
    const t = createTest();
    await seedAdmin(t, { email: "reviewer@hackuta.org", role: "reviewer", active: true });

    const { sessionToken } = await t.mutation(ref.signIn, {
      email: "reviewer@hackuta.org",
      password: TEST_PASSWORD,
    });

    const staff = await t.query(ref.getCurrentStaff, { sessionToken });
    expect(staff).toMatchObject({
      email: "reviewer@hackuta.org",
      role: "reviewer",
      name: "Test Organizer",
    });
  });

  it("rejects wrong password without revealing account existence details", async () => {
    const t = createTest();
    await seedAdmin(t, { email: "admin@hackuta.org", role: "admin", active: true });

    await expect(
      t.mutation(ref.signIn, { email: "admin@hackuta.org", password: "WrongPass1" }),
    ).rejects.toThrow(/invalid email or password/i);
  });

  it("rejects inactive accounts at sign-in", async () => {
    const t = createTest();
    await seedAdmin(t, { email: "inactive@hackuta.org", role: "admin", active: false });

    await expect(
      t.mutation(ref.signIn, { email: "inactive@hackuta.org", password: TEST_PASSWORD }),
    ).rejects.toThrow(/inactive/i);
  });

  it("returns null for invalid session tokens", async () => {
    const t = createTest();
    const staff = await t.query(ref.getCurrentStaff, { sessionToken: "0".repeat(64) });
    expect(staff).toBeNull();
  });

  it("returns null for expired session tokens", async () => {
    const t = createTest();
    const adminId = await seedAdmin(t, {
      email: "expired@hackuta.org",
      role: "admin",
      active: true,
    });
    const sessionToken = "a".repeat(64);
    const sessionTokenHash = await hashSessionToken(sessionToken);
    await t.run((ctx) =>
      ctx.db.insert("adminSessions", {
        adminId,
        sessionTokenHash,
        expiresAt: Date.now() - 1,
        createdAt: 1,
      }),
    );

    const staff = await t.query(ref.getCurrentStaff, { sessionToken });
    expect(staff).toBeNull();
  });

  it("invalidates previous sessions when the same admin signs in again", async () => {
    const t = createTest();
    await seedAdmin(t, { email: "rotate@hackuta.org", role: "admin", active: true });

    const first = await t.mutation(ref.signIn, {
      email: "rotate@hackuta.org",
      password: TEST_PASSWORD,
    });
    const second = await t.mutation(ref.signIn, {
      email: "rotate@hackuta.org",
      password: TEST_PASSWORD,
    });

    expect(first.sessionToken).not.toEqual(second.sessionToken);
    expect(await t.query(ref.getCurrentStaff, { sessionToken: first.sessionToken })).toBeNull();
    expect(await t.query(ref.getCurrentStaff, { sessionToken: second.sessionToken })).toMatchObject({
      email: "rotate@hackuta.org",
    });
  });

  it("blocks reviewer role from admin-only review history", async () => {
    const t = createTest();
    await seedAdmin(t, { email: "reviewer@hackuta.org", role: "reviewer", active: true });
    const applicationId = await seedApplication(t);
    const { sessionToken } = await t.mutation(ref.signIn, {
      email: "reviewer@hackuta.org",
      password: TEST_PASSWORD,
    });

    await expect(
      t.query(ref.listApplicationReviewLogs, {
        sessionToken,
        applicationId,
        paginationOpts: { numItems: 25, cursor: null },
      }),
    ).rejects.toThrow(/not authorized/i);
  });

  it("allows admin role to read review history", async () => {
    const t = createTest();
    await seedAdmin(t, { email: "admin@hackuta.org", role: "admin", active: true });
    const applicationId = await seedApplication(t);
    const { sessionToken } = await t.mutation(ref.signIn, {
      email: "admin@hackuta.org",
      password: TEST_PASSWORD,
    });

    const page = await t.query(ref.listApplicationReviewLogs, {
      sessionToken,
      applicationId,
      paginationOpts: { numItems: 25, cursor: null },
    });
    expect(page.page).toEqual([]);
  });

  it("requires a valid session for protected organizer mutations", async () => {
    const t = createTest();
    const applicationId = await seedApplication(t);

    await expect(
      t.mutation(ref.logApplicationReviewAction, {
        sessionToken: "deadbeef".repeat(8),
        applicationId,
        action: "viewed",
      }),
    ).rejects.toThrow(/not authenticated/i);
  });

  it("sign-out removes the active session token", async () => {
    const t = createTest();
    await seedAdmin(t, { email: "logout@hackuta.org", role: "admin", active: true });
    const { sessionToken } = await t.mutation(ref.signIn, {
      email: "logout@hackuta.org",
      password: TEST_PASSWORD,
    });

    await t.mutation(ref.signOut, { sessionToken });
    expect(await t.query(ref.getCurrentStaff, { sessionToken })).toBeNull();
  });
});

async function signInAs(t: TestInstance, email: string, role: "reviewer" | "admin" = "reviewer") {
  const adminId = await seedAdmin(t, { email, role, active: true });
  const { sessionToken } = await t.mutation(ref.signIn, { email, password: TEST_PASSWORD });
  return { adminId, sessionToken };
}

async function getReview(t: TestInstance, applicationId: GenericId<"applications">) {
  return t.run((ctx) =>
    ctx.db
      .query("applicationReviews")
      .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
      .unique(),
  );
}

describe("application review state", () => {
  it("does not treat viewing as review activity", async () => {
    const t = createTest();
    const { sessionToken } = await signInAs(t, "viewer@hackuta.org");
    const applicationId = await seedApplication(t);

    await t.mutation(ref.logApplicationReviewAction, {
      sessionToken,
      applicationId,
      action: "viewed",
    });

    const review = await getReview(t, applicationId);
    expect(review?.reviewedBy).toBeUndefined();
    expect(review?.startedAt).toBeUndefined();
    expect(review?.lastActiveAt).toBeUndefined();
    expect(review?.updatedAt).toBe(1);
  });

  it("assigns the session admin and timestamps when a review is started", async () => {
    const t = createTest();
    const { adminId, sessionToken } = await signInAs(t, "starter@hackuta.org");
    const applicationId = await seedApplication(t);

    await t.mutation(ref.logApplicationReviewAction, {
      sessionToken,
      applicationId,
      action: "started_review",
    });

    const review = await getReview(t, applicationId);
    expect(review?.reviewedBy).toBe(adminId);
    expect(review?.startedAt).toBeGreaterThan(1);
    expect(review?.lastActiveAt).toBe(review?.startedAt);
    expect(review?.completedAt).toBeUndefined();
    expect(review?.status).toBe("under_review");
  });

  it("lets another admin take over without resetting startedAt", async () => {
    const t = createTest();
    const first = await signInAs(t, "first@hackuta.org");
    const second = await signInAs(t, "second@hackuta.org");
    const applicationId = await seedApplication(t);

    await t.mutation(ref.logApplicationReviewAction, {
      sessionToken: first.sessionToken,
      applicationId,
      action: "started_review",
    });
    const startedAt = (await getReview(t, applicationId))?.startedAt;

    await t.mutation(ref.logApplicationReviewAction, {
      sessionToken: second.sessionToken,
      applicationId,
      action: "started_review",
    });

    const review = await getReview(t, applicationId);
    expect(review?.reviewedBy).toBe(second.adminId);
    expect(review?.startedAt).toBe(startedAt);
  });

  it("ignores review_ended from an admin who is not the current reviewer", async () => {
    const t = createTest();
    const reviewer = await signInAs(t, "owner@hackuta.org");
    const other = await signInAs(t, "other@hackuta.org");
    const applicationId = await seedApplication(t);

    await t.mutation(ref.logApplicationReviewAction, {
      sessionToken: reviewer.sessionToken,
      applicationId,
      action: "started_review",
    });
    const before = await getReview(t, applicationId);

    await t.mutation(ref.logApplicationReviewAction, {
      sessionToken: other.sessionToken,
      applicationId,
      action: "review_ended",
    });

    const after = await getReview(t, applicationId);
    expect(after?.reviewedBy).toBe(reviewer.adminId);
    expect(after?.lastActiveAt).toBe(before?.lastActiveAt);
  });

  it("records reviewer, completion, and activity on a decision", async () => {
    const t = createTest();
    const { adminId, sessionToken } = await signInAs(t, "decider@hackuta.org");
    const applicationId = await seedApplication(t);

    await t.mutation(ref.setApplicationDecision, {
      sessionToken,
      applicationId,
      decision: "waitlisted",
    });

    const review = await getReview(t, applicationId);
    expect(review).toMatchObject({ status: "waitlisted", reviewedBy: adminId });
    expect(review?.completedAt).toBeGreaterThan(1);
    expect(review?.lastActiveAt).toBe(review?.completedAt);
    expect(review?.startedAt).toBe(review?.completedAt);
  });

  it("sets completedAt and reviewedBy on acceptance", async () => {
    const t = createTest();
    const { adminId, sessionToken } = await signInAs(t, "accepter@hackuta.org");
    const applicationId = await seedApplication(t);

    await t.mutation(ref.setApplicationDecision, {
      sessionToken,
      applicationId,
      decision: "accepted",
    });

    const review = await getReview(t, applicationId);
    expect(review).toMatchObject({ status: "accepted", reviewedBy: adminId });
    expect(review?.completedAt).toBeGreaterThan(1);
  });

  it("rejects review mutations without a valid admin session", async () => {
    const t = createTest();
    const applicationId = await seedApplication(t);

    await expect(
      t.mutation(ref.setApplicationDecision, {
        sessionToken: "deadbeef".repeat(8),
        applicationId,
        decision: "accepted",
      }),
    ).rejects.toThrow(/not authenticated/i);
    expect((await getReview(t, applicationId))?.reviewedBy).toBeUndefined();
  });
});

describe("organizer session lifetime", () => {
  it("uses a 24-hour session TTL", () => {
    expect(ADMIN_SESSION_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});
