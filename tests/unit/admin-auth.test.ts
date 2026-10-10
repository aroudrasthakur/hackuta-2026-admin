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
    { sessionToken: string; applicationId: GenericId<"applications">; action: "viewed" },
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
        const t = createTest();
        await seedAdmin(t, { email: "staff@hackuta.org", role, active: true });
        const applicationId = await seedApplication(t);
        const { sessionToken } = await t.mutation(ref.signIn, {
          email: "staff@hackuta.org", password: TEST_PASSWORD,
        });
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
    const t = createTest();
    await seedAdmin(t, { email: "staff@hackuta.org", role: "reviewer", active: true });
    const applicationId = await seedApplication(t);
    const { sessionToken } = await t.mutation(ref.signIn, {
      email: "staff@hackuta.org", password: TEST_PASSWORD,
    });
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
      const t = createTest();
      const adminId = await seedAdmin(t, { email: "staff@hackuta.org", role, active: true });
      const applicationId = await seedApplication(t);
      const { sessionToken } = await t.mutation(ref.signIn, {
        email: "staff@hackuta.org", password: TEST_PASSWORD,
      });
      expect(await t.run((ctx) => getCurrentAdmin(ctx, sessionToken))).toMatchObject({
        _id: adminId, role, active: true,
      });
      const activityId = await t.mutation(ref.logApplicationReviewAction, {
        sessionToken, applicationId, action: "viewed",
      });
      expect(await t.run((ctx) => ctx.db.get(activityId))).toMatchObject({ adminId });

      for (const decision of ["rejected", "waitlisted", "accepted"] as const) {
        const logId = await t.mutation(ref.setApplicationDecision, {
          sessionToken, applicationId, decision,
        });
        expect(await t.run((ctx) => ctx.db.get(logId))).toMatchObject({ adminId, action: decision });
        const review = await t.run((ctx) => ctx.db.query("applicationReviews").unique());
        expect(review).toMatchObject({ status: decision, reviewedByAdmin: adminId });
      }
      const participant = await t.run((ctx) => ctx.db.query("participants").unique());
      expect(participant).toMatchObject({ acceptedBy: adminId });
    },
  );

  describe.each(["reviewer", "admin"] as const)("%s session rejection", (role) => {
    it.each(["missing", "fake", "expired", "revoked", "orphaned", "inactive"] as const)(
      "denies %s sessions before reading history or changing application state",
      async (condition) => {
        const t = createTest();
        const adminId = await seedAdmin(t, { email: "staff@hackuta.org", role, active: true });
        const applicationId = await seedApplication(t);
        let { sessionToken } = await t.mutation(ref.signIn, {
          email: "staff@hackuta.org", password: TEST_PASSWORD,
        });
        if (condition === "missing") sessionToken = "";
        if (condition === "fake") sessionToken = "0".repeat(64);
        if (condition === "revoked") await t.mutation(ref.signOut, { sessionToken });
        await t.run(async (ctx) => {
          if (condition === "inactive") await ctx.db.patch(adminId, { active: false });
          if (condition === "orphaned") await ctx.db.delete(adminId);
          if (condition === "expired") {
            const session = await ctx.db.query("adminSessions").unique();
            await ctx.db.patch(session!._id, { expiresAt: Date.now() - 1 });
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
        expect(review?.reviewedByAdmin).toBeUndefined();
      },
    );
  });

  it("denies applicant identity even when its email matches an active admin", async () => {
    const t = createTest();
    await seedAdmin(t, { email: "applicant@example.com", role: "admin", active: true });
    const applicationId = await seedApplication(t);
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
    const t = createTest();
    const adminId = await seedAdmin(t, { email: "staff@hackuta.org", role: "admin", active: true });
    const applicationId = await seedApplication(t);
    const { sessionToken } = await t.mutation(ref.signIn, {
      email: "staff@hackuta.org", password: TEST_PASSWORD,
    });
    await t.run((ctx) => ctx.db.patch(adminId, { role: "reviewer" }));
    await expect(t.query(ref.listApplicationReviewLogs, {
      sessionToken, applicationId, paginationOpts: { numItems: 25, cursor: null },
    })).rejects.toThrow(/not authorized/i);
    await t.mutation(ref.logApplicationReviewAction, { sessionToken, applicationId, action: "viewed" });
  });

  it("rejects forged acting admin IDs and role escalation arguments", async () => {
    const t = createTest();
    await seedAdmin(t, { email: "reviewer@hackuta.org", role: "reviewer", active: true });
    const otherAdminId = await seedAdmin(t, { email: "admin@hackuta.org", role: "admin", active: true });
    const applicationId = await seedApplication(t);
    const { sessionToken } = await t.mutation(ref.signIn, {
      email: "reviewer@hackuta.org", password: TEST_PASSWORD,
    });
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
