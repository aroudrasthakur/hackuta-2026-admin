import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  listActiveMealPeriodsRef, resolveQrForMealRef, redeemMealRef, resolveQrForScanRef, foodCheckInParticipantRef,
} from "../../src/convex/adminApi";
import { listMealPeriodsRef, listMealRedemptionsRef, removeMealPeriodRef, updateMealPeriodRef } from "../../src/convex/mealsApi";
import { QR_SCAN_ATTEMPT_LIMIT, QR_SCAN_FAILURE_LIMIT, QR_SCAN_FAILURE_WINDOW_MS } from "../../convex/admin/volunteerScanRateLimit";
import { createConvexTest } from "../helpers/convexTestContext";
import { seedStaff, seedApplicant } from "../helpers/reviewTestKit";
import { seedMealPeriod } from "../helpers/mealTestKit";
import { expectAdminErrorCode } from "../helpers/adminErrors";

const NOW = Date.UTC(2026, 10, 14, 15);
const QR = "ab".repeat(32);
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); });

async function scene() {
  const t = createConvexTest();
  const admin = await seedStaff(t, { role: "admin" });
  const volunteer = await seedStaff(t, { role: "volunteer" });
  await t.run((ctx) => ctx.db.patch(volunteer.adminId, { canFoodCheckIn: true }));
  const applicant = await seedApplicant(t, { review: { status: "accepted" } });
  const participantId = await t.run((ctx) => ctx.db.insert("participants", {
    applicationId: applicant.applicationId, authUserId: applicant.userId, acceptedBy: admin.adminId,
    acceptedAt: 1, qrCodeToken: QR, badgeQrCodeToken: QR, checkedInAt: 7, foodRestriction: "Vegan; peanut allergy", foodCheckedInAt: 42,
    points: 30, createdAt: 1, updatedAt: 1,
  }));
  const mealPeriodId = await seedMealPeriod(t, admin.adminId);
  const args = { sessionToken: volunteer.sessionToken, qrCodeToken: QR, mealPeriodId };
  const preview = () => t.mutation(resolveQrForMealRef, args);
  const redeem = () => t.mutation(redeemMealRef, args);
  const data = () => t.run(async (ctx) => ({
    participant: await ctx.db.get(participantId), meals: await ctx.db.query("mealPeriods").collect(),
    redemptions: await ctx.db.query("mealRedemptions").collect(), logs: await ctx.db.query("volunteerActionLogs").collect(),
  }));
  const rates = () => t.run((ctx) => ctx.db.query("rateLimits").collect());
  return { t, admin, volunteer, applicant, participantId, mealPeriodId, args, preview, redeem, data, rates };
}

describe("meal redemption", () => {
  it.each([true, false])("cannot orphan a redemption when removal races collection (redeem first: %s)", async (redeemFirst) => {
    const s = await scene();
    const remove = () => s.t.mutation(removeMealPeriodRef, { sessionToken: s.admin.sessionToken, mealPeriodId: s.mealPeriodId });
    await Promise.allSettled(redeemFirst ? [s.redeem(), remove()] : [remove(), s.redeem()]);
    const state = await s.data();
    if (state.redemptions.length > 0) {
      expect(state.redemptions).toHaveLength(1); expect(state.logs).toHaveLength(1);
      expect(state.meals.some((meal) => meal._id === s.mealPeriodId)).toBe(true);
    } else {
      expect(state.logs).toEqual([]);
      expect(state.meals.some((meal) => meal._id === s.mealPeriodId)).toBe(false);
    }
  });

  it("previews only authorized display fields without recording collection", async () => {
    const s = await scene(); const before = await s.data();
    expect(await s.preview()).toEqual({
      status: "ok", purpose: "food_check_in", meal: { mealPeriodId: s.mealPeriodId, name: "Lunch" },
      participant: { name: "Taylor Student", alreadyRedeemed: false, redeemedAt: null, dietaryInfo: "Vegan; peanut allergy" },
    });
    expect(await s.data()).toEqual(before);
    expect(await s.rates()).toHaveLength(1);
  });

  it("records one collection and audit log without modifying legacy timestamps, check-in, or points", async () => {
    const s = await scene(); const original = (await s.data()).participant;
    expect(await s.redeem()).toEqual({ status: "success", redeemedAt: NOW, meal: { mealPeriodId: s.mealPeriodId, name: "Lunch" } });
    const state = await s.data();
    expect(state.participant).toEqual(original);
    expect(state.redemptions).toEqual([expect.objectContaining({ participantId: s.participantId, mealPeriodId: s.mealPeriodId, scannedBy: s.volunteer.adminId, redeemedAt: NOW })]);
    expect(state.logs).toEqual([expect.objectContaining({ action: "food_check_in", actorAdminId: s.volunteer.adminId, participantId: s.participantId, mealPeriodId: s.mealPeriodId, createdAt: NOW })]);
    expect(JSON.stringify(state.logs)).not.toMatch(/qrCodeToken|foodRestriction|dietary|sessionToken|peanut/);
    expect(JSON.stringify(state.logs)).not.toContain(QR);
    vi.setSystemTime(NOW + 1000);
    expect(await s.redeem()).toMatchObject({ status: "already_redeemed", redeemedAt: NOW });
    expect(await s.preview()).toMatchObject({ participant: { alreadyRedeemed: true, redeemedAt: NOW } });
    expect(await s.data()).toEqual(state);
    expect((await s.t.query(listMealPeriodsRef, { sessionToken: s.admin.sessionToken }))[0]!.served).toBe(1);
    expect((await s.t.query(listMealRedemptionsRef, { sessionToken: s.admin.sessionToken, mealPeriodId: s.mealPeriodId, paginationOpts: { numItems: 10, cursor: null } })).page[0]).toMatchObject({ participantName: "Taylor Student", redeemedAt: NOW });
    await expectAdminErrorCode(s.t.mutation(removeMealPeriodRef, { sessionToken: s.admin.sessionToken, mealPeriodId: s.mealPeriodId }), "MEAL_HAS_REDEMPTIONS");
  });

  it("allows breakfast, lunch, and dinner independently at their serving times", async () => {
    const s = await scene();
    await s.t.run((ctx) => ctx.db.patch(s.mealPeriodId, { name: "Breakfast", endsAt: NOW + 1000 }));
    const lunch = await seedMealPeriod(s.t, s.admin.adminId, { name: "Lunch", startsAt: NOW + 1000, endsAt: NOW + 2000 });
    const dinner = await seedMealPeriod(s.t, s.admin.adminId, { name: "Dinner", startsAt: NOW + 2000, endsAt: NOW + 3000 });
    for (const [mealPeriodId, time] of [[s.mealPeriodId, NOW], [lunch, NOW + 1000], [dinner, NOW + 2000]] as const) {
      vi.setSystemTime(time);
      expect(await s.t.mutation(redeemMealRef, { ...s.args, mealPeriodId })).toMatchObject({ status: "success", redeemedAt: time });
    }
    expect((await s.data()).redemptions).toHaveLength(3);
  });

  it("allows exactly one successful redemption across simultaneous volunteers", async () => {
    const s = await scene();
    const volunteers = await Promise.all(Array.from({ length: 5 }, () => seedStaff(s.t, { role: "volunteer" })));
    await s.t.run(async (ctx) => { for (const volunteer of volunteers) await ctx.db.patch(volunteer.adminId, { canFoodCheckIn: true }); });
    const results = await Promise.all(volunteers.map((volunteer) => s.t.mutation(redeemMealRef, { ...s.args, sessionToken: volunteer.sessionToken })));
    expect(results.filter((result) => result.status === "success")).toHaveLength(1);
    expect(results.filter((result) => result.status === "already_redeemed")).toHaveLength(4);
    const state = await s.data(); expect(state.redemptions).toHaveLength(1); expect(state.logs).toHaveLength(1);
    expect((await s.t.query(listMealPeriodsRef, { sessionToken: s.admin.sessionToken }))[0]!.served).toBe(1);
  });

  it.each([
    [{ active: false }, "meal_not_active"], [{ startsAt: NOW + 1 }, "meal_not_started"], [{ endsAt: NOW }, "meal_ended"],
  ] as const)("rechecks changed meal fields %j after a successful preview", async (fields, status) => {
    const s = await scene(); expect(await s.preview()).toMatchObject({ status: "ok" });
    await s.t.run((ctx) => ctx.db.patch(s.mealPeriodId, fields));
    const before = await s.data();
    expect(await s.redeem()).toEqual({ status }); expect(await s.preview()).toEqual({ status }); expect(await s.data()).toEqual(before);
  });

  it("uses the serving window's inclusive start and exclusive end", async () => {
    const s = await scene();
    await s.t.run((ctx) => ctx.db.patch(s.mealPeriodId, { startsAt: NOW, endsAt: NOW + 1000 }));
    expect(await s.preview()).toMatchObject({ status: "ok" });
    vi.setSystemTime(NOW + 1000);
    expect(await s.redeem()).toEqual({ status: "meal_ended" });
    expect((await s.data()).redemptions).toEqual([]);
  });

  it("applies an admin schedule edit and removal to subsequent scans", async () => {
    const s = await scene(); await s.preview();
    await s.t.mutation(updateMealPeriodRef, { sessionToken: s.admin.sessionToken, mealPeriodId: s.mealPeriodId, name: "Late lunch", active: true, startsAt: NOW + 5000, endsAt: NOW + 10_000 });
    expect(await s.redeem()).toEqual({ status: "meal_not_started" });
    vi.setSystemTime(NOW + 5000); expect(await s.preview()).toMatchObject({ meal: { name: "Late lunch" } });
    await s.t.mutation(removeMealPeriodRef, { sessionToken: s.admin.sessionToken, mealPeriodId: s.mealPeriodId });
    expect(await s.redeem()).toEqual({ status: "meal_not_active" });
  });

  it.each(["rejected", "waitlisted", "under_review", "missing"])("rejects a participant whose decision becomes %s after preview", async (status) => {
    const s = await scene(); await s.preview();
    await s.t.run((ctx) => status === "missing" ? ctx.db.delete(s.applicant.reviewId!) : ctx.db.patch(s.applicant.reviewId!, { status }));
    expect(await s.redeem()).toEqual({ status: "participant_ineligible" });
    expect(await s.preview()).toEqual({ status: "participant_ineligible" });
    expect((await s.data()).redemptions).toEqual([]);
  });

  it("rejects a deleted participant or replaced QR token after preview", async () => {
    const s = await scene(); await s.preview();
    await s.t.run((ctx) => ctx.db.patch(s.participantId, { qrCodeToken: "cd".repeat(32) }));
    expect(await s.redeem()).toEqual({ status: "qr_not_found" });
    await s.t.run((ctx) => ctx.db.delete(s.participantId));
    expect(await s.redeem()).toEqual({ status: "qr_not_found" });
  });

  it("detects another volunteer's collection between preview and confirmation", async () => {
    const s = await scene(); await s.preview(); await s.redeem(); vi.setSystemTime(NOW + 5000);
    expect(await s.redeem()).toMatchObject({ status: "already_redeemed", redeemedAt: NOW });
    expect((await s.data()).logs).toHaveLength(1);
  });

  it("revokes dietary access and redemption as soon as the food capability is removed", async () => {
    const s = await scene(); await s.preview();
    await s.t.run((ctx) => ctx.db.patch(s.volunteer.adminId, { canFoodCheckIn: false }));
    expect(await s.preview()).toEqual({ status: "not_authorized" }); expect(await s.redeem()).toEqual({ status: "not_authorized" });
    expect(await s.t.query(listActiveMealPeriodsRef, { sessionToken: s.volunteer.sessionToken })).toEqual([]);
    expect((await s.data()).redemptions).toEqual([]);
    expect((await s.rates()).filter((row) => row.bucket.includes("failure"))).toHaveLength(2);
  });

  it.each(["inactive", "expired", "deleted_session", "changed_role"])("revalidates a %s session after preview", async (change) => {
    const s = await scene(); await s.preview();
    await s.t.run(async (ctx) => {
      if (change === "inactive") await ctx.db.patch(s.volunteer.adminId, { active: false });
      else if (change === "expired") await ctx.db.patch(s.volunteer.sessionId, { expiresAt: NOW });
      else if (change === "deleted_session") await ctx.db.delete(s.volunteer.sessionId);
      else await ctx.db.patch(s.volunteer.adminId, { role: "reviewer" });
    });
    const before = await s.rates();
    const code = change === "changed_role" ? "VOLUNTEER_ONLY" : "NOT_AUTHENTICATED";
    await expectAdminErrorCode(s.redeem(), code); await expectAdminErrorCode(s.preview(), code);
    await expectAdminErrorCode(s.t.query(listActiveMealPeriodsRef, { sessionToken: s.volunteer.sessionToken }), code);
    expect(await s.rates()).toEqual(before); expect((await s.data()).redemptions).toEqual([]);
  });

  it("denies a reviewer account on every meal scan entry point and allows an admin without canFoodCheckIn", async () => {
    const s = await scene();
    const reviewer = await seedStaff(s.t, { role: "reviewer" });
    const reviewerArgs = { ...s.args, sessionToken: reviewer.sessionToken };
    await expectAdminErrorCode(s.t.query(listActiveMealPeriodsRef, { sessionToken: reviewer.sessionToken }), "VOLUNTEER_ONLY");
    await expectAdminErrorCode(s.t.mutation(resolveQrForMealRef, reviewerArgs), "VOLUNTEER_ONLY");
    await expectAdminErrorCode(s.t.mutation(redeemMealRef, reviewerArgs), "VOLUNTEER_ONLY");
    expect(await s.rates()).toEqual([]);

    const adminArgs = { ...s.args, sessionToken: s.admin.sessionToken };
    expect((await s.t.query(listActiveMealPeriodsRef, { sessionToken: s.admin.sessionToken })).map((m) => m.mealPeriodId)).toEqual([s.mealPeriodId]);
    expect(await s.t.mutation(resolveQrForMealRef, adminArgs)).toMatchObject({ status: "ok", meal: { mealPeriodId: s.mealPeriodId } });
    expect(await s.t.mutation(redeemMealRef, adminArgs)).toEqual({ status: "success", redeemedAt: NOW, meal: { mealPeriodId: s.mealPeriodId, name: "Lunch" } });
    expect((await s.data()).logs).toEqual([expect.objectContaining({
      action: "food_check_in", actorAdminId: s.admin.adminId, participantId: s.participantId, mealPeriodId: s.mealPeriodId,
    })]);
  });

  it("provides only enabled schedule metadata, including upcoming windows for automatic clock updates", async () => {
    const s = await scene();
    const upcoming = await seedMealPeriod(s.t, s.admin.adminId, { name: "Dinner", startsAt: NOW + 100_000, endsAt: NOW + 200_000 });
    await seedMealPeriod(s.t, s.admin.adminId, { name: "Disabled", active: false });
    const meals = await s.t.query(listActiveMealPeriodsRef, { sessionToken: s.volunteer.sessionToken });
    expect(meals.map((meal) => meal.mealPeriodId)).toEqual([s.mealPeriodId, upcoming]);
    expect(Object.keys(meals[0]!).sort()).toEqual(["endsAt", "mealPeriodId", "name", "startsAt", "updatedAt"]);
  });

  it("preserves failure counters for bad QR codes across preview and redemption", async () => {
    const s = await scene();
    for (let i = 0; i < QR_SCAN_FAILURE_LIMIT; i++) {
      const ref = i % 2 ? resolveQrForMealRef : redeemMealRef;
      expect(await s.t.mutation(ref, { ...s.args, qrCodeToken: i % 2 ? "malformed" : "cd".repeat(32) })).toEqual({ status: "qr_not_found" });
    }
    const before = await s.rates();
    expect(before.filter((row) => row.bucket.includes("failure"))).toHaveLength(QR_SCAN_FAILURE_LIMIT);
    expect(JSON.stringify(before)).not.toMatch(/malformed|cdcd/);
    expect(await s.preview()).toEqual({ status: "rate_limited" }); expect(await s.redeem()).toEqual({ status: "rate_limited" });
    expect(await s.rates()).toEqual(before);
    vi.setSystemTime(NOW + QR_SCAN_FAILURE_WINDOW_MS + 1);
    await s.t.run((ctx) => ctx.db.patch(s.mealPeriodId, { endsAt: NOW + QR_SCAN_FAILURE_WINDOW_MS + 10_000 }));
    expect(await s.redeem()).toMatchObject({ status: "success" });
  });

  it("shares the attempt limit across previews, redemptions, and legacy food calls", async () => {
    const s = await scene();
    for (let i = 0; i < QR_SCAN_ATTEMPT_LIMIT; i++) expect(await s.preview()).toMatchObject({ status: "ok" });
    const before = await s.rates();
    expect(await s.redeem()).toEqual({ status: "rate_limited" });
    expect(await s.t.mutation(foodCheckInParticipantRef, s.args)).toEqual({ status: "rate_limited" });
    expect(await s.rates()).toEqual(before);
  });

  it("requires a selected meal on legacy endpoints and shares the per-meal duplicate guard", async () => {
    const s = await scene(); const legacyArgs = { sessionToken: s.args.sessionToken, qrCodeToken: QR };
    expect(await s.t.mutation(resolveQrForScanRef, { ...legacyArgs, purpose: "food_check_in" })).toEqual({ status: "meal_not_active" });
    expect(await s.t.mutation(foodCheckInParticipantRef, legacyArgs)).toEqual({ status: "meal_not_active" });
    expect(await s.t.mutation(resolveQrForScanRef, { ...s.args, purpose: "food_check_in" })).toMatchObject({ status: "ok", meal: { mealPeriodId: s.mealPeriodId } });
    expect(await s.t.mutation(foodCheckInParticipantRef, s.args)).toMatchObject({ status: "success" });
    expect(await s.redeem()).toMatchObject({ status: "already_redeemed" });
    expect((await s.data()).participant!.foodCheckedInAt).toBe(42);
  });
});
