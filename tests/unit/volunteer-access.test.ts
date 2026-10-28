import { afterEach, describe, expect, it, vi } from "vitest";
import {
  newVolunteerFields,
  requireAdminRole,
  requireVolunteerAccess,
  requireVolunteerEventAccess,
  requireVolunteerCapability,
  volunteerCapabilities,
} from "../../convex/admin/staffAuth";
import { expectAdminErrorCode } from "../helpers/adminErrors";
import { createConvexTest } from "../helpers/convexTestContext";
import { seedStaff } from "../helpers/reviewTestKit";
import {
  seedAdminAccount,
  signInOrganizer,
} from "../helpers/staffTestFixtures";

afterEach(() => vi.useRealTimers());

describe("volunteer capabilities", () => {
  it("treats a missing or false flag as denied", () => {
    expect(volunteerCapabilities({})).toEqual({ canCheckIn: false, canFoodCheckIn: false, canRedeemShop: false });
    expect(newVolunteerFields()).toEqual({
      role: "volunteer",
      canCheckIn: false,
      canFoodCheckIn: false,
      canRedeemShop: false,
      canScanAllEvents: false,
    });
    expect(volunteerCapabilities(newVolunteerFields())).toEqual({
      canCheckIn: false,
      canFoodCheckIn: false,
      canRedeemShop: false,
    });
    expect(volunteerCapabilities({ canCheckIn: true, canFoodCheckIn: false, canRedeemShop: true })).toEqual({
      canCheckIn: true,
      canFoodCheckIn: false,
      canRedeemShop: true,
    });
  });

  it("lets a legacy admin without volunteer fields sign in", async () => {
    const t = createConvexTest();
    const adminId = await seedAdminAccount(t, {
      email: "legacy@hackuta.org",
      role: "admin",
      active: true,
    });

    const session = await signInOrganizer(t, "legacy@hackuta.org");
    expect(session.sessionToken.length).toBeGreaterThanOrEqual(32);

    const admin = await t.run(async (ctx) => ctx.db.get(adminId));
    expect(admin?.role).toBe("admin");
    expect(admin?.participantId).toBeUndefined();
    expect(admin?.canCheckIn).toBeUndefined();
    expect(admin?.canFoodCheckIn).toBeUndefined();
    expect(volunteerCapabilities(admin ?? {})).toEqual({
      canCheckIn: false,
      canFoodCheckIn: false,
      canRedeemShop: false,
    });
  });
});

describe("volunteer session guards", () => {
  it("rejects volunteers from admin operations", async () => {
    const t = createConvexTest();
    const { sessionToken } = await seedStaff(t, { role: "volunteer" });

    await expectAdminErrorCode(
      t.run((ctx) => requireAdminRole(ctx, sessionToken)),
      "NOT_AUTHORIZED",
    );
  });

  it("rejects signed-out callers from volunteer operations while allowing admins", async () => {
    const t = createConvexTest();
    const admin = await seedStaff(t, { role: "admin" });

    const resolvedAdmin = await t.run((ctx) => requireVolunteerAccess(ctx, admin.sessionToken));
    expect(resolvedAdmin._id).toBe(admin.adminId);
    for (const capability of ["canCheckIn", "canFoodCheckIn", "canRedeemShop"] as const) {
      const capableAdmin = await t.run((ctx) => requireVolunteerCapability(ctx, admin.sessionToken, capability));
      expect(capableAdmin._id).toBe(admin.adminId);
    }
    await expectAdminErrorCode(
      t.run((ctx) => requireVolunteerAccess(ctx, "")),
      "NOT_AUTHENTICATED",
    );
  });

  it("requires an explicit true capability on an active volunteer", async () => {
    const t = createConvexTest();
    const { adminId: volunteerId, sessionToken } = await seedStaff(t, { role: "volunteer" });

    await expectAdminErrorCode(
      t.run((ctx) => requireVolunteerCapability(ctx, sessionToken, "canCheckIn")),
      "CAPABILITY_DENIED",
    );

    await t.run((ctx) => ctx.db.patch(volunteerId, { canCheckIn: true, canFoodCheckIn: false }));
    const volunteer = await t.run((ctx) => requireVolunteerCapability(ctx, sessionToken, "canCheckIn"));
    expect(volunteer._id).toBe(volunteerId);
    await expectAdminErrorCode(
      t.run((ctx) => requireVolunteerCapability(ctx, sessionToken, "canFoodCheckIn")),
      "CAPABILITY_DENIED",
    );

    await t.run((ctx) => ctx.db.patch(volunteerId, { canCheckIn: false }));
    await expectAdminErrorCode(
      t.run((ctx) => requireVolunteerCapability(ctx, sessionToken, "canCheckIn")),
      "CAPABILITY_DENIED",
    );

    await t.run((ctx) => ctx.db.patch(volunteerId, { active: false }));
    await expectAdminErrorCode(
      t.run((ctx) => requireVolunteerAccess(ctx, sessionToken)),
      "NOT_AUTHENTICATED",
    );
  });

  it.each(["invalid", "expired", "revoked", "orphaned"] as const)(
    "rejects a volunteer with an %s session", async (condition) => {
      const t = createConvexTest();
      const { adminId, sessionId, sessionToken } = await seedStaff(t, {
        role: "volunteer", expiresAt: condition === "expired" ? Date.now() - 1 : undefined,
      });
      if (condition === "revoked") await t.run((ctx) => ctx.db.delete(sessionId));
      if (condition === "orphaned") await t.run((ctx) => ctx.db.delete(adminId));
      await expectAdminErrorCode(
        t.run((ctx) => requireVolunteerAccess(ctx, condition === "invalid" ? "f".repeat(64) : sessionToken)),
        "NOT_AUTHENTICATED",
      );
    },
  );
});

describe("volunteer event authorization", () => {
  async function fixture() {
    const t = createConvexTest();
    const { adminId, sessionToken } = await seedStaff(t, { role: "volunteer" });
    const startsAt = Date.now() - 1000;
    const endsAt = Date.now() + 10_000;
    const eventId = await t.run((ctx) => ctx.db.insert("events", {
      name: "Workshop", pointsAwarded: 10, startsAt, endsAt, active: true,
      createdAt: 1, updatedAt: 1,
    }));
    const check = () => t.run((ctx) => requireVolunteerEventAccess(ctx, sessionToken, eventId));
    return { t, adminId, sessionToken, eventId, startsAt, endsAt, check };
  }

  it("requires the caller's own assignment and rechecks assignment removal", async () => {
    const { t, adminId, eventId, check } = await fixture();
    const otherId = await seedAdminAccount(t, { email: "other@hackuta.org", role: "admin", active: true });
    await t.run((ctx) => ctx.db.insert("volunteerEventAccess", {
      volunteerAdminId: otherId, eventId, grantedBy: otherId, createdAt: 1,
    }));
    await expectAdminErrorCode(check(), "EVENT_ACCESS_DENIED");
    const assignmentId = await t.run((ctx) => ctx.db.insert("volunteerEventAccess", {
      volunteerAdminId: adminId, eventId, grantedBy: otherId, createdAt: 1,
    }));
    expect((await check()).volunteer._id).toBe(adminId);
    await t.run((ctx) => ctx.db.delete(assignmentId));
    await expectAdminErrorCode(check(), "EVENT_ACCESS_DENIED");
  });

  it("permits assigned active events before, during, and after their reference schedule", async () => {
    const { t, adminId, eventId, startsAt, endsAt, check } = await fixture();
    await t.run((ctx) => ctx.db.insert("volunteerEventAccess", {
      volunteerAdminId: adminId, eventId, grantedBy: adminId, createdAt: 1,
    }));
    vi.useFakeTimers();
    for (const now of [startsAt - 1, startsAt, endsAt, endsAt + 1]) {
      vi.setSystemTime(now);
      expect((await check()).event._id).toBe(eventId);
    }
  });

  it("rejects inactive and missing events even with an assignment", async () => {
    const { t, adminId, eventId, check } = await fixture();
    await t.run((ctx) => ctx.db.insert("volunteerEventAccess", {
      volunteerAdminId: adminId, eventId, grantedBy: adminId, createdAt: 1,
    }));
    await t.run((ctx) => ctx.db.patch(eventId, { active: false }));
    await expectAdminErrorCode(check(), "EVENT_INACTIVE");
    await t.run((ctx) => ctx.db.delete(eventId));
    await expectAdminErrorCode(check(), "EVENT_NOT_FOUND");
  });

  it("allows an admin without an assignment", async () => {
    const { t, adminId, check } = await fixture();
    await t.run((ctx) => ctx.db.patch(adminId, { role: "admin" }));
    expect((await check()).volunteer._id).toBe(adminId);
  });

  it("allows a volunteer with canScanAllEvents to award a new event without an assignment row", async () => {
    const { t, adminId, sessionToken, eventId, check } = await fixture();
    await expectAdminErrorCode(check(), "EVENT_ACCESS_DENIED");
    await t.run((ctx) => ctx.db.patch(adminId, { canScanAllEvents: true }));
    expect((await check()).event._id).toBe(eventId);
    const laterEvent = await t.run((ctx) => ctx.db.insert("events", {
      name: "Added later", pointsAwarded: 5, startsAt: 1, endsAt: 2, active: true, createdAt: 1, updatedAt: 1,
    }));
    expect((await t.run((ctx) => requireVolunteerEventAccess(ctx, sessionToken, laterEvent))).event._id).toBe(laterEvent);
  });
});
