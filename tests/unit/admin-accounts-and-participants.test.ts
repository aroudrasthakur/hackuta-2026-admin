import { makeFunctionReference } from "convex/server";
import type { GenericId } from "convex/values";
import { describe, expect, it } from "vitest";
import { buildDecisionEmailContent } from "../../convex/admin/decisionEmailTemplates";
import { createQrCodeToken } from "../../convex/admin/participantCreation";
import { ADMIN_ERROR_MESSAGES } from "../../shared/admin/errors";
import { createConvexTest } from "../helpers/convexTestContext";
import {
  mutateOrganizerSignIn,
  ORGANIZER_TEST_PASSWORD,
  seedAdminAccount,
  signInOrganizer,
} from "../helpers/staffTestFixtures";
import { seedApplicant, seedStaff } from "../helpers/reviewTestKit";
import { expectAdminErrorCode } from "../helpers/adminErrors";

const ref = {
  signOut: makeFunctionReference<"mutation", { sessionToken: string }>("admin/auth:signOut"),
  getCurrentStaff: makeFunctionReference<"query", { sessionToken: string }, unknown>(
    "admin/auth:getCurrentStaff",
  ),
  provision: makeFunctionReference<
    "mutation",
    { adminId: GenericId<"admins">; password: string },
    { ok: true }
  >("admin/auth:provisionAdminAuthAccount"),
  createParticipant: makeFunctionReference<
    "mutation",
    { applicationId: GenericId<"applications">; acceptedBy: GenericId<"admins"> },
    GenericId<"participants">
  >("admin/participants:createParticipantFromAcceptance"),
};

describe("organizer sign-in edge cases", () => {
  it("normalizes the email before looking up the account", async () => {
    const t = createConvexTest();
    await seedAdminAccount(t, { email: "case@hackuta.org", role: "admin", active: true });
    const { sessionToken } = await signInOrganizer(t, "  CASE@HackUTA.org ");
    expect(await t.query(ref.getCurrentStaff, { sessionToken })).toMatchObject({ email: "case@hackuta.org" });
  });

  it.each([
    ["an empty email", "", ORGANIZER_TEST_PASSWORD],
    ["an empty password", "admin@hackuta.org", ""],
    ["an unknown email", "nobody@hackuta.org", ORGANIZER_TEST_PASSWORD],
  ])("rejects %s with the generic message", async (_label, email, password) => {
    const t = createConvexTest();
    await seedAdminAccount(t, { email: "admin@hackuta.org", role: "admin", active: true });
    const result = await mutateOrganizerSignIn(t, { email, password });
    expect(result).toEqual({ ok: false, code: "INVALID_CREDENTIALS", error: ADMIN_ERROR_MESSAGES.INVALID_CREDENTIALS });
  });

  it("rejects an account that has no password set", async () => {
    const t = createConvexTest();
    await t.run((ctx) =>
      ctx.db.insert("admins", {
        email: "nopass@hackuta.org",
        name: "No Password",
        role: "admin",
        active: true,
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    const noPassword = await mutateOrganizerSignIn(t, {
      email: "nopass@hackuta.org",
      password: ORGANIZER_TEST_PASSWORD,
    });
    expect(noPassword).toEqual({
      ok: false,
      code: "INVALID_CREDENTIALS",
      error: ADMIN_ERROR_MESSAGES.INVALID_CREDENTIALS,
    });
  });

  it("signing out an unknown session still succeeds", async () => {
    const t = createConvexTest();
    await expect(t.mutation(ref.signOut, { sessionToken: "9".repeat(64) })).resolves.toEqual({ ok: true });
  });
});

describe("organizer password provisioning", () => {
  it("creates a password for a new organizer, then signs in", async () => {
    const t = createConvexTest();
    const { adminId } = await seedStaff(t);
    const email = await t.run(async (ctx) => (await ctx.db.get(adminId))!.email);

    await t.mutation(ref.provision, { adminId, password: "NewPass123" });

    const signedIn = await signInOrganizer(t, email, "NewPass123");
    expect(signedIn.sessionToken).toHaveLength(64);
  });

  it("replaces an existing password and signs out every session", async () => {
    const t = createConvexTest();
    const adminId = await seedAdminAccount(t, { email: "reset@hackuta.org", role: "admin", active: true });
    const { sessionToken } = await signInOrganizer(t, "reset@hackuta.org");

    await t.mutation(ref.provision, { adminId, password: "Changed123" });

    expect(await t.query(ref.getCurrentStaff, { sessionToken })).toBeNull();
    const oldPassword = await mutateOrganizerSignIn(t, {
      email: "reset@hackuta.org",
      password: ORGANIZER_TEST_PASSWORD,
    });
    expect(oldPassword.ok).toBe(false);
    expect(await t.run((ctx) => ctx.db.query("adminAuthAccounts").collect())).toHaveLength(1);
  });

  it("rejects a weak password", async () => {
    const t = createConvexTest();
    const { adminId } = await seedStaff(t);
    await expect(t.mutation(ref.provision, { adminId, password: "short" })).rejects.toThrow(/at least 8/);
  });

  it("rejects an unknown organizer", async () => {
    const t = createConvexTest();
    const { adminId } = await seedStaff(t);
    await t.run((ctx) => ctx.db.delete(adminId));
    await expect(t.mutation(ref.provision, { adminId, password: "NewPass123" })).rejects.toThrow(
      /admin not found/i,
    );
  });
});

describe("internal participant creation", () => {
  async function acceptedFixture(review: Record<string, unknown> = { status: "accepted", completedAt: 42 }) {
    const t = createConvexTest();
    const { adminId } = await seedStaff(t);
    const applicant = await seedApplicant(t, { review });
    return { t, adminId, ...applicant };
  }

  it("creates one participant and returns the same row on retry", async () => {
    const { t, adminId, applicationId, userId } = await acceptedFixture();
    const first = await t.mutation(ref.createParticipant, { applicationId, acceptedBy: adminId });
    const second = await t.mutation(ref.createParticipant, { applicationId, acceptedBy: adminId });

    expect(second).toBe(first);
    expect(await t.run((ctx) => ctx.db.get(first))).toMatchObject({
      applicationId,
      authUserId: userId,
      acceptedBy: adminId,
      acceptedAt: 42,
    });
  });

  it("uses the current time when the review has no completion time", async () => {
    const { t, adminId, applicationId } = await acceptedFixture({ status: "accepted" });
    const id = await t.mutation(ref.createParticipant, { applicationId, acceptedBy: adminId });
    expect((await t.run((ctx) => ctx.db.get(id)))?.acceptedAt).toBeGreaterThan(42);
  });

  it("rejects an application that is not accepted", async () => {
    const { t, adminId, applicationId } = await acceptedFixture({ status: "waitlisted" });
    await expect(t.mutation(ref.createParticipant, { applicationId, acceptedBy: adminId })).rejects.toThrow(
      /not been accepted/i,
    );
  });

  it("rejects a deleted application", async () => {
    const { t, adminId, applicationId } = await acceptedFixture();
    await t.run((ctx) => ctx.db.delete(applicationId));
    await expect(t.mutation(ref.createParticipant, { applicationId, acceptedBy: adminId })).rejects.toThrow(
      /application not found/i,
    );
  });

  it("rejects an inactive accepting organizer", async () => {
    const { t, adminId, applicationId } = await acceptedFixture();
    await t.run((ctx) => ctx.db.patch(adminId, { active: false }));
    await expect(t.mutation(ref.createParticipant, { applicationId, acceptedBy: adminId })).rejects.toThrow(
      /inactive/i,
    );
  });

  it("rejects a volunteer as the accepting staff member even on the internal entry point", async () => {
    const { t, adminId, applicationId } = await acceptedFixture();
    await t.run((ctx) => ctx.db.patch(adminId, { role: "volunteer" }));
    await expectAdminErrorCode(t.mutation(ref.createParticipant, { applicationId, acceptedBy: adminId }), "NOT_AUTHORIZED");
    expect(await t.run((ctx) => ctx.db.query("participants").collect())).toEqual([]);
  });

  it("rejects a missing applicant account", async () => {
    const { t, adminId, applicationId, userId } = await acceptedFixture();
    await t.run((ctx) => ctx.db.delete(userId));
    await expect(t.mutation(ref.createParticipant, { applicationId, acceptedBy: adminId })).rejects.toThrow(
      /user account not found/i,
    );
  });

  it("rejects a participant row that belongs to a different user", async () => {
    const { t, adminId, applicationId } = await acceptedFixture();
    await t.run(async (ctx) => {
      const otherUser = await ctx.db.insert("users", { email: "other@example.com" });
      await ctx.db.insert("participants", {
        applicationId,
        authUserId: otherUser,
        acceptedAt: 1,
        acceptedBy: adminId,
        qrCodeToken: "1".repeat(64),
        createdAt: 1,
        updatedAt: 1,
      });
    });
    await expect(t.mutation(ref.createParticipant, { applicationId, acceptedBy: adminId })).rejects.toThrow(
      /does not match/i,
    );
  });

  it("makes 64-character hex QR tokens that do not repeat", () => {
    const tokens = new Set(Array.from({ length: 50 }, createQrCodeToken));
    expect(tokens.size).toBe(50);
    for (const token of tokens) expect(token).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("decision email copy", () => {
  it("uses a plain greeting when the name is blank", () => {
    const { text } = buildDecisionEmailContent({
      decision: "accepted",
      applicantName: "  ",
      hackathonName: "HackUTA",
    });
    expect(text.startsWith("Hi,\n")).toBe(true);
  });
});
