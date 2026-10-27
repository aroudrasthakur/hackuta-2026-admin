import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import type { GenericId } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { createMealPeriodRef, listMealPeriodsRef } from "../../src/convex/mealsApi";
import { convexTestModules, createConvexTest } from "../helpers/convexTestContext";
import { seedApplicant, seedStaff } from "../helpers/reviewTestKit";
import { redeemMealRef, foodCheckInParticipantRef, listActiveMealPeriodsRef } from "../../src/convex/adminApi";
import { expectAdminErrorCode } from "../helpers/adminErrors";

const backfillRef = makeFunctionReference<"mutation", { mealPeriodId: GenericId<"mealPeriods"> }, {
  scanned: number; counted: number; isDone: boolean;
}>("admin/mealCountsBackfill:backfillMealServedCount");

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(Date.UTC(2026, 9, 26, 12)); });
afterEach(() => { vi.useRealTimers(); });

async function legacyMeal(historySize: number) {
  const t = createConvexTest();
  const admin = await seedStaff(t, { role: "admin" });
  const volunteer = await seedStaff(t, { role: "volunteer" });
  const applicant = await seedApplicant(t, { review: { status: "accepted" } });
  const now = Date.now();
  const { mealPeriodId } = await t.mutation(createMealPeriodRef, {
    sessionToken: admin.sessionToken, name: "Lunch", startsAt: now - 60_000, endsAt: now + 60_000, active: true,
  });
  await t.run(async (ctx) => {
    await ctx.db.patch(volunteer.adminId, { canFoodCheckIn: true });
    await ctx.db.patch(mealPeriodId, { servedCount: undefined });
    for (let index = 0; index < historySize; index++) {
      const participantId = await ctx.db.insert("participants", {
        applicationId: applicant.applicationId, authUserId: applicant.userId,
        acceptedBy: admin.adminId, acceptedAt: 1, qrCodeToken: index.toString(16).padStart(64, "0"), createdAt: 1, updatedAt: 1,
      });
      await ctx.db.insert("mealRedemptions", { mealPeriodId, participantId, scannedBy: volunteer.adminId, redeemedAt: now + index });
    }
    await ctx.db.insert("participants", {
      applicationId: applicant.applicationId, authUserId: applicant.userId, acceptedBy: admin.adminId,
      acceptedAt: 1, qrCodeToken: "ab".repeat(32), badgeQrCodeToken: "ab".repeat(32), checkedInAt: 1, createdAt: 1, updatedAt: 1,
    });
  });
  const meals = () => t.query(listMealPeriodsRef, { sessionToken: admin.sessionToken });
  const backfill = () => t.mutation(backfillRef, { mealPeriodId });
  const redeemArgs = { sessionToken: volunteer.sessionToken, mealPeriodId, qrCodeToken: "ab".repeat(32) };
  return { t, admin, volunteer, applicant, mealPeriodId, meals, backfill, redeemArgs };
}

describe("meal served counts", () => {
  it("lists exact counts within a fixed read budget regardless of redemption history", async () => {
    const t = convexTest({ schema, modules: convexTestModules, transactionLimits: { documentsRead: 32 } });
    const admin = await seedStaff(t, { role: "admin" });
    const applicant = await seedApplicant(t, { review: { status: "accepted" } });
    const mealIds = [];
    for (const name of ["Lunch", "Dinner"]) {
      const { mealPeriodId } = await t.mutation(createMealPeriodRef, {
        sessionToken: admin.sessionToken, name, startsAt: 1, endsAt: 2, active: false,
      });
      mealIds.push(mealPeriodId);
    }
    await t.run(async (ctx) => {
      const participantId = await ctx.db.insert("participants", {
        applicationId: applicant.applicationId, authUserId: applicant.userId,
        acceptedBy: admin.adminId, acceptedAt: 1, qrCodeToken: "ab".repeat(32), createdAt: 1, updatedAt: 1,
      });
      for (const mealPeriodId of mealIds) {
        for (let index = 0; index < 80; index++) {
          await ctx.db.insert("mealRedemptions", {
            mealPeriodId, participantId, scannedBy: admin.adminId, redeemedAt: index, countedInServedCount: true,
          });
        }
        await ctx.db.patch(mealPeriodId, { servedCount: 80 });
      }
    });
    expect((await t.query(listMealPeriodsRef, { sessionToken: admin.sessionToken })).map((meal) => meal.served)).toEqual([80, 80]);
  });

  it("backfills bounded pages, hides partial totals, and resumes without recounting", async () => {
    const s = await legacyMeal(205);
    const originalHistory = await s.t.run((ctx) => ctx.db.query("mealRedemptions").collect());
    expect((await s.meals())[0]!.served).toBeNull();
    expect(await s.backfill()).toEqual({ scanned: 100, counted: 100, isDone: false });
    expect((await s.meals())[0]!.served).toBeNull();
    expect(await s.backfill()).toEqual({ scanned: 100, counted: 100, isDone: false });
    expect(await s.backfill()).toEqual({ scanned: 5, counted: 5, isDone: true });
    expect((await s.meals())[0]!.served).toBe(205);
    expect(await s.backfill()).toEqual({ scanned: 0, counted: 0, isDone: true });
    expect((await s.meals())[0]!.served).toBe(205);
    const history = await s.t.run((ctx) => ctx.db.query("mealRedemptions").collect());
    expect(history.map((row) => {
      const copy = { ...row };
      delete copy.countedInServedCount;
      return copy;
    })).toEqual(originalHistory);
  });

  it.each([true, false])("counts new and duplicate collections during backfill exactly once (collect first: %s)", async (collectFirst) => {
    const s = await legacyMeal(105);
    const options = () => s.t.query(listActiveMealPeriodsRef, { sessionToken: s.volunteer.sessionToken });
    const beforeOptions = await options();
    if (!collectFirst) await s.backfill();
    expect(await s.t.mutation(redeemMealRef, s.redeemArgs)).toMatchObject({ status: "success" });
    expect(await s.t.mutation(foodCheckInParticipantRef, s.redeemArgs)).toMatchObject({ status: "already_redeemed" });
    expect((await s.meals())[0]!.served).toBeNull();
    // The new collection sorts before the cursor when collection happens after page one.
    let result = await s.backfill();
    while (!result.isDone) result = await s.backfill();
    expect((await s.meals())[0]!.served).toBe(106);
    expect(await options()).toEqual(beforeOptions);
    const rows = await s.t.run((ctx) => ctx.db.query("mealRedemptions").collect());
    expect(rows).toHaveLength(106);
    expect(rows.every((row) => row.countedInServedCount)).toBe(true);
    expect(await s.t.mutation(redeemMealRef, s.redeemArgs)).toMatchObject({ status: "already_redeemed" });
    expect((await s.meals())[0]!.served).toBe(106);
  });

  it("serializes simultaneous backfill calls and initializes an unused legacy meal to zero", async () => {
    const s = await legacyMeal(105);
    await Promise.all([s.backfill(), s.backfill()]);
    expect((await s.meals())[0]!.served).toBe(105);
    const unused = await legacyMeal(0);
    expect(await unused.backfill()).toEqual({ scanned: 0, counted: 0, isDone: true });
    expect((await unused.meals())[0]!.served).toBe(0);
    await unused.t.run((ctx) => ctx.db.delete(unused.mealPeriodId));
    await expectAdminErrorCode(unused.backfill(), "MEAL_NOT_FOUND");
  });

  it("does not lose increments when different participants redeem concurrently", async () => {
    const s = await legacyMeal(0);
    await s.backfill();
    const tokens = Array.from({ length: 8 }, (_, index) => (index + 1).toString(16).padStart(64, "0"));
    await s.t.run(async (ctx) => {
      for (const qrCodeToken of tokens) await ctx.db.insert("participants", {
        applicationId: s.applicant.applicationId, authUserId: s.applicant.userId,
        acceptedBy: s.admin.adminId, acceptedAt: 1, qrCodeToken, badgeQrCodeToken: qrCodeToken, checkedInAt: 1, createdAt: 1, updatedAt: 1,
      });
    });
    const results = await Promise.all(tokens.map((qrCodeToken) =>
      s.t.mutation(redeemMealRef, { ...s.redeemArgs, qrCodeToken })));
    expect(results.every((result) => result.status === "success")).toBe(true);
    expect((await s.meals())[0]!.served).toBe(tokens.length);
  });
});
