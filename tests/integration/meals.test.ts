import { describe, expect, it } from "vitest";
import {
  createMealPeriodRef, listMealPeriodsRef, listMealRedemptionsRef,
  removeMealPeriodRef, setMealPeriodActiveRef, updateMealPeriodRef,
} from "../../src/convex/mealsApi";
import { createConvexTest, type ConvexTestInstance } from "../helpers/convexTestContext";
import { seedApplicant, seedStaff } from "../helpers/reviewTestKit";
import { expectAdminErrorCode } from "../helpers/adminErrors";
import type { GenericId } from "convex/values";

const window = { name: "Lunch", startsAt: 1_800_000_000_000, endsAt: 1_800_003_600_000, active: true };
const paginationOpts = { numItems: 2, cursor: null };

async function setup(fields = {}) {
  const t = createConvexTest();
  const actor = await seedStaff(t, { role: "admin" });
  const { mealPeriodId } = await t.mutation(createMealPeriodRef, { sessionToken: actor.sessionToken, ...window, ...fields });
  return { t, ...actor, mealPeriodId };
}

async function serve(t: ConvexTestInstance, mealPeriodId: GenericId<"mealPeriods">, adminId: GenericId<"admins">, times: number[]) {
  const applicant = await seedApplicant(t, { review: { status: "accepted" } });
  return t.run(async (ctx) => {
    const participantId = await ctx.db.insert("participants", {
      applicationId: applicant.applicationId, authUserId: applicant.userId, acceptedAt: 1, acceptedBy: adminId,
      qrCodeToken: "ab".repeat(32), foodRestriction: "Private dietary information", foodCheckedInAt: 42, createdAt: 1, updatedAt: 1,
    });
    for (const redeemedAt of times) await ctx.db.insert("mealRedemptions", { mealPeriodId, participantId, scannedBy: adminId, redeemedAt });
    return participantId;
  });
}

describe("admin meal management", () => {
  it.each(["reviewer", "volunteer", "inactive", "expired", "missing"])("denies %s access to every endpoint", async (kind) => {
    const { t, mealPeriodId } = await setup();
    const staff = await seedStaff(t, {
      role: kind === "reviewer" || kind === "volunteer" ? kind : "admin",
      active: kind !== "inactive", expiresAt: kind === "expired" ? 1 : Date.now() + 60_000,
    });
    const sessionToken = kind === "missing" ? "" : staff.sessionToken;
    const code = kind === "reviewer" ? "ADMIN_ONLY" : kind === "volunteer" ? "NOT_AUTHORIZED" : "NOT_AUTHENTICATED";
    for (const operation of [
      () => t.query(listMealPeriodsRef, { sessionToken }),
      () => t.query(listMealRedemptionsRef, { sessionToken, mealPeriodId, paginationOpts }),
      () => t.mutation(createMealPeriodRef, { sessionToken, ...window }),
      () => t.mutation(updateMealPeriodRef, { sessionToken, mealPeriodId, ...window }),
      () => t.mutation(setMealPeriodActiveRef, { sessionToken, mealPeriodId, active: false }),
      () => t.mutation(removeMealPeriodRef, { sessionToken, mealPeriodId }),
    ]) await expectAdminErrorCode(operation(), code);
    expect(await t.run((ctx) => ctx.db.query("staffConfigLogs").collect())).toHaveLength(1);
  });

  it("trims custom names and descriptions, records the creator, and lists real served counts in schedule order", async () => {
    const { t, mealPeriodId, adminId, sessionToken } = await setup({ name: "  Midnight snacks  ", description: "  Fruit  " });
    await serve(t, mealPeriodId, adminId, [100]);
    await t.mutation(createMealPeriodRef, { sessionToken, ...window, name: "Breakfast", startsAt: window.startsAt - 2000, endsAt: window.startsAt });
    const meals = await t.query(listMealPeriodsRef, { sessionToken });
    expect(meals.map((meal) => [meal.name, meal.served])).toEqual([["Breakfast", 0], ["Midnight snacks", 1]]);
    expect(meals[1]).toMatchObject({ description: "Fruit", createdBy: adminId, active: true });
    expect(await t.run((ctx) => ctx.db.query("participants").first())).toMatchObject({ foodCheckedInAt: 42 });
  });

  it.each([
    { name: "   " }, { name: "x".repeat(101) }, { description: "x".repeat(1001) },
    { startsAt: -1 }, { startsAt: NaN }, { endsAt: Infinity }, { startsAt: 1.5 },
    { endsAt: window.startsAt }, { endsAt: window.startsAt - 1 }, { endsAt: Number.MAX_SAFE_INTEGER },
  ])("rejects invalid fields %j without writing", async (fields) => {
    const { t, sessionToken, mealPeriodId } = await setup();
    await expectAdminErrorCode(t.mutation(createMealPeriodRef, { sessionToken, ...window, ...fields }), "INVALID_MEAL");
    await expectAdminErrorCode(t.mutation(updateMealPeriodRef, { sessionToken, mealPeriodId, ...window, ...fields }), "INVALID_MEAL");
    expect(await t.query(listMealPeriodsRef, { sessionToken })).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.query("staffConfigLogs").collect())).toHaveLength(1);
  });

  it("allows disabled overlaps and adjacent active windows, but blocks partial and enclosing overlaps", async () => {
    const { t, sessionToken } = await setup();
    await t.mutation(createMealPeriodRef, { sessionToken, ...window, active: false });
    await t.mutation(createMealPeriodRef, { sessionToken, ...window, startsAt: window.endsAt, endsAt: window.endsAt + 1000 });
    for (const fields of [window, { ...window, startsAt: window.startsAt - 1000 }, { ...window, startsAt: window.startsAt + 1, endsAt: window.endsAt - 1 }]) {
      await expectAdminErrorCode(t.mutation(createMealPeriodRef, { sessionToken, ...fields }), "MEAL_OVERLAP");
    }
  });

  it("prevents two simultaneous active creations for the same serving window", async () => {
    const t = createConvexTest();
    const { sessionToken } = await seedStaff(t, { role: "admin" });
    const results = await Promise.allSettled([1, 2].map(() => t.mutation(createMealPeriodRef, { sessionToken, ...window })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await t.query(listMealPeriodsRef, { sessionToken })).toHaveLength(1);
  });

  it("edits its own window, clears descriptions, and preserves creator and collection history", async () => {
    const { t, sessionToken, mealPeriodId, adminId } = await setup({ description: "Old" });
    await serve(t, mealPeriodId, adminId, [100]);
    const before = await t.run((ctx) => ctx.db.get(mealPeriodId));
    await t.mutation(updateMealPeriodRef, { sessionToken, mealPeriodId, ...window, name: "Brunch", description: " " });
    const after = await t.run((ctx) => ctx.db.get(mealPeriodId));
    expect(after).toMatchObject({ name: "Brunch", createdBy: adminId, createdAt: before!.createdAt });
    expect(after!.description).toBeUndefined();
    expect((await t.query(listMealPeriodsRef, { sessionToken }))[0]!.served).toBe(1);
    expect(await t.run((ctx) => ctx.db.query("staffConfigLogs").collect())).toHaveLength(2);
  });

  it("rechecks overlaps on activation and edits, and allows deactivation with history", async () => {
    const { t, sessionToken, mealPeriodId, adminId } = await setup();
    const { mealPeriodId: other } = await t.mutation(createMealPeriodRef, { sessionToken, ...window, active: false });
    await expectAdminErrorCode(t.mutation(setMealPeriodActiveRef, { sessionToken, mealPeriodId: other, active: true }), "MEAL_OVERLAP");
    await expectAdminErrorCode(t.mutation(updateMealPeriodRef, { sessionToken, mealPeriodId: other, ...window }), "MEAL_OVERLAP");
    await serve(t, mealPeriodId, adminId, [100]);
    await t.mutation(setMealPeriodActiveRef, { sessionToken, mealPeriodId, active: false });
    await t.mutation(setMealPeriodActiveRef, { sessionToken, mealPeriodId: other, active: true });
    await t.mutation(setMealPeriodActiveRef, { sessionToken, mealPeriodId: other, active: true });
    expect((await t.query(listMealPeriodsRef, { sessionToken })).find((meal) => meal._id === mealPeriodId)).toMatchObject({ active: false, served: 1 });
    const logs = await t.run((ctx) => ctx.db.query("staffConfigLogs").collect());
    expect(logs.filter((log) => log.action === "meal_active_changed")).toHaveLength(2);
  });

  it("removes unused meals but rejects removal after a collection, preserving audit history", async () => {
    const { t, sessionToken, mealPeriodId, adminId } = await setup();
    await t.mutation(removeMealPeriodRef, { sessionToken, mealPeriodId });
    expect(await t.query(listMealPeriodsRef, { sessionToken })).toEqual([]);
    const audit = await t.run((ctx) => ctx.db.query("staffConfigLogs").collect());
    expect(audit.at(-1)).toMatchObject({ action: "meal_removed", targetMealPeriodId: mealPeriodId });
    expect(JSON.parse(audit.at(-1)!.details!)).toMatchObject({ name: "Lunch" });
    const { mealPeriodId: served } = await t.mutation(createMealPeriodRef, { sessionToken, ...window });
    await serve(t, served, adminId, [100]);
    await expectAdminErrorCode(t.mutation(removeMealPeriodRef, { sessionToken, mealPeriodId: served }), "MEAL_HAS_REDEMPTIONS");
    expect(await t.run((ctx) => ctx.db.get(served))).not.toBeNull();
  });

  it("returns a clear missing-meal error for reads and writes", async () => {
    const { t, sessionToken, mealPeriodId } = await setup();
    await t.mutation(removeMealPeriodRef, { sessionToken, mealPeriodId });
    await expectAdminErrorCode(t.mutation(updateMealPeriodRef, { sessionToken, mealPeriodId, ...window }), "MEAL_NOT_FOUND");
    await expectAdminErrorCode(t.mutation(setMealPeriodActiveRef, { sessionToken, mealPeriodId, active: false }), "MEAL_NOT_FOUND");
    await expectAdminErrorCode(t.mutation(removeMealPeriodRef, { sessionToken, mealPeriodId }), "MEAL_NOT_FOUND");
    await expectAdminErrorCode(t.query(listMealRedemptionsRef, { sessionToken, mealPeriodId, paginationOpts }), "MEAL_NOT_FOUND");
  });

  it("paginates newest-first history with inclusive time filters and restricted display fields", async () => {
    const { t, sessionToken, mealPeriodId, adminId } = await setup();
    await serve(t, mealPeriodId, adminId, [100, 200, 300]);
    const other = await t.mutation(createMealPeriodRef, { sessionToken, ...window, active: false });
    await serve(t, other.mealPeriodId, adminId, [400]);
    const first = await t.query(listMealRedemptionsRef, { sessionToken, mealPeriodId, paginationOpts });
    expect(first.page.map((row) => row.redeemedAt)).toEqual([300, 200]);
    expect(first.isDone).toBe(false);
    expect(Object.keys(first.page[0]!).sort()).toEqual(["participantName", "redeemedAt", "redemptionId", "scannedByName"]);
    expect(first.page[0]!.participantName).toBe("Taylor Student");
    const second = await t.query(listMealRedemptionsRef, { sessionToken, mealPeriodId, paginationOpts: { ...paginationOpts, cursor: first.continueCursor } });
    expect(second.page.map((row) => row.redeemedAt)).toEqual([100]);
    expect(second.isDone).toBe(true);
    const filtered = await t.query(listMealRedemptionsRef, { sessionToken, mealPeriodId, from: 100, to: 200, paginationOpts });
    expect(filtered.page.map((row) => row.redeemedAt)).toEqual([200, 100]);
    await expectAdminErrorCode(t.query(listMealRedemptionsRef, { sessionToken, mealPeriodId, from: 300, to: 100, paginationOpts }), "INVALID_LOG_FILTER");
  });
});
