import { afterEach, describe, expect, it, vi } from "vitest";
import {
  newVolunteerFields,
  requireAdminRole,
  requireReviewerAccess,
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
    expect(volunteerCapabilities({})).toEqual({ canCheckIn: false, canFoodCheckIn: false });
    expect(newVolunteerFields()).toEqual({
      role: "volunteer",
      canCheckIn: false,
      canFoodCheckIn: false,
    });
    expect(volunteerCapabilities(newVolunteerFields())).toEqual({
      canCheckIn: false,
      canFoodCheckIn: false,
    });
    expect(volunteerCapabilities({ canCheckIn: true, canFoodCheckIn: false })).toEqual({
      canCheckIn: true,
      canFoodCheckIn: false,
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
    });
  });
});

describe("volunteer session guards", () => {
  it("rejects volunteers from reviewer and admin operations", async () => {
    const t = createConvexTest();
    const { sessionToken } = await seedStaff(t, { role: "volunteer" });

    await expectAdminErrorCode(
      t.run((ctx) => requireReviewerAccess(ctx, sessionToken)),
      "NOT_AUTHORIZED",
    );
    await expectAdminErrorCode(
      t.run((ctx) => requireAdminRole(ctx, sessionToken)),
      "NOT_AUTHORIZED",
    );
  });

  it("rejects reviewers, admins, and signed-out callers from volunteer operations", async () => {
    const t = createConvexTest();
    const reviewer = await seedStaff(t, { role: "reviewer" });
    const admin = await seedStaff(t, { role: "admin" });

    await expectAdminErrorCode(
      t.run((ctx) => requireVolunteerAccess(ctx, reviewer.sessionToken)),
      "VOLUNTEER_ONLY",
    );
    await expectAdminErrorCode(
      t.run((ctx) => requireVolunteerAccess(ctx, admin.sessionToken)),
      "VOLUNTEER_ONLY",
    );
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

  it("permits an assigned event only from startsAt up to, but not including, endsAt", async () => {
    const { t, adminId, eventId, startsAt, endsAt, check } = await fixture();
    await t.run((ctx) => ctx.db.insert("volunteerEventAccess", {
      volunteerAdminId: adminId, eventId, grantedBy: adminId, createdAt: 1,
    }));
    vi.useFakeTimers();
    for (const now of [startsAt, endsAt - 1]) {
      vi.setSystemTime(now);
      expect((await check()).event._id).toBe(eventId);
    }
    for (const now of [startsAt - 1, endsAt, endsAt + 1]) {
      vi.setSystemTime(now);
      await expectAdminErrorCode(check(), "EVENT_INACTIVE");
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

  it.each(["admin", "reviewer"] as const)("rejects an assigned %s", async (role) => {
    const { t, adminId, eventId, check } = await fixture();
    await t.run(async (ctx) => {
      await ctx.db.patch(adminId, { role });
      await ctx.db.insert("volunteerEventAccess", {
        volunteerAdminId: adminId, eventId, grantedBy: adminId, createdAt: 1,
      });
    });
    await expectAdminErrorCode(check(), "VOLUNTEER_ONLY");
  });
});
