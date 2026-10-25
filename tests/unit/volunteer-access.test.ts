import { describe, expect, it } from "vitest";
import {
  newVolunteerFields,
  requireAdminRole,
  requireReviewerAccess,
  requireVolunteer,
  requireVolunteerCapability,
  volunteerCapabilities,
} from "../../convex/admin/staffAuth";
import { expectAdminErrorCode } from "../helpers/adminErrors";
import { createConvexTest } from "../helpers/convexTestContext";
import {
  insertStaffSession,
  seedAdminAccount,
  signInOrganizer,
} from "../helpers/staffTestFixtures";

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
    const volunteerId = await t.run((ctx) =>
      ctx.db.insert("admins", {
        email: "volunteer@hackuta.org",
        name: "Volunteer",
        active: true,
        createdAt: 1,
        updatedAt: 1,
        ...newVolunteerFields(),
      }),
    );
    const { sessionToken } = await insertStaffSession(t, { adminId: volunteerId });

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
    const reviewerId = await t.run((ctx) =>
      ctx.db.insert("admins", {
        email: "reviewer@hackuta.org",
        name: "Reviewer",
        role: "reviewer",
        active: true,
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    const adminId = await t.run((ctx) =>
      ctx.db.insert("admins", {
        email: "admin@hackuta.org",
        name: "Admin",
        role: "admin",
        active: true,
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    const reviewer = await insertStaffSession(t, { adminId: reviewerId, sessionToken: "r".repeat(64) });
    const admin = await insertStaffSession(t, { adminId, sessionToken: "d".repeat(64) });

    await expectAdminErrorCode(
      t.run((ctx) => requireVolunteer(ctx, reviewer.sessionToken)),
      "VOLUNTEER_ONLY",
    );
    await expectAdminErrorCode(
      t.run((ctx) => requireVolunteer(ctx, admin.sessionToken)),
      "VOLUNTEER_ONLY",
    );
    await expectAdminErrorCode(
      t.run((ctx) => requireVolunteer(ctx, "")),
      "NOT_AUTHENTICATED",
    );
  });

  it("requires an explicit true capability on an active volunteer", async () => {
    const t = createConvexTest();
    const volunteerId = await t.run((ctx) =>
      ctx.db.insert("admins", {
        email: "scanner@hackuta.org",
        name: "Scanner",
        active: true,
        createdAt: 1,
        updatedAt: 1,
        role: "volunteer" as const,
      }),
    );
    const { sessionToken } = await insertStaffSession(t, { adminId: volunteerId });

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

    await t.run((ctx) => ctx.db.patch(volunteerId, { active: false }));
    await expectAdminErrorCode(
      t.run((ctx) => requireVolunteer(ctx, sessionToken)),
      "NOT_AUTHENTICATED",
    );
  });
});
