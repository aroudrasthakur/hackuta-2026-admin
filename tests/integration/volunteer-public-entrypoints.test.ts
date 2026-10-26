import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeFunctionReference } from "convex/server";
import { describe, expect, it } from "vitest";
import { anyApi, type ApiFromModules } from "convex/server";
import type * as volunteersModule from "../../convex/admin/volunteers";
import {
  getApplicationRef,
  listApplicationReviewLogsRef,
  listDecisionEmailQueueRef,
  listSubmittedApplicationsRef,
  logApplicationReviewActionRef,
  setApplicationDecisionRef,
  retryFailedDecisionEmailsRef,
} from "../../src/convex/adminApi";
import { awardEventPoints, adjustPoints } from "../../convex/admin/pointsLedger";
import { expectAdminErrorCode } from "../helpers/adminErrors";
import { createConvexTest } from "../helpers/convexTestContext";
import { seedApplicant, seedStaff } from "../helpers/reviewTestKit";
import { ORGANIZER_TEST_PASSWORD, seedAdminAccount } from "../helpers/staffTestFixtures";

const adminDir = join(process.cwd(), "convex", "admin");

/** Each public organizer API must call its guard before sensitive reads/writes. Update when adding endpoints. */
const PUBLIC_ENTRY_GUARDS = [
  { file: "applications.ts", exportName: "listSubmittedApplications", guard: "requireReviewerAccess" },
  { file: "applications.ts", exportName: "getApplication", guard: "requireReviewerAccess" },
  { file: "applications.ts", exportName: "createSampleApplication", guard: "requireAdminRole" },
  { file: "applicationReviewLogs.ts", exportName: "logApplicationReviewAction", guard: "requireReviewerAccess" },
  { file: "applicationReviewLogs.ts", exportName: "setApplicationDecision", guard: "requireReviewerAccess" },
  { file: "applicationReviewLogs.ts", exportName: "listApplicationReviewLogs", guard: "requireAdminRole" },
  { file: "decisionEmailQueue.ts", exportName: "listDecisionEmailQueue", guard: "requireReviewerAccess" },
  { file: "decisionEmailQueue.ts", exportName: "setDecisionEmailHold", guard: "requireAdminRole" },
  { file: "decisionEmailQueue.ts", exportName: "retryFailedDecisionEmails", guard: "requireAdminRole" },
  { file: "auth.ts", exportName: "createAndProvisionAdmin", guard: "requireAdminRole" },
  ...[
    "createVolunteer", "listVolunteers", "resetVolunteerPassword",
    "setVolunteerCapabilities", "setVolunteerEventAccess", "listVolunteerActionLogs", "listStaffConfigLogs",
  ].map((exportName) => ({ file: "volunteers.ts", exportName, guard: "requireAdminRole" })),
  ...[
    "listParticipants", "getParticipantDetails", "setParticipantPoints",
    "listPointAdjustments", "promoteParticipantToVolunteer",
  ].map((exportName) => ({ file: "participantsAdmin.ts", exportName, guard: "requireAdminRole" })),
  ...["revokeVolunteer", "restoreVolunteer"].map((exportName) => ({
    file: "volunteers.ts", exportName, guard: "volunteerActiveMutation",
  })),
  { file: "volunteerScan.ts", exportName: "listMyScanOptions", guard: "requireVolunteerAccess" },
  { file: "volunteerScan.ts", exportName: "resolveQrForScan", guard: "requireVolunteerAccess" },
  { file: "volunteerOperations.ts", exportName: "checkInParticipant", guard: "requireVolunteerAccess" },
  { file: "volunteerOperations.ts", exportName: "foodCheckInParticipant", guard: "requireVolunteerAccess" },
  { file: "volunteerOperations.ts", exportName: "awardEventPoints", guard: "requireVolunteerAccess" },
  ...[
    "generateShopImageUploadUrl", "createShopItem", "updateShopItem", "setShopItemStatus", "adjustShopStock",
    "listShopItemsAdmin", "listInventoryAdjustments", "listShopRedemptions", "refundShopRedemption",
    "listShopVolunteers", "setVolunteerShopAccess",
  ].map((exportName) => ({ file: "shopAdmin.ts", exportName, guard: "requireAdminRole" })),
  ...["createFlashSale", "updateFlashSale", "cancelFlashSale", "listFlashSales"].map((exportName) => ({
    file: "shopFlashSales.ts", exportName, guard: "requireAdminRole",
  })),
  ...["listShopCatalogForVolunteer", "getShopCustomer", "previewShopPurchase", "purchaseShopItem"].map((exportName) => ({
    file: "shopRedemption.ts", exportName, guard: "requireShopVolunteer",
  })),
] as const;

function exportSection(source: string, exportName: string) {
  const marker = `export const ${exportName}`;
  const start = source.indexOf(marker);
  expect(start, `missing export ${exportName}`).toBeGreaterThanOrEqual(0);
  const next = source.indexOf("\nexport const ", start + marker.length);
  return next === -1 ? source.slice(start) : source.slice(start, next);
}

describe("volunteer authorization contract (public entry points)", () => {
  it("documents the guard contract beside staffAuth", () => {
    const doc = readFileSync(join(adminDir, "VOLUNTEER_AUTHORIZATION.md"), "utf8");
    expect(doc).toContain("Route redirects are not protection");
    expect(doc).toContain("requireVolunteerEventAccess");
    expect(doc).toContain("awardEventPoints");
    expect(staffAuthSource()).toContain("VOLUNTEER_AUTHORIZATION.md");
  });

  it.each(PUBLIC_ENTRY_GUARDS)("$file:$exportName calls $guard before work", ({ file, exportName, guard }) => {
    const source = readFileSync(join(adminDir, file), "utf8");
    expect(exportSection(source, exportName)).toContain(guard);
  });

  it("guards the shared revoke/restore factory with requireAdminRole", () => {
    const source = readFileSync(join(adminDir, "volunteers.ts"), "utf8");
    const factory = source.slice(
      source.indexOf("function volunteerActiveMutation"),
      source.indexOf("export const revokeVolunteer"),
    );
    expect(factory).toContain("requireAdminRole");
  });

  it("keeps participant and ledger modules off the public Convex API", () => {
    for (const file of [
      "participants.ts", "pointsLedger.ts", "pointsBackfill.ts",
      "volunteerProvisioning.ts", "adminQueryHelpers.ts",
    ]) {
      const source = readFileSync(join(adminDir, file), "utf8");
      expect(source).not.toMatch(/export const \w+ = (mutation|query|action)\(/);
    }
  });

  it("exposes event awards only from volunteerOperations, with no client points argument", () => {
    const operations = readFileSync(join(adminDir, "volunteerOperations.ts"), "utf8");
    expect(exportSection(operations, "awardEventPoints")).not.toMatch(/points\w*\s*:\s*v\./i);
    const files = [
      "applications.ts",
      "applicationReviewLogs.ts",
      "auth.ts",
      "volunteers.ts",
      "volunteerScan.ts",
      "participantsAdmin.ts",
    ];
    for (const file of files) {
      const source = readFileSync(join(adminDir, file), "utf8");
      expect(source).not.toContain("awardEventPoints");
    }
  });
});

function staffAuthSource() {
  return readFileSync(join(adminDir, "staffAuth.ts"), "utf8");
}

describe("volunteer unsafe-path invariants", () => {
  it("rejects a volunteer from every review API surface", async () => {
    const t = createConvexTest();
    const { sessionToken } = await seedStaff(t, { role: "volunteer" });
    const { applicationId } = await seedApplicant(t);
    const page = { numItems: 10, cursor: null };

    await expectAdminErrorCode(t.query(listSubmittedApplicationsRef, { sessionToken }), "NOT_AUTHORIZED");
    await expectAdminErrorCode(t.query(getApplicationRef, { sessionToken, applicationId }), "NOT_AUTHORIZED");
    await expectAdminErrorCode(
      t.mutation(logApplicationReviewActionRef, { sessionToken, applicationId, action: "viewed" }),
      "NOT_AUTHORIZED",
    );
    await expectAdminErrorCode(
      t.mutation(setApplicationDecisionRef, { sessionToken, applicationId, decision: "accepted" }),
      "NOT_AUTHORIZED",
    );
    await expectAdminErrorCode(
      t.query(listApplicationReviewLogsRef, { sessionToken, applicationId, paginationOpts: page }),
      "NOT_AUTHORIZED",
    );
    await expectAdminErrorCode(t.query(listDecisionEmailQueueRef, { sessionToken }), "NOT_AUTHORIZED");
    await expectAdminErrorCode(t.mutation(retryFailedDecisionEmailsRef, { sessionToken }), "NOT_AUTHORIZED");
    expect(await t.run((ctx) => ctx.db.query("participants").collect())).toEqual([]);
  });

  it("rejects volunteer management and point adjustment without admin role", async () => {
    const t = createConvexTest();
    const volunteer = await seedStaff(t, { role: "volunteer" });
    const adminId = await seedAdminAccount(t, { email: "admin@hackuta.org", role: "admin", active: true });
    const participantId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "p@example.com", name: "P" });
      const applicationId = await ctx.db.insert("applications", {
        authUserId: userId,
        email: "p@example.com",
        createdAt: 1,
        formSubmitted: true,
        submittedAt: 2,
      });
      await ctx.db.insert("applicationReviews", {
        applicationId,
        status: "accepted",
        createdAt: 1,
        updatedAt: 1,
      });
      return ctx.db.insert("participants", {
        applicationId,
        authUserId: userId,
        acceptedAt: 3,
        acceptedBy: adminId,
        qrCodeToken: "c".repeat(64),
        points: 0,
        createdAt: 3,
        updatedAt: 3,
      });
    });

    const { volunteers } = (anyApi as ApiFromModules<{
      "admin/volunteers": typeof volunteersModule;
    }>).admin;

    await expectAdminErrorCode(
      t.mutation(volunteers.createVolunteer, {
        sessionToken: volunteer.sessionToken,
        email: "new-v@example.com",
        name: "New",
        password: ORGANIZER_TEST_PASSWORD,
        canCheckIn: true,
        canFoodCheckIn: true,
      }),
      "NOT_AUTHORIZED",
    );
    await expectAdminErrorCode(
      t.run((ctx) =>
        adjustPoints(ctx, {
          actorAdminId: volunteer.adminId,
          participantId,
          delta: 5,
          reason: "volunteer adjust",
        }),
      ),
      "ADMIN_ONLY",
    );
    expect(await t.run((ctx) => ctx.db.query("participantEventAwards").collect())).toEqual([]);
  });

  it("documents that awardEventPoints does not enforce volunteer assignment by itself", async () => {
    const t = createConvexTest();
    const volunteer = await seedStaff(t, { role: "volunteer" });
    const adminId = await seedAdminAccount(t, { email: "actor@hackuta.org", role: "admin", active: true });
    const eventId = await t.run((ctx) =>
      ctx.db.insert("events", {
        name: "Workshop",
        pointsAwarded: 5,
        startsAt: 1,
        endsAt: 2,
        active: true,
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    const participantId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "scan@example.com", name: "Scan" });
      const applicationId = await ctx.db.insert("applications", {
        authUserId: userId,
        email: "scan@example.com",
        createdAt: 1,
        formSubmitted: true,
        submittedAt: 2,
      });
      await ctx.db.insert("applicationReviews", {
        applicationId,
        status: "accepted",
        createdAt: 1,
        updatedAt: 1,
      });
      return ctx.db.insert("participants", {
        applicationId,
        authUserId: userId,
        acceptedAt: 3,
        acceptedBy: adminId,
        qrCodeToken: "d".repeat(64),
        points: 0,
        createdAt: 3,
        updatedAt: 3,
      });
    });

    await t.run((ctx) =>
      awardEventPoints(ctx, {
        actorAdminId: volunteer.adminId,
        participantId,
        eventId,
        now: Date.now(),
      }),
    );
    expect(await t.run((ctx) => ctx.db.query("participantEventAwards").collect())).toHaveLength(1);
  });
});

void makeFunctionReference;
