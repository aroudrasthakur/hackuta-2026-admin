import { anyApi, type ApiFromModules } from "convex/server";
import type { GenericId } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import type * as volunteersModule from "../../convex/admin/volunteers";
import type * as participantsAdminModule from "../../convex/admin/participantsAdmin";
import type * as staffAuth from "../../convex/admin/auth";
import { verifyPassword } from "../../convex/admin/passwordHash";
import { MAX_VOLUNTEER_EVENTS } from "../../convex/admin/volunteers";
import { expectAdminErrorCode } from "../helpers/adminErrors";
import { createConvexTest, type ConvexTestInstance } from "../helpers/convexTestContext";
import { seedApplicant, seedStaff } from "../helpers/reviewTestKit";
import {
  insertStaffSession, mutateOrganizerSignIn, ORGANIZER_TEST_PASSWORD, seedAdminAccount, signInOrganizer,
} from "../helpers/staffTestFixtures";
import {
  requireVolunteerAccess, requireVolunteerCapability, requireVolunteerEventAccess,
} from "../../convex/admin/staffAuth";

const { volunteers, participantsAdmin, auth } = (anyApi as ApiFromModules<{
  "admin/volunteers": typeof volunteersModule;
  "admin/participantsAdmin": typeof participantsAdminModule;
  "admin/auth": typeof staffAuth;
}>).admin;

const page = { numItems: 20, cursor: null };

async function fixture() {
  const t = createConvexTest();
  const actor = await seedStaff(t, { role: "admin", name: "Admin Ada" });
  const args = {
    sessionToken: actor.sessionToken, email: "volunteer@hackuta.org", name: "Volunteer", password: ORGANIZER_TEST_PASSWORD,
    canCheckIn: false, canFoodCheckIn: false,
  };
  return { t, actor, args };
}

async function seedParticipant(t: ConvexTestInstance, acceptedBy: GenericId<"admins">, status = "accepted") {
  const { applicationId, userId } = await seedApplicant(t, { email: "taylor@example.com", review: { status } });
  const participantId = await t.run((ctx) => ctx.db.insert("participants", {
    applicationId, authUserId: userId, acceptedBy, acceptedAt: 1,
    qrCodeToken: "ab".repeat(32), points: 40, createdAt: 1, updatedAt: 1,
  }));
  return { participantId, applicationId, userId };
}

function seedEvent(t: ConvexTestInstance, name = "Workshop") {
  return t.run((ctx) => ctx.db.insert("events", {
    name, pointsAwarded: 10, active: true, startsAt: 1, endsAt: 2, createdAt: 1, updatedAt: 1,
  }));
}

function configLogs(t: ConvexTestInstance) {
  return t.run((ctx) => ctx.db.query("staffConfigLogs").collect());
}

function snapshot(t: ConvexTestInstance) {
  return t.run(async (ctx) => ({
    staff: await ctx.db.query("admins").collect(),
    credentials: await ctx.db.query("adminAuthAccounts").collect(),
    sessions: await ctx.db.query("adminSessions").collect(),
    logs: await ctx.db.query("staffConfigLogs").collect(),
    assignments: await ctx.db.query("volunteerEventAccess").collect(),
    users: await ctx.db.query("users").collect(),
    authAccounts: await ctx.db.query("authAccounts").collect(),
    participants: await ctx.db.query("participants").collect(),
  }));
}

describe("createVolunteer", () => {
  it("creates a separate volunteer with hashed credentials, default-denied capabilities, and an audit row", async () => {
    const { t, actor, args } = await fixture();
    const log = vi.spyOn(console, "log");
    try {
      const result = await t.mutation(volunteers.createVolunteer, { ...args, email: "  VOLUNTEER@HackUTA.org ", name: " Volunteer " });
      expect(result).toEqual({ ok: true, adminId: expect.any(String), email: args.email });
      expect(await t.run((ctx) => ctx.db.get(result.adminId))).toMatchObject({
        name: "Volunteer", email: args.email, role: "volunteer", active: true, canCheckIn: false, canFoodCheckIn: false,
      });
      const account = await t.run((ctx) => ctx.db.query("adminAuthAccounts").unique());
      expect(await verifyPassword(account!.passwordHash, args.password)).toBe(true);
      const signedIn = await signInOrganizer(t, args.email);
      expect(await t.query(auth.getCurrentStaff, { sessionToken: signedIn.sessionToken })).toMatchObject({ role: "volunteer" });
      const logs = await configLogs(t);
      expect(logs).toMatchObject([{
        actorAdminId: actor.adminId, action: "volunteer_created", targetAdminId: result.adminId,
        details: JSON.stringify({ after: { canCheckIn: false, canFoodCheckIn: false, active: true } }),
      }]);
      const exposed = JSON.stringify([result, logs, log.mock.calls]);
      expect(exposed).not.toContain(args.password);
      expect(exposed).not.toContain(account!.passwordHash);
      expect(await t.run((ctx) => ctx.db.query("users").collect())).toEqual([]);
      expect(await t.run((ctx) => ctx.db.query("authAccounts").collect())).toEqual([]);
    } finally {
      log.mockRestore();
    }
  });

  it("starts with no access when capabilities are omitted and grants only those set to true", async () => {
    const { t, args } = await fixture();
    const { adminId } = await t.mutation(volunteers.createVolunteer, { ...args, canCheckIn: true });
    expect(await t.run((ctx) => ctx.db.get(adminId))).toMatchObject({ canCheckIn: true, canFoodCheckIn: false });
    const { canCheckIn: _check, canFoodCheckIn: _food, ...noCapabilities } = args;
    void _check;
    void _food;
    const bare = await t.mutation(volunteers.createVolunteer, { ...noCapabilities, email: "other@hackuta.org" });
    expect(await t.run((ctx) => ctx.db.get(bare.adminId))).toMatchObject({ canCheckIn: false, canFoodCheckIn: false, canRedeemShop: false });
    expect(await t.run((ctx) => ctx.db.query("volunteerEventAccess").withIndex("by_volunteer", (q) => q.eq("volunteerAdminId", bare.adminId)).collect())).toEqual([]);
    await expect(t.mutation(volunteers.createVolunteer, { ...args, email: "third@hackuta.org", canFoodCheckIn: "yes" } as never)).rejects.toThrow();
  });

  it.each(["admin", "volunteer"] as const)("rejects an email used by an existing %s without modifying it", async (role) => {
    const { t, args } = await fixture();
    const existing = await seedStaff(t);
    await t.run((ctx) => ctx.db.patch(existing.adminId, { role, email: args.email, active: role !== "volunteer" }));
    const before = await snapshot(t);
    await expectAdminErrorCode(t.mutation(volunteers.createVolunteer, { ...args, email: " Volunteer@HackUTA.org " }), "STAFF_ACCOUNT_EXISTS");
    expect(await snapshot(t)).toEqual(before);
  });

  it("rejects invalid input and injected roles without writes", async () => {
    const { t, args } = await fixture();
    const before = await snapshot(t);
    for (const email of ["", " ", "invalid"]) {
      await expectAdminErrorCode(t.mutation(volunteers.createVolunteer, { ...args, email }), "INVALID_EMAIL");
    }
    await expectAdminErrorCode(t.mutation(volunteers.createVolunteer, { ...args, name: " " }), "INVALID_STAFF_NAME");
    await expect(t.mutation(volunteers.createVolunteer, { ...args, password: "weak" })).rejects.toThrow(/at least 8/);
    for (const extra of [{ role: "admin" }, { active: false }, { participantId: "x" }]) {
      await expect(t.mutation(volunteers.createVolunteer, { ...args, ...extra })).rejects.toThrow();
    }
    expect(await snapshot(t)).toEqual(before);
  });

  it("blocks generic provisioning from converting or resetting volunteer accounts", async () => {
    const { t, args } = await fixture();
    const { adminId } = await t.mutation(volunteers.createVolunteer, args);
    const { sessionToken, email, name, password } = args;
    await expectAdminErrorCode(t.mutation(auth.createAndProvisionAdmin, { sessionToken, email, name, password }), "STAFF_ACCOUNT_EXISTS");
    await expectAdminErrorCode(t.mutation(auth.provisionAdminAuthAccount, { adminId, password: ORGANIZER_TEST_PASSWORD }), "NOT_AUTHORIZED");
    expect((await t.run((ctx) => ctx.db.get(adminId)))?.role).toBe("volunteer");
  });
});

describe("promoteParticipantToVolunteer", () => {
  it("creates a linked staff identity reusing the registration email, leaving participant data untouched", async () => {
    const { t, actor } = await fixture();
    const { participantId, applicationId, userId } = await seedParticipant(t, actor.adminId);
    const before = await t.run(async (ctx) => ({
      participant: await ctx.db.get(participantId),
      application: await ctx.db.get(applicationId),
      user: await ctx.db.get(userId),
    }));
    const result = await t.mutation(participantsAdmin.promoteParticipantToVolunteer, {
      sessionToken: actor.sessionToken, participantId, password: ORGANIZER_TEST_PASSWORD, canFoodCheckIn: true,
    });
    expect(result).toMatchObject({ ok: true, email: "taylor@example.com" });
    expect(await t.run((ctx) => ctx.db.get(result.adminId))).toMatchObject({
      role: "volunteer", name: "Taylor Student", participantId, canCheckIn: false, canFoodCheckIn: true,
    });
    expect(await t.run(async (ctx) => ({
      participant: await ctx.db.get(participantId),
      application: await ctx.db.get(applicationId),
      user: await ctx.db.get(userId),
    }))).toEqual(before);
    expect(await t.run((ctx) => ctx.db.query("authAccounts").collect())).toEqual([]);
    expect((await configLogs(t)).at(-1)).toMatchObject({
      action: "volunteer_promoted", actorAdminId: actor.adminId, targetAdminId: result.adminId, targetParticipantId: participantId,
      details: JSON.stringify({ after: { canCheckIn: false, canFoodCheckIn: true, active: true } }),
    });
    expect((await signInOrganizer(t, "taylor@example.com")).ok).toBe(true);
  });

  it("accepts an explicit email and name", async () => {
    const { t, actor } = await fixture();
    const { participantId } = await seedParticipant(t, actor.adminId);
    const result = await t.mutation(participantsAdmin.promoteParticipantToVolunteer, {
      sessionToken: actor.sessionToken, participantId, password: ORGANIZER_TEST_PASSWORD,
      email: " Staff.Taylor@HackUTA.org ", name: " T. Student ",
    });
    expect(await t.run((ctx) => ctx.db.get(result.adminId))).toMatchObject({ email: "staff.taylor@hackuta.org", name: "T. Student" });
  });

  it("rejects duplicate links, taken emails, and ineligible or missing participants without writes", async () => {
    const { t, actor } = await fixture();
    const { participantId } = await seedParticipant(t, actor.adminId);
    const promote = (extra: Record<string, unknown> = {}) => t.mutation(participantsAdmin.promoteParticipantToVolunteer, {
      sessionToken: actor.sessionToken, participantId, password: ORGANIZER_TEST_PASSWORD, ...extra,
    });

    const otherAdmin = await seedStaff(t, { role: "admin" });
    await t.run((ctx) => ctx.db.patch(otherAdmin.adminId, { email: "taylor@example.com" }));
    let before = await snapshot(t);
    await expectAdminErrorCode(promote(), "STAFF_ACCOUNT_EXISTS");
    expect(await snapshot(t)).toEqual(before);
    expect((await t.run((ctx) => ctx.db.get(otherAdmin.adminId)))?.role).toBe("admin");

    await promote({ email: "first@hackuta.org" });
    before = await snapshot(t);
    await expectAdminErrorCode(promote({ email: "second@hackuta.org" }), "STAFF_ACCOUNT_EXISTS");
    expect(await snapshot(t)).toEqual(before);

    const other = await seedParticipant(t, actor.adminId, "rejected");
    await expectAdminErrorCode(t.mutation(participantsAdmin.promoteParticipantToVolunteer, {
      sessionToken: actor.sessionToken, participantId: other.participantId, password: ORGANIZER_TEST_PASSWORD, email: "x@hackuta.org",
    }), "PARTICIPANT_NOT_ELIGIBLE");
    await t.run((ctx) => ctx.db.delete(other.participantId));
    await expectAdminErrorCode(t.mutation(participantsAdmin.promoteParticipantToVolunteer, {
      sessionToken: actor.sessionToken, participantId: other.participantId, password: ORGANIZER_TEST_PASSWORD, email: "y@hackuta.org",
    }), "PARTICIPANT_NOT_FOUND");
  });
});

async function managedFixture() {
  const base = await fixture();
  const { t, args } = base;
  const { adminId } = await t.mutation(volunteers.createVolunteer, args);
  const session = await signInOrganizer(t, args.email);
  const target = { sessionToken: args.sessionToken, volunteerAdminId: adminId };
  const eventId = await seedEvent(t);
  return { ...base, adminId, session, target, eventId };
}

describe("listVolunteers", () => {
  it("paginates volunteers with status, capabilities, events, and participant link only", async () => {
    const { t, actor, target, eventId } = await managedFixture();
    const { participantId } = await seedParticipant(t, actor.adminId);
    await t.mutation(participantsAdmin.promoteParticipantToVolunteer, {
      sessionToken: actor.sessionToken, participantId, password: ORGANIZER_TEST_PASSWORD,
    });
    await t.mutation(volunteers.setVolunteerEventAccess, { ...target, eventIds: [eventId] });
    await seedStaff(t, { role: "admin" });

    const first = await t.query(volunteers.listVolunteers, { sessionToken: actor.sessionToken, paginationOpts: { numItems: 1, cursor: null } });
    expect(first.page).toEqual([{
      adminId: target.volunteerAdminId, name: "Volunteer", email: "volunteer@hackuta.org", active: true,
      participant: null, canCheckIn: false, canFoodCheckIn: false, canRedeemShop: false, canScanAllEvents: false,
      events: [{ eventId, name: "Workshop", active: true }],
      createdAt: expect.any(Number), updatedAt: expect.any(Number),
    }]);
    const second = await t.query(volunteers.listVolunteers, {
      sessionToken: actor.sessionToken, paginationOpts: { numItems: 5, cursor: first.continueCursor },
    });
    expect(second.page).toMatchObject([{ participant: { participantId, name: "Taylor Student" }, events: [] }]);
    expect(second.isDone).toBe(true);
    expect(JSON.stringify([first, second])).not.toMatch(/passwordHash|sessionToken|qrCodeToken|"points"/);
  });

  it("normalizes missing capabilities on legacy volunteers", async () => {
    const { t, actor } = await fixture();
    const legacy = await seedStaff(t);
    await t.run((ctx) => ctx.db.patch(legacy.adminId, { role: "volunteer" }));
    const result = await t.query(volunteers.listVolunteers, { sessionToken: actor.sessionToken, paginationOpts: page });
    expect(result.page).toMatchObject([{ adminId: legacy.adminId, canCheckIn: false, canFoodCheckIn: false }]);
  });
});

describe("volunteer lifecycle", () => {
  it("resets credentials, invalidates every session, and audits without secrets", async () => {
    const { t, adminId, args, target, session } = await managedFixture();
    const second = await insertStaffSession(t, { adminId, sessionToken: "b".repeat(64) });
    expect(await t.mutation(volunteers.resetVolunteerPassword, { ...target, password: "Replacement123" })).toEqual({ ok: true });
    for (const sessionToken of [session.sessionToken, second.sessionToken]) {
      await expectAdminErrorCode(t.run((ctx) => requireVolunteerAccess(ctx, sessionToken)), "NOT_AUTHENTICATED");
    }
    expect((await mutateOrganizerSignIn(t, { email: args.email, password: args.password })).ok).toBe(false);
    expect((await signInOrganizer(t, args.email, "Replacement123")).ok).toBe(true);
    const logs = await configLogs(t);
    expect(logs.map((entry) => entry.action)).toEqual(["volunteer_created", "volunteer_password_reset"]);
    expect(JSON.stringify(logs)).not.toMatch(/Replacement123|passwordHash/);
  });

  it("revokes sessions, keeps assignments and history, and requires a fresh login after restore", async () => {
    const { t, actor, adminId, args, target, session, eventId } = await managedFixture();
    await t.mutation(volunteers.setVolunteerEventAccess, { ...target, eventIds: [eventId] });
    await t.mutation(volunteers.revokeVolunteer, target);
    expect((await t.run((ctx) => ctx.db.get(adminId)))?.active).toBe(false);
    await expectAdminErrorCode(t.run((ctx) => requireVolunteerEventAccess(ctx, session.sessionToken, eventId)), "NOT_AUTHENTICATED");
    expect((await mutateOrganizerSignIn(t, { email: args.email, password: args.password })).ok).toBe(false);
    expect(await t.run((ctx) => ctx.db.query("volunteerEventAccess").collect())).toHaveLength(1);

    const stale = await insertStaffSession(t, { adminId, sessionToken: "d".repeat(64) });
    await t.mutation(volunteers.restoreVolunteer, target);
    for (const sessionToken of [session.sessionToken, stale.sessionToken]) {
      expect(await t.query(auth.getCurrentStaff, { sessionToken })).toBeNull();
    }
    const fresh = await signInOrganizer(t, args.email);
    expect((await t.run((ctx) => requireVolunteerEventAccess(ctx, fresh.sessionToken, eventId))).volunteer._id).toBe(adminId);
    expect((await configLogs(t)).slice(-2)).toMatchObject([
      { action: "volunteer_revoked", actorAdminId: actor.adminId, createdAt: expect.any(Number),
        details: JSON.stringify({ before: { active: true }, after: { active: false } }) },
      { action: "volunteer_restored", actorAdminId: actor.adminId,
        details: JSON.stringify({ before: { active: false }, after: { active: true } }) },
    ]);
  });

  it("sets capabilities independently, logs before/after, and applies to the next request", async () => {
    const { t, target, session } = await managedFixture();
    const check = (capability: "canCheckIn" | "canFoodCheckIn") =>
      t.run((ctx) => requireVolunteerCapability(ctx, session.sessionToken, capability));
    await expectAdminErrorCode(check("canCheckIn"), "CAPABILITY_DENIED");
    expect(await t.mutation(volunteers.setVolunteerCapabilities, { ...target, canCheckIn: true, canFoodCheckIn: false }))
      .toEqual({ ok: true, changed: true });
    expect((await check("canCheckIn"))._id).toBe(target.volunteerAdminId);
    await expectAdminErrorCode(check("canFoodCheckIn"), "CAPABILITY_DENIED");
    await t.mutation(volunteers.setVolunteerCapabilities, { ...target, canCheckIn: false, canFoodCheckIn: true });
    await expectAdminErrorCode(check("canCheckIn"), "CAPABILITY_DENIED");
    expect((await check("canFoodCheckIn"))._id).toBe(target.volunteerAdminId);
    expect((await configLogs(t)).at(-1)?.details).toBe(JSON.stringify({
      changedFields: ["canCheckIn", "canFoodCheckIn"],
      before: { canCheckIn: true, canFoodCheckIn: false },
      after: { canCheckIn: false, canFoodCheckIn: true },
    }));
    const logCount = (await configLogs(t)).length;
    expect(await t.mutation(volunteers.setVolunteerCapabilities, { ...target, canCheckIn: false, canFoodCheckIn: true }))
      .toEqual({ ok: true, changed: false });
    expect(await configLogs(t)).toHaveLength(logCount);
    await expect(t.mutation(volunteers.setVolunteerCapabilities, { ...target, canCheckIn: "yes", canFoodCheckIn: true }))
      .rejects.toThrow();
  });

  it("saves shop access in the same change when provided and leaves it alone when omitted", async () => {
    const { t, target, session } = await managedFixture();
    const shop = () => t.run((ctx) => requireVolunteerCapability(ctx, session.sessionToken, "canRedeemShop"));
    await expectAdminErrorCode(shop(), "CAPABILITY_DENIED");
    await t.mutation(volunteers.setVolunteerCapabilities, { ...target, canCheckIn: true, canFoodCheckIn: false, canRedeemShop: true });
    expect((await shop())._id).toBe(target.volunteerAdminId);
    expect((await configLogs(t)).at(-1)?.details).toBe(JSON.stringify({
      changedFields: ["canCheckIn", "canRedeemShop"],
      before: { canCheckIn: false, canFoodCheckIn: false, canRedeemShop: false },
      after: { canCheckIn: true, canFoodCheckIn: false, canRedeemShop: true },
    }));
    await t.mutation(volunteers.setVolunteerCapabilities, { ...target, canCheckIn: false, canFoodCheckIn: false });
    expect((await shop())._id).toBe(target.volunteerAdminId);
  });
});

describe("setVolunteerEventAccess", () => {
  it("replaces the assignment set, keeps unchanged rows, and applies removals on the next request", async () => {
    const { t, actor, target, session } = await managedFixture();
    const [a, b, c] = [await seedEvent(t, "A"), await seedEvent(t, "B"), await seedEvent(t, "C")];
    expect(await t.mutation(volunteers.setVolunteerEventAccess, { ...target, eventIds: [a, b] })).toEqual({ ok: true, added: 2, removed: 0 });
    const keptRow = (await t.run((ctx) => ctx.db.query("volunteerEventAccess").collect())).find((row) => row.eventId === b);

    expect(await t.mutation(volunteers.setVolunteerEventAccess, { ...target, eventIds: [b, c] })).toEqual({ ok: true, added: 1, removed: 1 });
    const rows = await t.run((ctx) => ctx.db.query("volunteerEventAccess").collect());
    expect(rows.map((row) => row.eventId).sort()).toEqual([b, c].sort());
    expect(rows.find((row) => row.eventId === b)?._id).toBe(keptRow?._id);
    expect(rows.every((row) => row.grantedBy === actor.adminId)).toBe(true);
    await expectAdminErrorCode(t.run((ctx) => requireVolunteerEventAccess(ctx, session.sessionToken, a)), "EVENT_ACCESS_DENIED");
    expect((await configLogs(t)).at(-1)).toMatchObject({
      action: "volunteer_event_access_updated", actorAdminId: actor.adminId, targetAdminId: target.volunteerAdminId,
      details: JSON.stringify({ eventIds: [b, c], addedEventIds: [c], removedEventIds: [a] }),
    });

    const logCount = (await configLogs(t)).length;
    expect(await t.mutation(volunteers.setVolunteerEventAccess, { ...target, eventIds: [c, b] })).toEqual({ ok: true, added: 0, removed: 0 });
    expect(await configLogs(t)).toHaveLength(logCount);
    await t.mutation(volunteers.setVolunteerEventAccess, { ...target, eventIds: [] });
    expect(await t.run((ctx) => ctx.db.query("volunteerEventAccess").collect())).toEqual([]);
  });

  it("collapses pre-existing duplicate rows to one assignment per event", async () => {
    const { t, actor, target, eventId } = await managedFixture();
    await t.run(async (ctx) => {
      for (let i = 0; i < 2; i++) {
        await ctx.db.insert("volunteerEventAccess", {
          volunteerAdminId: target.volunteerAdminId, eventId, grantedBy: actor.adminId, createdAt: i,
        });
      }
    });
    expect(await t.mutation(volunteers.setVolunteerEventAccess, { ...target, eventIds: [eventId] })).toEqual({ ok: true, added: 0, removed: 0 });
    expect(await t.run((ctx) => ctx.db.query("volunteerEventAccess").collect())).toHaveLength(1);
  });

  it("validates the whole list before changing anything", async () => {
    const { t, target, eventId } = await managedFixture();
    await t.mutation(volunteers.setVolunteerEventAccess, { ...target, eventIds: [eventId] });
    const missing = await seedEvent(t, "Deleted");
    await t.run((ctx) => ctx.db.delete(missing));
    const other = await seedEvent(t, "Other");
    const before = await snapshot(t);
    await expectAdminErrorCode(t.mutation(volunteers.setVolunteerEventAccess, { ...target, eventIds: [other, other] }), "INVALID_EVENT_ASSIGNMENT");
    await expectAdminErrorCode(t.mutation(volunteers.setVolunteerEventAccess, { ...target, eventIds: [other, missing] }), "EVENT_NOT_FOUND");
    const tooMany = await t.run(async (ctx) => {
      const ids = [];
      for (let i = 0; i <= MAX_VOLUNTEER_EVENTS; i++) {
        ids.push(await ctx.db.insert("events", { name: `E${i}`, pointsAwarded: 1, active: true, startsAt: 1, endsAt: 2, createdAt: 1, updatedAt: 1 }));
      }
      return ids;
    });
    const withEvents = await snapshot(t);
    await expectAdminErrorCode(t.mutation(volunteers.setVolunteerEventAccess, { ...target, eventIds: tooMany }), "INVALID_EVENT_ASSIGNMENT");
    expect((await snapshot(t)).assignments).toEqual(before.assignments);
    expect(await snapshot(t)).toEqual(withEvents);
  });

  it("allows removals but rejects new grants for a revoked volunteer", async () => {
    const { t, target, eventId } = await managedFixture();
    await t.mutation(volunteers.setVolunteerEventAccess, { ...target, eventIds: [eventId] });
    await t.mutation(volunteers.revokeVolunteer, target);
    const other = await seedEvent(t, "Other");
    const before = await snapshot(t);
    await expectAdminErrorCode(t.mutation(volunteers.setVolunteerEventAccess, { ...target, eventIds: [eventId, other] }), "ACCOUNT_INACTIVE");
    expect(await snapshot(t)).toEqual(before);
    expect(await t.mutation(volunteers.setVolunteerEventAccess, { ...target, eventIds: [] })).toMatchObject({ removed: 1 });
  });

  it("grants every current and future event when canScanAllEvents is set", async () => {
    const { t, actor, target, session, eventId } = await managedFixture();
    expect(await t.mutation(volunteers.setVolunteerEventAccess, {
      ...target, eventIds: [eventId], canScanAllEvents: true,
    })).toEqual({ ok: true, added: 1, removed: 0 });
    expect(await t.run((ctx) => ctx.db.get(target.volunteerAdminId))).toMatchObject({ canScanAllEvents: true });
    const later = await seedEvent(t, "Later");
    expect((await t.run((ctx) => requireVolunteerEventAccess(ctx, session.sessionToken, later))).event._id).toBe(later);
    expect((await configLogs(t)).at(-1)).toMatchObject({
      action: "volunteer_event_access_updated", actorAdminId: actor.adminId, targetAdminId: target.volunteerAdminId,
    });
    expect(JSON.parse((await configLogs(t)).at(-1)!.details ?? "{}")).toEqual({
      eventIds: [eventId], addedEventIds: [eventId], removedEventIds: [],
      changedFields: ["canScanAllEvents"], before: { canScanAllEvents: false }, after: { canScanAllEvents: true },
    });
    expect(await t.mutation(volunteers.setVolunteerEventAccess, {
      ...target, eventIds: [eventId], canScanAllEvents: false,
    })).toEqual({ ok: true, added: 0, removed: 0 });
    await expectAdminErrorCode(t.run((ctx) => requireVolunteerEventAccess(ctx, session.sessionToken, later)), "EVENT_ACCESS_DENIED");
  });
});

describe("audit log queries", () => {
  async function logFixture() {
    const base = await managedFixture();
    const { t, actor, adminId, eventId } = base;
    const { participantId } = await seedParticipant(t, actor.adminId);
    const otherEvent = await seedEvent(t, "Hacking");
    await t.run(async (ctx) => {
      const rows = [
        { actorAdminId: adminId, action: "check_in" as const, createdAt: 100 },
        { actorAdminId: adminId, action: "point_scan" as const, eventId, pointsDelta: 10, reason: "ignored", createdAt: 200 },
        { actorAdminId: actor.adminId, action: "admin_adjust" as const, pointsDelta: -5, reason: "Duplicate scan", createdAt: 300 },
        { actorAdminId: adminId, action: "point_scan" as const, eventId: otherEvent, pointsDelta: 10, createdAt: 400 },
      ];
      for (const row of rows) await ctx.db.insert("volunteerActionLogs", { participantId, ...row });
    });
    return { ...base, participantId, otherEvent };
  }

  it("returns named, newest-first action history with deltas and admin reasons only", async () => {
    const { t, actor, adminId, participantId, eventId } = await logFixture();
    const result = await t.query(volunteers.listVolunteerActionLogs, { sessionToken: actor.sessionToken, paginationOpts: page });
    expect(result.page.map((row) => row.createdAt)).toEqual([400, 300, 200, 100]);
    expect(result.page[1]).toEqual({
      logId: expect.any(String), actor: { adminId: actor.adminId, name: "Admin Ada" }, action: "admin_adjust",
      participant: { participantId, name: "Taylor Student" }, event: null, pointsDelta: -5, reason: "Duplicate scan", createdAt: 300,
    });
    expect(result.page[2]).toMatchObject({
      actor: { adminId, name: "Volunteer" }, event: { eventId, name: "Workshop" }, pointsDelta: 10, reason: null,
    });
    expect(result.page[3]).toMatchObject({ event: null, pointsDelta: null });
  });

  it.each([
    ["volunteer", (f: Awaited<ReturnType<typeof logFixture>>) => ({ volunteerAdminId: f.adminId }), [400, 200, 100]],
    ["action", () => ({ action: "point_scan" }), [400, 200]],
    ["participant", (f: Awaited<ReturnType<typeof logFixture>>) => ({ participantId: f.participantId }), [400, 300, 200, 100]],
    ["event", (f: Awaited<ReturnType<typeof logFixture>>) => ({ eventId: f.eventId }), [200]],
    ["date range", () => ({ from: 150, to: 300 }), [300, 200]],
    ["combined", (f: Awaited<ReturnType<typeof logFixture>>) => ({ participantId: f.participantId, volunteerAdminId: f.adminId, action: "point_scan", from: 300 }), [400]],
  ] as const)("filters action history by %s", async (_label, filters, expected) => {
    const f = await logFixture();
    const result = await f.t.query(volunteers.listVolunteerActionLogs, {
      sessionToken: f.actor.sessionToken, paginationOpts: page, ...filters(f),
    } as never);
    expect(result.page.map((row: { createdAt: number }) => row.createdAt)).toEqual(expected);
  });

  it("paginates action history with a stable cursor and rejects inverted ranges", async () => {
    const { t, actor } = await logFixture();
    const first = await t.query(volunteers.listVolunteerActionLogs, { sessionToken: actor.sessionToken, paginationOpts: { numItems: 3, cursor: null } });
    const second = await t.query(volunteers.listVolunteerActionLogs, {
      sessionToken: actor.sessionToken, paginationOpts: { numItems: 3, cursor: first.continueCursor },
    });
    expect([...first.page, ...second.page].map((row) => row.createdAt)).toEqual([400, 300, 200, 100]);
    expect(second.isDone).toBe(true);
    await expectAdminErrorCode(t.query(volunteers.listVolunteerActionLogs, {
      sessionToken: actor.sessionToken, paginationOpts: page, from: 5, to: 1,
    }), "INVALID_LOG_FILTER");
  });

  it("lists staff configuration logs with names and parsed details, filterable by target and action", async () => {
    const { t, actor, target, eventId, adminId } = await managedFixture();
    await t.mutation(volunteers.setVolunteerEventAccess, { ...target, eventIds: [eventId] });
    await t.mutation(volunteers.revokeVolunteer, target);
    await t.mutation(volunteers.createVolunteer, { sessionToken: actor.sessionToken, email: "other@hackuta.org", name: "Other", password: ORGANIZER_TEST_PASSWORD, canCheckIn: false, canFoodCheckIn: false });
    const { participantId } = await seedParticipant(t, actor.adminId);
    await t.mutation(participantsAdmin.promoteParticipantToVolunteer, { sessionToken: actor.sessionToken, participantId, password: ORGANIZER_TEST_PASSWORD });
    await t.run((ctx) => ctx.db.insert("staffConfigLogs", { actorAdminId: actor.adminId, action: "event_updated", targetEventId: eventId, createdAt: Date.now() + 1 }));

    const all = await t.query(volunteers.listStaffConfigLogs, { sessionToken: actor.sessionToken, paginationOpts: page });
    expect(all.page.map((row) => row.action)).toEqual([
      "event_updated", "volunteer_promoted", "volunteer_created", "volunteer_revoked", "volunteer_event_access_updated", "volunteer_created",
    ]);
    expect(all.page[0]).toMatchObject({ target: null, event: { eventId, name: "Workshop" }, participant: null, details: null });
    expect(all.page[1]).toMatchObject({ participant: { participantId, name: "Taylor Student" } });
    const forVolunteer = await t.query(volunteers.listStaffConfigLogs, { sessionToken: actor.sessionToken, paginationOpts: page, targetAdminId: adminId });
    expect(forVolunteer.page.map((row) => row.action)).toEqual(["volunteer_revoked", "volunteer_event_access_updated", "volunteer_created"]);
    expect(forVolunteer.page[0]).toMatchObject({
      actor: { adminId: actor.adminId, name: "Admin Ada" }, target: { adminId, name: "Volunteer" },
      details: { before: { active: true }, after: { active: false } },
    });
    const revocations = await t.query(volunteers.listStaffConfigLogs, {
      sessionToken: actor.sessionToken, paginationOpts: page, action: "volunteer_revoked",
    });
    expect(revocations.page).toHaveLength(1);
    const promotions = await t.query(volunteers.listStaffConfigLogs, {
      sessionToken: actor.sessionToken, paginationOpts: page, action: "volunteer_promoted",
    });
    expect(promotions.page).toMatchObject([{ action: "volunteer_promoted", participant: { participantId } }]);
    await expectAdminErrorCode(t.query(volunteers.listStaffConfigLogs, {
      sessionToken: actor.sessionToken, paginationOpts: page, from: Number.NaN,
    }), "INVALID_LOG_FILTER");
  });
});

describe("privilege escalation", () => {
  function managementCalls(f: Awaited<ReturnType<typeof managedFixture>>, sessionToken: string) {
    const target = { sessionToken, volunteerAdminId: f.adminId };
    return [
      () => t(f).query(volunteers.listVolunteers, { sessionToken, paginationOpts: page }),
      () => t(f).query(volunteers.listVolunteerActionLogs, { sessionToken, paginationOpts: page }),
      () => t(f).query(volunteers.listStaffConfigLogs, { sessionToken, paginationOpts: page }),
      () => t(f).mutation(volunteers.createVolunteer, { sessionToken, email: "new@hackuta.org", name: "New", password: ORGANIZER_TEST_PASSWORD, canCheckIn: true, canFoodCheckIn: true }),
      () => t(f).mutation(volunteers.resetVolunteerPassword, { ...target, password: "Replacement123" }),
      () => t(f).mutation(volunteers.revokeVolunteer, target),
      () => t(f).mutation(volunteers.restoreVolunteer, target),
      () => t(f).mutation(volunteers.setVolunteerCapabilities, { ...target, canCheckIn: true, canFoodCheckIn: true }),
      () => t(f).mutation(volunteers.setVolunteerEventAccess, { ...target, eventIds: [f.eventId] }),
    ];
  }
  const t = (f: { t: ConvexTestInstance }) => f.t;

  it.each(["volunteer", "expired", "inactive", "invalid"] as const)(
    "denies every management API to a caller who is %s", async (condition) => {
      const f = await managedFixture();
      if (condition === "volunteer") {
        await f.t.run((ctx) => ctx.db.patch(f.actor.adminId, { role: "volunteer" }));
      } else if (condition === "inactive") {
        await f.t.run((ctx) => ctx.db.patch(f.actor.adminId, { active: false }));
      } else if (condition === "expired") {
        await f.t.run((ctx) => ctx.db.patch(f.actor.sessionId, { expiresAt: Date.now() - 1 }));
      }
      const sessionToken = condition === "invalid" ? "" : f.actor.sessionToken;
      const code = condition === "volunteer" ? "NOT_AUTHORIZED" : "NOT_AUTHENTICATED";
      const before = await snapshot(f.t);
      for (const call of managementCalls(f, sessionToken)) await expectAdminErrorCode(call(), code);
      expect(await snapshot(f.t)).toEqual(before);
    },
  );

  it("stops a volunteer from changing their own permissions, events, or account", async () => {
    const f = await managedFixture();
    const before = await snapshot(f.t);
    for (const call of managementCalls(f, f.session.sessionToken)) await expectAdminErrorCode(call(), "NOT_AUTHORIZED");
    expect(await snapshot(f.t)).toEqual(before);
  });

  it.each(["admin", "missing"] as const)("never manages a %s target as a volunteer", async (condition) => {
    const f = await managedFixture();
    if (condition === "missing") await f.t.run((ctx) => ctx.db.delete(f.adminId));
    else await f.t.run((ctx) => ctx.db.patch(f.adminId, { role: condition }));
    const before = await snapshot(f.t);
    for (const call of managementCalls(f, f.actor.sessionToken).slice(4)) {
      await expectAdminErrorCode(call(), "VOLUNTEER_NOT_FOUND");
    }
    expect(await snapshot(f.t)).toEqual(before);
  });

  it("keeps existing admin credentials working after volunteer management", async () => {
    const f = await managedFixture();
    await seedAdminAccount(f.t, { email: "admin@hackuta.org", role: "admin", active: true });
    await f.t.mutation(volunteers.setVolunteerCapabilities, { ...f.target, canCheckIn: true, canFoodCheckIn: true });
    await f.t.mutation(volunteers.revokeVolunteer, f.target);
    await f.t.mutation(volunteers.restoreVolunteer, f.target);
    const { sessionToken } = await signInOrganizer(f.t, "admin@hackuta.org");
    expect(await f.t.query(auth.getCurrentStaff, { sessionToken })).toMatchObject({ role: "admin" });
  });
});
