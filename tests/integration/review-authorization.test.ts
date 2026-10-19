import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getApplicationRef,
  getCurrentStaffRef,
  listApplicationReviewLogsRef,
  listSubmittedApplicationsRef,
  logApplicationReviewActionRef,
  setApplicationDecisionRef,
} from "../../src/convex/adminApi";
import { createConvexTest, type ConvexTestInstance } from "../helpers/convexTestContext";
import { insertStaffSession } from "../helpers/staffTestFixtures";
import { countRows, seedApplicant, seedStaff, snapshotReviewState } from "../helpers/reviewTestKit";
import { expectAdminErrorCode } from "../helpers/adminErrors";

const page = { numItems: 10, cursor: null };

/** Every protected review call, made directly against the backend. */
function protectedCalls(
  t: ConvexTestInstance,
  sessionToken: string,
  applicationId: Awaited<ReturnType<typeof seedApplicant>>["applicationId"],
) {
  return {
    listApplications: () => t.query(listSubmittedApplicationsRef, { sessionToken }),
    openApplication: () => t.query(getApplicationRef, { sessionToken, applicationId }),
    logViewed: () =>
      t.mutation(logApplicationReviewActionRef, { sessionToken, applicationId, action: "viewed" }),
    startReview: () =>
      t.mutation(logApplicationReviewActionRef, {
        sessionToken,
        applicationId,
        action: "started_review",
      }),
    accept: () =>
      t.mutation(setApplicationDecisionRef, { sessionToken, applicationId, decision: "accepted" }),
    reject: () =>
      t.mutation(setApplicationDecisionRef, { sessionToken, applicationId, decision: "rejected" }),
    waitlist: () =>
      t.mutation(setApplicationDecisionRef, { sessionToken, applicationId, decision: "waitlisted" }),
    viewHistory: () =>
      t.query(listApplicationReviewLogsRef, { sessionToken, applicationId, paginationOpts: page }),
  };
}

type CallName = keyof ReturnType<typeof protectedCalls>;
const callNames = Object.keys(protectedCalls(null as never, "", null as never)) as CallName[];

/** Ways a caller can fail to be an active organizer. Each returns the token it would send. */
const deniedCallers: Record<string, (t: ConvexTestInstance) => Promise<string>> = {
  "no session token": async () => "",
  "short session token": async () => "abc",
  "unknown session token": async () => "f".repeat(64),
  "expired session": async (t) => {
    const { adminId } = await seedStaff(t, { role: "admin" });
    const { sessionToken } = await insertStaffSession(t, {
      adminId,
      sessionToken: "e".repeat(64),
      expiresAt: Date.now() - 1,
    });
    return sessionToken;
  },
  "signed-out session": async (t) => {
    const { adminId, sessionToken } = await seedStaff(t, { role: "admin" });
    await t.run(async (ctx) => {
      const sessions = await ctx.db.query("adminSessions").collect();
      for (const session of sessions.filter((s) => s.adminId === adminId)) {
        await ctx.db.delete(session._id);
      }
    });
    return sessionToken;
  },
  "session for a deleted account": async (t) => {
    const { adminId, sessionToken } = await seedStaff(t, { role: "admin" });
    await t.run((ctx) => ctx.db.delete(adminId));
    return sessionToken;
  },
  "inactive reviewer": async (t) => (await seedStaff(t, { role: "reviewer", active: false })).sessionToken,
  "inactive admin": async (t) => (await seedStaff(t, { role: "admin", active: false })).sessionToken,
};

describe("review access for callers without an active organizer session", () => {
  describe.each(Object.entries(deniedCallers))("%s", (_label, makeToken) => {
    it.each(callNames)("blocks %s and writes nothing", async (callName) => {
      const t = createConvexTest();
      const { applicationId } = await seedApplicant(t);
      const sessionToken = await makeToken(t);
      const before = await snapshotReviewState(t);

      await expectAdminErrorCode(protectedCalls(t, sessionToken, applicationId)[callName](), "NOT_AUTHENTICATED");
      expect(await snapshotReviewState(t)).toEqual(before);
    });

    it("gets no staff profile", async () => {
      const t = createConvexTest();
      const sessionToken = await makeToken(t);
      expect(await t.query(getCurrentStaffRef, { sessionToken })).toBeNull();
    });
  });
});

describe("reviewer permissions", () => {
  it.each(["listApplications", "openApplication", "logViewed", "startReview"] as const)(
    "allows %s",
    async (callName) => {
      const t = createConvexTest();
      const { sessionToken } = await seedStaff(t, { role: "reviewer" });
      const { applicationId } = await seedApplicant(t);
      await expect(protectedCalls(t, sessionToken, applicationId)[callName]()).resolves.toBeDefined();
    },
  );

  it.each([
    ["accept", "accepted"],
    ["reject", "rejected"],
    ["waitlist", "waitlisted"],
  ] as const)("allows %s", async (callName, status) => {
    const t = createConvexTest();
    const { sessionToken } = await seedStaff(t, { role: "reviewer" });
    const { applicationId } = await seedApplicant(t);
    await protectedCalls(t, sessionToken, applicationId)[callName]();
    expect((await t.run((ctx) => ctx.db.query("applicationReviews").first()))?.status).toBe(status);
  });

  it("blocks the full review history", async () => {
    const t = createConvexTest();
    const { sessionToken } = await seedStaff(t, { role: "reviewer" });
    const { applicationId } = await seedApplicant(t);
    await expectAdminErrorCode(protectedCalls(t, sessionToken, applicationId).viewHistory(), "ADMIN_ONLY");
  });
});

describe("admin permissions", () => {
  it("can do every review action and read the full history", async () => {
    const t = createConvexTest();
    const { sessionToken } = await seedStaff(t, { role: "admin" });
    const { applicationId } = await seedApplicant(t);
    const calls = protectedCalls(t, sessionToken, applicationId);

    await calls.listApplications();
    await calls.openApplication();
    await calls.logViewed();
    await calls.startReview();
    await calls.waitlist();

    const history = await calls.viewHistory();
    expect(history.page.map((event) => event.action)).toEqual([
      "waitlisted",
      "started_review",
      "viewed",
    ]);
  });

  it.each(["accept", "reject"] as const)("can %s", async (callName) => {
    const t = createConvexTest();
    const { sessionToken } = await seedStaff(t, { role: "admin" });
    const { applicationId } = await seedApplicant(t);
    await expect(protectedCalls(t, sessionToken, applicationId)[callName]()).resolves.toMatchObject({
      duplicate: false,
    });
  });
});

describe("account changes apply to live sessions", () => {
  it("blocks a reviewer on the next request after the account is deactivated", async () => {
    const t = createConvexTest();
    const { adminId, sessionToken } = await seedStaff(t, { role: "reviewer" });
    const { applicationId } = await seedApplicant(t);
    const calls = protectedCalls(t, sessionToken, applicationId);

    await calls.logViewed();
    await t.run((ctx) => ctx.db.patch(adminId, { active: false }));
    await expectAdminErrorCode(calls.startReview(), "NOT_AUTHENTICATED");
  });

  it("removes history access when an admin is demoted to reviewer", async () => {
    const t = createConvexTest();
    const { adminId, sessionToken } = await seedStaff(t, { role: "admin" });
    const { applicationId } = await seedApplicant(t);
    const calls = protectedCalls(t, sessionToken, applicationId);

    await calls.viewHistory();
    await t.run((ctx) => ctx.db.patch(adminId, { role: "reviewer" }));
    await expectAdminErrorCode(calls.viewHistory(), "ADMIN_ONLY");
  });

  it("ignores applicant sign-in when no staff session is sent", async () => {
    const t = createConvexTest();
    const { applicationId } = await seedApplicant(t);
    const asApplicant = t.withIdentity({ subject: "applicant", email: "staff-1@hackuta.org" });
    await expectAdminErrorCode(
      asApplicant.query(getApplicationRef, { sessionToken: "", applicationId }),
      "NOT_AUTHENTICATED",
    );
  });
});

describe("participant QR credentials", () => {
  it("keeps participant creation off the public Convex API", () => {
    const source = readFileSync(new URL("../../convex/admin/participants.ts", import.meta.url), "utf8");
    expect(source).toContain("internalMutation");
    expect(source).not.toMatch(/export const \w+ = (query|mutation)\(/);
  });

  it("omits the QR token and participant id from the acceptance response and review reads", async () => {
    const t = createConvexTest();
    const { sessionToken } = await seedStaff(t, { role: "reviewer" });
    const { applicationId } = await seedApplicant(t);
    const calls = protectedCalls(t, sessionToken, applicationId);

    const accepted = await calls.accept();
    expect(Object.keys(accepted).sort()).toEqual(["duplicate", "logId"]);
    expect(JSON.stringify(accepted)).not.toContain("qrCodeToken");

    const listed = await calls.listApplications();
    const opened = await calls.openApplication();
    expect(JSON.stringify({ listed, opened })).not.toContain("qrCodeToken");

    const participant = await t.run((ctx) => ctx.db.query("participants").unique());
    expect(participant?.qrCodeToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps the same QR token when acceptance is retried", async () => {
    const t = createConvexTest();
    const { sessionToken } = await seedStaff(t, { role: "reviewer" });
    const { applicationId } = await seedApplicant(t);
    const calls = protectedCalls(t, sessionToken, applicationId);

    await calls.accept();
    const first = await t.run((ctx) => ctx.db.query("participants").unique());
    const retry = await calls.accept();
    const second = await t.run((ctx) => ctx.db.query("participants").unique());

    expect(retry).toMatchObject({ duplicate: true, logId: expect.anything() });
    expect(second).toEqual(first);
    expect(await countRows(t, "participants")).toBe(1);
  });

  it("does not create a participant when an applicant session tries to accept", async () => {
    const t = createConvexTest();
    const { applicationId, userId } = await seedApplicant(t);
    const asApplicant = t.withIdentity({ subject: userId, email: "applicant@example.com" });

    await expectAdminErrorCode(
      asApplicant.mutation(setApplicationDecisionRef, {
        sessionToken: "",
        applicationId,
        decision: "accepted",
      }),
      "NOT_AUTHENTICATED",
    );
    expect(await countRows(t, "participants")).toBe(0);
  });
});
