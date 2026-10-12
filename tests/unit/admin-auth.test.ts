import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import type { GenericId } from "convex/values";
import { describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { hashPassword } from "../../convex/admin/passwordHash";
import {
  ADMIN_SESSION_TTL_MS,
  getCurrentAdmin,
  hashSessionToken,
} from "../../convex/admin/staffAuth";

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
    { logId: GenericId<"applicationReviewLogs">; duplicate: boolean }
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

async function seedApplication(t: TestInstance, email = "applicant@example.com") {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { email, name: "Applicant" }),
  );
  const applicationId = await t.run((ctx) =>
    ctx.db.insert("applications", {
      authUserId: userId,
      email,
      createdAt: 1,
      formSubmitted: true,
      submittedAt: 2,
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

async function createAuthorizationFixture(role: "reviewer" | "admin" = "reviewer") {
  const t = createTest();
  const sessionToken = "a".repeat(64);
  const sessionTokenHash = await hashSessionToken(sessionToken);
  const records = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("admins", {
      email: "staff@hackuta.org", name: "Test Organizer", role, active: true,
      createdAt: 1, updatedAt: 1,
    });
    const sessionId = await ctx.db.insert("adminSessions", {
      adminId, sessionTokenHash, createdAt: Date.now(), expiresAt: Date.now() + 60_000,
    });
    return { adminId, sessionId };
  });
  return { t, ...records, sessionToken, applicationId: await seedApplication(t) };
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

  it("creates the review row when claiming an application with no review record", async () => {
    const t = createTest();
    const { adminId, sessionToken } = await signInAs(t, "creator@hackuta.org");
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: "solo@example.com", name: "Applicant" }),
    );
    const applicationId = await t.run((ctx) =>
      ctx.db.insert("applications", {
        authUserId: userId,
        email: "solo@example.com",
        createdAt: 1,
        formSubmitted: true,
        submittedAt: 2,
      }),
    );

    await t.mutation(ref.logApplicationReviewAction, {
      sessionToken,
      applicationId,
      action: "started_review",
    });

    const review = await getReview(t, applicationId);
    expect(review).toMatchObject({
      status: "under_review",
      reviewedBy: adminId,
    });
    expect(review?.startedAt).toBeGreaterThan(1);
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

  it("rejects a second reviewer while the first review is still active", async () => {
    const t = createTest();
    const first = await signInAs(t, "first@hackuta.org");
    const second = await signInAs(t, "second@hackuta.org");
    const applicationId = await seedApplication(t);

    await t.mutation(ref.logApplicationReviewAction, {
      sessionToken: first.sessionToken,
      applicationId,
      action: "started_review",
    });

    await expect(
      t.mutation(ref.logApplicationReviewAction, {
        sessionToken: second.sessionToken,
        applicationId,
        action: "started_review",
      }),
    ).rejects.toThrow(/already being reviewed/i);

    const review = await getReview(t, applicationId);
    expect(review?.reviewedBy).toBe(first.adminId);
    expect(await t.run((ctx) => ctx.db.query("applicationReviewLogs").collect())).toHaveLength(1);
  });

  it("allows reclaiming a stale review and resets startedAt", async () => {
    const t = createTest();
    const first = await signInAs(t, "first@hackuta.org");
    const second = await signInAs(t, "second@hackuta.org");
    const applicationId = await seedApplication(t);

    await t.mutation(ref.logApplicationReviewAction, {
      sessionToken: first.sessionToken,
      applicationId,
      action: "started_review",
    });
    const originalStartedAt = (await getReview(t, applicationId))?.startedAt;

    await t.run(async (ctx) => {
      const review = await ctx.db
        .query("applicationReviews")
        .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
        .unique();
      if (!review) throw new Error("missing review");
      await ctx.db.patch(review._id, {
        lastActiveAt: Date.now() - 31 * 60 * 1000,
      });
    });

    await t.mutation(ref.logApplicationReviewAction, {
      sessionToken: second.sessionToken,
      applicationId,
      action: "started_review",
    });

    const review = await getReview(t, applicationId);
    expect(review?.reviewedBy).toBe(second.adminId);
    expect(review?.startedAt).toBeGreaterThan(originalStartedAt!);
    expect(await t.run((ctx) => ctx.db.query("applicationReviewLogs").collect())).toHaveLength(2);
  });

  it("refreshes activity without a duplicate started_review log for the same reviewer", async () => {
    const t = createTest();
    const { adminId, sessionToken } = await signInAs(t, "owner@hackuta.org");
    const applicationId = await seedApplication(t);

    await t.mutation(ref.logApplicationReviewAction, {
      sessionToken,
      applicationId,
      action: "started_review",
    });
    const before = await getReview(t, applicationId);

    await t.mutation(ref.logApplicationReviewAction, {
      sessionToken,
      applicationId,
      action: "started_review",
    });

    const after = await getReview(t, applicationId);
    expect(after?.reviewedBy).toBe(adminId);
    expect(after?.startedAt).toBe(before?.startedAt);
    if (before?.lastActiveAt === undefined || after?.lastActiveAt === undefined) {
      throw new Error("expected review activity timestamps");
    }
    expect(after.lastActiveAt).toBeGreaterThanOrEqual(before.lastActiveAt);
    expect(await t.run((ctx) => ctx.db.query("applicationReviewLogs").collect())).toHaveLength(1);
  });

  it("rejects starting review after a final decision", async () => {
    const t = createTest();
    const { sessionToken } = await signInAs(t, "decider@hackuta.org");
    const applicationId = await seedApplication(t);

    await t.mutation(ref.setApplicationDecision, {
      sessionToken,
      applicationId,
      decision: "accepted",
    });

    await expect(
      t.mutation(ref.logApplicationReviewAction, {
        sessionToken,
        applicationId,
        action: "started_review",
      }),
    ).rejects.toThrow(/final decision/i);
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

  it("returns duplicate without adding another decision log on repeated confirmation", async () => {
    const t = createTest();
    const { sessionToken } = await signInAs(t, "double@hackuta.org");
    const applicationId = await seedApplication(t);

    const first = await t.mutation(ref.setApplicationDecision, {
      sessionToken,
      applicationId,
      decision: "rejected",
    });
    const second = await t.mutation(ref.setApplicationDecision, {
      sessionToken,
      applicationId,
      decision: "rejected",
    });

    expect(second).toMatchObject({ duplicate: true, logId: first.logId });
    const logs = await t.run((ctx) =>
      ctx.db
        .query("applicationReviewLogs")
        .withIndex("by_application_createdAt", (q) => q.eq("applicationId", applicationId))
        .collect(),
    );
    expect(logs.filter((log) => log.action === "rejected")).toHaveLength(1);
  });

  it("returns duplicate when more than ten activity logs precede the final decision", async () => {
    const t = createTest();
    const { adminId, sessionToken } = await signInAs(t, "busy@hackuta.org");
    const applicationId = await seedApplication(t);

    await t.run(async (ctx) => {
      for (let i = 0; i < 12; i += 1) {
        await ctx.db.insert("applicationReviewLogs", {
          applicationId,
          adminId,
          action: "viewed",
          createdAt: i + 1,
        });
      }
    });

    const first = await t.mutation(ref.setApplicationDecision, {
      sessionToken,
      applicationId,
      decision: "waitlisted",
    });
    const second = await t.mutation(ref.setApplicationDecision, {
      sessionToken,
      applicationId,
      decision: "waitlisted",
    });

    expect(second).toMatchObject({ duplicate: true, logId: first.logId });
    const logs = await t.run((ctx) =>
      ctx.db
        .query("applicationReviewLogs")
        .withIndex("by_application_createdAt", (q) => q.eq("applicationId", applicationId))
        .collect(),
    );
    expect(logs.filter((log) => log.action === "waitlisted")).toHaveLength(1);
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

describe("centralized staff authorization", () => {
  describe.each(["reviewer", "admin"] as const)("%s decisions on drafts", (role) => {
    it.each(["accepted", "rejected", "waitlisted"] as const)(
      "rejects %s without changing application, review, logs, or participants",
      async (decision) => {
        const { t, applicationId, sessionToken } = await createAuthorizationFixture(role);
        await t.run((ctx) => ctx.db.patch(applicationId, { formSubmitted: undefined, submittedAt: undefined }));
        const snapshot = () => t.run(async (ctx) => ({
          application: await ctx.db.get(applicationId),
          reviews: await ctx.db.query("applicationReviews").collect(),
          logs: await ctx.db.query("applicationReviewLogs").collect(),
          participants: await ctx.db.query("participants").collect(),
        }));
        const before = await snapshot();
        await expect(t.mutation(ref.setApplicationDecision, {
          sessionToken, applicationId, decision,
        })).rejects.toThrow(/application has not been submitted/i);
        expect(await snapshot()).toEqual(before);
      },
    );
  });

  it.each(["flag", "timestamp"] as const)("allows acceptance with only the submission %s", async (marker) => {
    const { t, applicationId, sessionToken } = await createAuthorizationFixture();
    await t.run((ctx) => ctx.db.patch(applicationId, {
      formSubmitted: marker === "flag" ? true : undefined,
      submittedAt: marker === "timestamp" ? 2 : undefined,
    }));
    await t.mutation(ref.setApplicationDecision, { sessionToken, applicationId, decision: "accepted" });
    expect(await t.run((ctx) => ctx.db.query("participants").unique())).not.toBeNull();
  });

  it.each(["reviewer", "admin"] as const)(
    "allows %s review activity and decisions with session-derived attribution",
    async (role) => {
      const { t, adminId, applicationId, sessionToken } = await createAuthorizationFixture(role);
      expect(await t.run((ctx) => getCurrentAdmin(ctx, sessionToken))).toMatchObject({
        _id: adminId, role, active: true,
      });
      const activityId = await t.mutation(ref.logApplicationReviewAction, {
        sessionToken, applicationId, action: "viewed",
      });
      expect(await t.run((ctx) => ctx.db.get(activityId))).toMatchObject({ adminId });

      for (const [index, decision] of ["rejected", "waitlisted", "accepted"].entries()) {
        const appId = await seedApplication(t, `applicant-${role}-${index}@example.com`);
        const { logId, duplicate } = await t.mutation(ref.setApplicationDecision, {
          sessionToken, applicationId: appId, decision,
        });
        expect(duplicate).toBe(false);
        expect(await t.run((ctx) => ctx.db.get(logId))).toMatchObject({ adminId, action: decision });
        const review = await t.run((ctx) =>
          ctx.db
            .query("applicationReviews")
            .withIndex("by_application", (q) => q.eq("applicationId", appId))
            .unique(),
        );
        expect(review).toMatchObject({ status: decision, reviewedBy: adminId });
      }
      const participant = await t.run((ctx) => ctx.db.query("participants").unique());
      expect(participant).toMatchObject({ acceptedBy: adminId });
    },
  );

  describe.each(["reviewer", "admin"] as const)("%s session rejection", (role) => {
    it.each(["missing", "fake", "expired", "revoked", "orphaned", "inactive"] as const)(
      "denies %s sessions before reading history or changing application state",
      async (condition) => {
        const { t, adminId, sessionId, applicationId, sessionToken: validToken } = await createAuthorizationFixture(role);
        let sessionToken = validToken;
        if (condition === "missing") sessionToken = "";
        if (condition === "fake") sessionToken = "0".repeat(64);
        if (condition === "revoked") await t.mutation(ref.signOut, { sessionToken });
        await t.run(async (ctx) => {
          if (condition === "inactive") await ctx.db.patch(adminId, { active: false });
          if (condition === "orphaned") await ctx.db.delete(adminId);
          if (condition === "expired") {
            await ctx.db.patch(sessionId, { expiresAt: Date.now() - 1 });
          }
        });
        expect(await t.run((ctx) => getCurrentAdmin(ctx, sessionToken))).toBeNull();
        await expect(t.mutation(ref.logApplicationReviewAction, {
          sessionToken, applicationId, action: "viewed",
        })).rejects.toThrow(/not authenticated/i);
        await expect(t.mutation(ref.setApplicationDecision, {
          sessionToken, applicationId, decision: "accepted",
        })).rejects.toThrow(/not authenticated/i);
        await expect(t.query(ref.listApplicationReviewLogs, {
          sessionToken, applicationId, paginationOpts: { numItems: 25, cursor: null },
        })).rejects.toThrow(/not authenticated/i);
        expect(await t.run((ctx) => ctx.db.query("applicationReviewLogs").collect())).toEqual([]);
        expect(await t.run((ctx) => ctx.db.query("participants").collect())).toEqual([]);
        const review = await t.run((ctx) => ctx.db.query("applicationReviews").unique());
        expect(review?.status).toBe("under_review");
        expect(review?.reviewedBy).toBeUndefined();
      },
    );
  });

  it("denies applicant identity even when its email matches an active admin", async () => {
    const { t, adminId, applicationId } = await createAuthorizationFixture("admin");
    await t.run((ctx) => ctx.db.patch(adminId, { email: "applicant@example.com" }));
    const application = await t.run((ctx) => ctx.db.get(applicationId));
    const applicant = t.withIdentity({
      subject: application!.authUserId, email: "applicant@example.com",
    });
    expect(await applicant.run((ctx) => getCurrentAdmin(ctx, ""))).toBeNull();
    await expect(applicant.mutation(ref.setApplicationDecision, {
      sessionToken: "", applicationId, decision: "accepted",
    })).rejects.toThrow(/not authenticated/i);
    await expect(applicant.query(ref.listApplicationReviewLogs, {
      sessionToken: "", applicationId, paginationOpts: { numItems: 25, cursor: null },
    })).rejects.toThrow(/not authenticated/i);
  });

  it("applies role changes to existing sessions", async () => {
    const { t, adminId, applicationId, sessionToken } = await createAuthorizationFixture("admin");
    await t.run((ctx) => ctx.db.patch(adminId, { role: "reviewer" }));
    await expect(t.query(ref.listApplicationReviewLogs, {
      sessionToken, applicationId, paginationOpts: { numItems: 25, cursor: null },
    })).rejects.toThrow(/not authorized/i);
    await t.mutation(ref.logApplicationReviewAction, { sessionToken, applicationId, action: "viewed" });
  });

  it("rejects forged acting admin IDs and role escalation arguments", async () => {
    const { t, applicationId, sessionToken } = await createAuthorizationFixture();
    const otherAdminId = await t.run((ctx) => ctx.db.insert("admins", {
      email: "admin@hackuta.org", name: "Other Organizer", role: "admin", active: true,
      createdAt: 1, updatedAt: 1,
    }));
    for (const forged of [{ adminId: otherAdminId }, { role: "admin" }]) {
      await expect(t.mutation(ref.setApplicationDecision, {
        sessionToken, applicationId, decision: "accepted", ...forged,
      })).rejects.toThrow(/unexpected field/i);
    }
    const forgedHistoryArgs = {
      sessionToken, applicationId,
      paginationOpts: { numItems: 25, cursor: null }, role: "admin",
    };
    await expect(t.query(ref.listApplicationReviewLogs, forgedHistoryArgs)).rejects.toThrow(/unexpected field/i);
    expect(await t.run((ctx) => ctx.db.query("applicationReviewLogs").collect())).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("participants").collect())).toEqual([]);
  });
});
