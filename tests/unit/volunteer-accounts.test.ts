import { makeFunctionReference, type ApiFromModules, type FunctionArgs, type FunctionReturnType } from "convex/server";
import { describe, expect, it, vi } from "vitest";
import type * as volunteerAccounts from "../../convex/admin/volunteerAccounts";
import type * as staffAuth from "../../convex/admin/auth";
import { verifyPassword } from "../../convex/admin/passwordHash";
import { expectAdminErrorCode } from "../helpers/adminErrors";
import { createConvexTest } from "../helpers/convexTestContext";
import { seedApplicant, seedStaff } from "../helpers/reviewTestKit";
import { insertStaffSession, mutateOrganizerSignIn, ORGANIZER_TEST_PASSWORD, signInOrganizer } from "../helpers/staffTestFixtures";
import { requireVolunteerAccess, requireVolunteerCapability, requireVolunteerEventAccess } from "../../convex/admin/staffAuth";

type VolunteerApi = ApiFromModules<{ volunteers: typeof volunteerAccounts }>["volunteers"];
type AuthApi = ApiFromModules<{ auth: typeof staffAuth }>["auth"];

const createRef = makeFunctionReference<"mutation", FunctionArgs<VolunteerApi["createVolunteer"]>, FunctionReturnType<VolunteerApi["createVolunteer"]>>(
  "admin/volunteerAccounts:createVolunteer",
);
const promoteRef = makeFunctionReference<"mutation", FunctionArgs<AuthApi["createAndProvisionAdmin"]>>("admin/auth:createAndProvisionAdmin");
const provisionRef = makeFunctionReference<"mutation", FunctionArgs<AuthApi["provisionAdminAuthAccount"]>>("admin/auth:provisionAdminAuthAccount");
const staffRef = makeFunctionReference<"query", FunctionArgs<AuthApi["getCurrentStaff"]>, FunctionReturnType<AuthApi["getCurrentStaff"]>>("admin/auth:getCurrentStaff");
const listRef = makeFunctionReference<"query", FunctionArgs<VolunteerApi["listVolunteers"]>, FunctionReturnType<VolunteerApi["listVolunteers"]>>("admin/volunteerAccounts:listVolunteers");
const resetRef = makeFunctionReference<"mutation", FunctionArgs<VolunteerApi["resetVolunteerPassword"]>>("admin/volunteerAccounts:resetVolunteerPassword");
const revokeRef = makeFunctionReference<"mutation", FunctionArgs<VolunteerApi["revokeVolunteer"]>>("admin/volunteerAccounts:revokeVolunteer");
const restoreRef = makeFunctionReference<"mutation", FunctionArgs<VolunteerApi["restoreVolunteer"]>>("admin/volunteerAccounts:restoreVolunteer");
const capabilitiesRef = makeFunctionReference<"mutation", FunctionArgs<VolunteerApi["updateVolunteerCapabilities"]>>("admin/volunteerAccounts:updateVolunteerCapabilities");
const eventRef = makeFunctionReference<"mutation", FunctionArgs<VolunteerApi["setVolunteerEventAccess"]>>("admin/volunteerAccounts:setVolunteerEventAccess");

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

async function managedFixture() {
  const base = await fixture();
  const { t, args } = base;
  const { adminId } = await t.mutation(createRef, args);
  const session = await signInOrganizer(t, args.email);
  const target = { sessionToken: args.sessionToken, volunteerAdminId: adminId };
  const eventId = await t.run((ctx) => ctx.db.insert("events", {
    name: "Workshop", pointsAwarded: 10, active: true,
    startsAt: Date.now() - 1000, endsAt: Date.now() + 60_000, createdAt: 1, updatedAt: 1,
  }));
  return { ...base, adminId, session, target, eventId };
}

describe("volunteer account lifecycle", () => {
  it("resets credentials, invalidates every session, and audits without credentials", async () => {
    const { t, adminId, args, target, session } = await managedFixture();
    const second = await insertStaffSession(t, { adminId, sessionToken: "b".repeat(64) });
    const result = await t.mutation(resetRef, { ...target, password: "Replacement123" });
    expect(result).toEqual({ ok: true });
    for (const sessionToken of [session.sessionToken, second.sessionToken]) {
      expect(await t.query(staffRef, { sessionToken })).toBeNull();
      await expectAdminErrorCode(t.run((ctx) => requireVolunteerAccess(ctx, sessionToken)), "NOT_AUTHENTICATED");
    }
    expect((await mutateOrganizerSignIn(t, { email: args.email, password: args.password })).ok).toBe(false);
    expect((await signInOrganizer(t, args.email, "Replacement123")).sessionToken).not.toBe(session.sessionToken);
    const logs = await t.run((ctx) => ctx.db.query("staffConfigLogs").collect());
    expect(logs.map((entry) => entry.action)).toEqual(["volunteer_created", "volunteer_password_reset"]);
    expect(JSON.stringify([result, logs])).not.toMatch(/Replacement123|passwordHash|sessionToken/);
  });

  it("preserves credentials, sessions, and audit records on an invalid reset", async () => {
    const { t, target, session } = await managedFixture();
    const before = await snapshot(t);
    await expect(t.mutation(resetRef, { ...target, password: "weak" })).rejects.toThrow(/at least 8/);
    expect(await snapshot(t)).toEqual(before);
    expect(await t.query(staffRef, { sessionToken: session.sessionToken })).not.toBeNull();
  });

  it("revokes all sessions, preserves history, and requires a new login after restoration", async () => {
    const { t, adminId, args, target, session } = await managedFixture();
    const second = await insertStaffSession(t, { adminId, sessionToken: "c".repeat(64) });
    await t.mutation(revokeRef, target);
    expect((await t.run((ctx) => ctx.db.get(adminId)))?.active).toBe(false);
    expect((await mutateOrganizerSignIn(t, { email: args.email, password: args.password })).ok).toBe(false);
    // Even a stale row left by an older workflow cannot become valid on restore.
    const stale = await insertStaffSession(t, { adminId, sessionToken: "d".repeat(64) });
    await t.mutation(restoreRef, target);
    expect((await t.run((ctx) => ctx.db.get(adminId)))?.active).toBe(true);
    for (const sessionToken of [session.sessionToken, second.sessionToken, stale.sessionToken]) {
      expect(await t.query(staffRef, { sessionToken })).toBeNull();
    }
    expect((await signInOrganizer(t, args.email)).sessionToken).not.toBe(session.sessionToken);
    const logs = await t.run((ctx) => ctx.db.query("staffConfigLogs").collect());
    expect(logs.map((entry) => entry.action)).toEqual(["volunteer_created", "volunteer_revoked", "volunteer_restored"]);
  });

  it("changes capabilities on the same session without restoring a removed permission", async () => {
    const { t, target, session } = await managedFixture();
    const check = (capability: "canCheckIn" | "canFoodCheckIn") => t.run((ctx) => requireVolunteerCapability(ctx, session.sessionToken, capability));
    await expectAdminErrorCode(check("canCheckIn"), "CAPABILITY_DENIED");
    await t.mutation(capabilitiesRef, { ...target, canCheckIn: true, canFoodCheckIn: false });
    expect((await check("canCheckIn"))._id).toBe(target.volunteerAdminId);
    await expectAdminErrorCode(check("canFoodCheckIn"), "CAPABILITY_DENIED");
    await t.mutation(capabilitiesRef, { ...target, canCheckIn: false, canFoodCheckIn: true });
    await expectAdminErrorCode(check("canCheckIn"), "CAPABILITY_DENIED");
    expect((await check("canFoodCheckIn"))._id).toBe(target.volunteerAdminId);
    const rows = await t.query(listRef, { sessionToken: target.sessionToken });
    expect(rows).toMatchObject([{ adminId: target.volunteerAdminId, canCheckIn: false, canFoodCheckIn: true }]);
    expect(JSON.stringify(rows)).not.toMatch(/password|qrCodeToken|sessionToken|points/);
  });

  it("normalizes missing capabilities when listing legacy volunteers", async () => {
    const { t, actor } = await fixture();
    const legacy = await seedStaff(t);
    await t.run((ctx) => ctx.db.patch(legacy.adminId, { role: "volunteer" }));
    expect(await t.query(listRef, { sessionToken: actor.sessionToken })).toMatchObject([
      { adminId: legacy.adminId, canCheckIn: false, canFoodCheckIn: false },
    ]);
  });

  it("grants one assignment, revokes it immediately, and logs the administrator", async () => {
    const { t, actor, target, session, eventId } = await managedFixture();
    const grant = { ...target, eventId, granted: true };
    await t.mutation(eventRef, grant);
    await t.mutation(eventRef, grant);
    const rows = await t.run((ctx) => ctx.db.query("volunteerEventAccess").collect());
    expect(rows).toMatchObject([{ volunteerAdminId: target.volunteerAdminId, eventId, grantedBy: actor.adminId }]);
    const check = () => t.run((ctx) => requireVolunteerEventAccess(ctx, session.sessionToken, eventId));
    expect((await check()).volunteer._id).toBe(target.volunteerAdminId);
    await t.mutation(eventRef, { ...grant, granted: false });
    await expectAdminErrorCode(check(), "EVENT_ACCESS_DENIED");
    expect(await t.run((ctx) => ctx.db.query("volunteerEventAccess").collect())).toEqual([]);
    expect((await t.run((ctx) => ctx.db.query("staffConfigLogs").collect())).at(-1)).toMatchObject({
      action: "volunteer_event_access_updated", targetEventId: eventId,
      targetAdminId: target.volunteerAdminId, actorAdminId: actor.adminId, details: '{"eventIds":[]}',
    });
  });

  it("rejects grants to inactive volunteers and missing events without writes", async () => {
    const { t, adminId, target, eventId } = await managedFixture();
    await t.mutation(revokeRef, target);
    const before = await snapshot(t);
    await expectAdminErrorCode(t.mutation(eventRef, { ...target, eventId, granted: true }), "ACCOUNT_INACTIVE");
    expect(await snapshot(t)).toEqual(before);
    await t.mutation(eventRef, { ...target, eventId, granted: false });
    await t.run((ctx) => ctx.db.patch(adminId, { active: true }));
    await t.run((ctx) => ctx.db.delete(eventId));
    await expectAdminErrorCode(t.mutation(eventRef, { ...target, eventId, granted: true }), "EVENT_NOT_FOUND");
  });

  it.each(["reviewer", "volunteer", "expired", "revoked", "inactive", "invalid"] as const)(
    "denies every management API to a caller who is %s", async (condition) => {
      const { t, actor, target, eventId } = await managedFixture();
      if (condition === "reviewer" || condition === "volunteer") {
        await t.run((ctx) => ctx.db.patch(actor.adminId, { role: condition }));
      } else if (condition === "inactive") {
        await t.run((ctx) => ctx.db.patch(actor.adminId, { active: false }));
      } else if (condition === "expired" || condition === "revoked") {
        await t.run(async (ctx) => {
          const sessions = await ctx.db.query("adminSessions").withIndex("by_admin", (q) => q.eq("adminId", actor.adminId)).collect();
          for (const row of sessions) {
            if (condition === "revoked") await ctx.db.delete(row._id);
            else await ctx.db.patch(row._id, { expiresAt: Date.now() - 1 });
          }
        });
      }
      const denied = { ...target, sessionToken: condition === "invalid" ? "" : target.sessionToken };
      const before = await snapshot(t);
      const code = condition === "reviewer" ? "ADMIN_ONLY" : condition === "volunteer" ? "NOT_AUTHORIZED" : "NOT_AUTHENTICATED";
      for (const call of managementCalls(t, denied, eventId)) await expectAdminErrorCode(call(), code);
      expect(await snapshot(t)).toEqual(before);
    },
  );

  it.each(["admin", "reviewer", "missing"] as const)("rejects a %s management target", async (condition) => {
    const { t, adminId, target, eventId } = await managedFixture();
    if (condition === "missing") await t.run((ctx) => ctx.db.delete(adminId));
    else await t.run((ctx) => ctx.db.patch(adminId, { role: condition }));
    const before = await snapshot(t);
    for (const call of managementCalls(t, target, eventId).slice(1)) {
      await expectAdminErrorCode(call(), "VOLUNTEER_NOT_FOUND");
    }
    expect(await snapshot(t)).toEqual(before);
  });
});

function managementCalls(
  t: Awaited<ReturnType<typeof managedFixture>>["t"],
  target: Awaited<ReturnType<typeof managedFixture>>["target"],
  eventId: Awaited<ReturnType<typeof managedFixture>>["eventId"],
) {
  return [
    () => t.query(listRef, { sessionToken: target.sessionToken }),
    () => t.mutation(resetRef, { ...target, password: "Replacement123" }),
    () => t.mutation(revokeRef, target),
    () => t.mutation(restoreRef, target),
    () => t.mutation(capabilitiesRef, { ...target, canCheckIn: true, canFoodCheckIn: true }),
    () => t.mutation(eventRef, { ...target, eventId, granted: true }),
  ];
}

function snapshot(t: ReturnType<typeof createConvexTest>) {
  return t.run(async (ctx) => ({
    staff: await ctx.db.query("admins").collect(),
    credentials: await ctx.db.query("adminAuthAccounts").collect(),
    sessions: await ctx.db.query("adminSessions").collect(),
    logs: await ctx.db.query("staffConfigLogs").collect(),
    assignments: await ctx.db.query("volunteerEventAccess").collect(),
  }));
}
