import { makeFunctionReference, type FunctionArgs, type FunctionReturnType } from "convex/server";
import { describe, expect, it, vi } from "vitest";
import type { createVolunteer } from "../../convex/admin/volunteerAccounts";
import type { createAndProvisionAdmin, provisionAdminAuthAccount, getCurrentStaff } from "../../convex/admin/auth";
import { verifyPassword } from "../../convex/admin/passwordHash";
import { expectAdminErrorCode } from "../helpers/adminErrors";
import { createConvexTest } from "../helpers/convexTestContext";
import { seedApplicant, seedStaff } from "../helpers/reviewTestKit";
import { ORGANIZER_TEST_PASSWORD, signInOrganizer } from "../helpers/staffTestFixtures";

const createRef = makeFunctionReference<"mutation", FunctionArgs<typeof createVolunteer>, FunctionReturnType<typeof createVolunteer>>(
  "admin/volunteerAccounts:createVolunteer",
);
const promoteRef = makeFunctionReference<"mutation", FunctionArgs<typeof createAndProvisionAdmin>>("admin/auth:createAndProvisionAdmin");
const provisionRef = makeFunctionReference<"mutation", FunctionArgs<typeof provisionAdminAuthAccount>>("admin/auth:provisionAdminAuthAccount");
const staffRef = makeFunctionReference<"query", FunctionArgs<typeof getCurrentStaff>, FunctionReturnType<typeof getCurrentStaff>>("admin/auth:getCurrentStaff");

async function fixture() {
  const t = createConvexTest();
  const actor = await seedStaff(t, { role: "admin" });
  const args = { sessionToken: actor.sessionToken, email: "volunteer@hackuta.org", name: "Volunteer", password: ORGANIZER_TEST_PASSWORD };
  return { t, actor, args };
}

describe("volunteer creation", () => {
  it("creates separate staff credentials, denies capabilities, and logs no secrets", async () => {
    const { t, actor, args } = await fixture();
    const log = vi.spyOn(console, "log");
    const error = vi.spyOn(console, "error");
    try {
      const result = await t.mutation(createRef, { ...args, email: "  VOLUNTEER@HackUTA.org ", name: " Volunteer " });
      expect(result).toEqual({ ok: true, adminId: expect.any(String), email: args.email });
      const row = await t.run((ctx) => ctx.db.get(result.adminId));
      expect(row).toMatchObject({ name: "Volunteer", email: args.email, role: "volunteer", active: true, canCheckIn: false, canFoodCheckIn: false });
      const account = await t.run((ctx) => ctx.db.query("adminAuthAccounts").unique());
      expect(account?.passwordHash).not.toBe(args.password);
      expect(await verifyPassword(account!.passwordHash, args.password)).toBe(true);
      const signedIn = await signInOrganizer(t, args.email);
      expect(await t.query(staffRef, { sessionToken: signedIn.sessionToken })).toMatchObject({ adminId: result.adminId, role: "volunteer" });
      const logs = await t.run((ctx) => ctx.db.query("staffConfigLogs").collect());
      expect(logs).toMatchObject([{ actorAdminId: actor.adminId, action: "volunteer_created", targetAdminId: result.adminId }]);
      const exposed = JSON.stringify([result, logs, log.mock.calls, error.mock.calls]);
      expect(exposed).not.toContain(args.password);
      expect(exposed).not.toContain(account!.passwordHash);
      expect(await t.run((ctx) => ctx.db.query("users").collect())).toEqual([]);
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });

  it("links an accepted participant without changing the participant or applicant account", async () => {
    const { t, actor, args } = await fixture();
    const { applicationId, userId } = await seedApplicant(t, { review: { status: "accepted" } });
    const participantId = await t.run((ctx) => ctx.db.insert("participants", {
      applicationId, authUserId: userId, acceptedBy: actor.adminId, acceptedAt: 1,
      qrCodeToken: "qr-secret", createdAt: 1, updatedAt: 1,
    }));
    const before = await t.run((ctx) => ctx.db.get(participantId));
    const result = await t.mutation(createRef, { ...args, participantId });
    expect((await t.run((ctx) => ctx.db.get(result.adminId)))?.participantId).toBe(participantId);
    expect(await t.run((ctx) => ctx.db.get(participantId))).toEqual(before);
    await expectAdminErrorCode(t.mutation(createRef, { ...args, email: "other@hackuta.org", participantId }), "STAFF_ACCOUNT_EXISTS");
    await t.run((ctx) => ctx.db.patch(result.adminId, { active: false }));
    await expectAdminErrorCode(t.mutation(createRef, { ...args, email: "third@hackuta.org", participantId }), "STAFF_ACCOUNT_EXISTS");
    expect(await t.run((ctx) => ctx.db.query("staffConfigLogs").collect())).toHaveLength(1);
  });

  it.each(["admin", "reviewer", "volunteer"] as const)("rejects an existing %s email without modifying the account", async (role) => {
    const { t, args } = await fixture();
    const existing = await seedStaff(t);
    await t.run((ctx) => ctx.db.patch(existing.adminId, { role, email: args.email }));
    const before = await t.run((ctx) => ctx.db.get(existing.adminId));
    await expectAdminErrorCode(t.mutation(createRef, { ...args, email: " VOLUNTEER@HackUTA.org " }), "STAFF_ACCOUNT_EXISTS");
    expect(await t.run((ctx) => ctx.db.get(existing.adminId))).toEqual(before);
    expect(await t.run((ctx) => ctx.db.query("staffConfigLogs").collect())).toEqual([]);
  });

  it.each(["reviewer", "volunteer"] as const)("rejects creation by a %s", async (role) => {
    const { t, actor, args } = await fixture();
    await t.run((ctx) => ctx.db.patch(actor.adminId, { role }));
    await expectAdminErrorCode(t.mutation(createRef, args), role === "reviewer" ? "ADMIN_ONLY" : "NOT_AUTHORIZED");
    expect(await t.run((ctx) => ctx.db.query("admins").collect())).toHaveLength(1);
  });

  it("rejects unauthenticated callers, invalid inputs, and injected privileges without writes", async () => {
    const { t, args } = await fixture();
    await expectAdminErrorCode(t.mutation(createRef, { ...args, sessionToken: "" }), "NOT_AUTHENTICATED");
    for (const email of ["", " ", "invalid"]) {
      await expectAdminErrorCode(t.mutation(createRef, { ...args, email }), "INVALID_EMAIL");
    }
    await expectAdminErrorCode(t.mutation(createRef, { ...args, name: " " }), "INVALID_STAFF_NAME");
    await expect(t.mutation(createRef, { ...args, password: "weak" })).rejects.toThrow(/at least 8/);
    for (const extra of [{ role: "admin" }, { canCheckIn: true }, { canFoodCheckIn: true }]) {
      await expect(t.mutation(createRef, { ...args, ...extra })).rejects.toThrow();
    }
    expect(await t.run((ctx) => ctx.db.query("admins").collect())).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.query("adminAuthAccounts").collect())).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("staffConfigLogs").collect())).toEqual([]);
  });

  it("blocks generic provisioning from converting or resetting volunteer accounts", async () => {
    const { t, args } = await fixture();
    const { adminId } = await t.mutation(createRef, args);
    await expectAdminErrorCode(t.mutation(promoteRef, { ...args, role: "admin" }), "STAFF_ACCOUNT_EXISTS");
    await expectAdminErrorCode(t.mutation(provisionRef, { adminId, password: ORGANIZER_TEST_PASSWORD }), "NOT_AUTHORIZED");
    expect((await t.run((ctx) => ctx.db.get(adminId)))?.role).toBe("volunteer");
  });
});
