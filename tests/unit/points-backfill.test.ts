import { makeFunctionReference } from "convex/server";
import type { GenericId } from "convex/values";
import { describe, expect, it } from "vitest";
import { expectAdminErrorCode } from "../helpers/adminErrors";
import { createConvexTest, type ConvexTestInstance } from "../helpers/convexTestContext";

const backfillRef = makeFunctionReference<
  "mutation",
  { cursor?: string | null; batchSize?: number },
  { patched: number; isDone: boolean; continueCursor: string }
>("admin/pointsBackfill:backfillParticipantPoints");

async function insertBareParticipant(t: ConvexTestInstance, points?: number) {
  const adminId = await t.run((ctx) =>
    ctx.db.insert("admins", {
      email: `admin-${Math.random()}@hackuta.org`,
      name: "Admin",
      role: "admin",
      active: true,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { email: `person-${Math.random()}@example.com`, name: "Person" }),
  );
  const applicationId = await t.run((ctx) =>
    ctx.db.insert("applications", {
      authUserId: userId,
      email: "person@example.com",
      createdAt: 1,
      formSubmitted: true,
      submittedAt: 2,
    }),
  );
  return t.run((ctx) =>
    ctx.db.insert("participants", {
      applicationId,
      authUserId: userId,
      acceptedAt: 3,
      acceptedBy: adminId,
      qrCodeToken: `qr-${Math.random()}`,
      ...(points !== undefined ? { points } : {}),
      createdAt: 3,
      updatedAt: 3,
    }),
  );
}

async function pointsOf(t: ConvexTestInstance, participantId: GenericId<"participants">) {
  return t.run(async (ctx) => (await ctx.db.get(participantId))?.points);
}

describe("participant points backfill", () => {
  it("fills only missing balances and does nothing on a second pass", async () => {
    const t = createConvexTest();
    const existingId = await insertBareParticipant(t, 5);
    const missingId = await insertBareParticipant(t);
    const adminId = await t.run(async (ctx) => (await ctx.db.get(missingId))!.acceptedBy);
    const eventId = await t.run((ctx) =>
      ctx.db.insert("events", {
        name: "Workshop",
        pointsAwarded: 8,
        startsAt: 1,
        endsAt: 2,
        active: true,
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    const awardedId = await insertBareParticipant(t);
    await t.run((ctx) =>
      ctx.db.insert("participantEventAwards", {
        participantId: awardedId,
        eventId,
        pointsAwarded: 8,
        awardedBy: adminId,
        awardedAt: 1,
      }),
    );

    const first = await t.mutation(backfillRef, { batchSize: 10 });
    expect(first.patched).toBe(2);
    expect(first.isDone).toBe(true);
    expect(await pointsOf(t, existingId)).toBe(5);
    expect(await pointsOf(t, missingId)).toBe(0);
    expect(await pointsOf(t, awardedId)).toBe(8);

    const second = await t.mutation(backfillRef, { cursor: null, batchSize: 10 });
    expect(second.patched).toBe(0);
    expect(second.isDone).toBe(true);
    expect(await pointsOf(t, existingId)).toBe(5);
    expect(await pointsOf(t, awardedId)).toBe(8);
  });

  it("pages through participants and skips a balance that is already set", async () => {
    const t = createConvexTest();
    const firstId = await insertBareParticipant(t, 5);
    const secondId = await insertBareParticipant(t);
    const thirdId = await insertBareParticipant(t);

    const firstPage = await t.mutation(backfillRef, { batchSize: 1 });
    expect(firstPage.patched).toBe(0);
    expect(firstPage.isDone).toBe(false);

    const secondPage = await t.mutation(backfillRef, {
      cursor: firstPage.continueCursor,
      batchSize: 1,
    });
    expect(secondPage.patched).toBe(1);
    expect(secondPage.isDone).toBe(false);

    const thirdPage = await t.mutation(backfillRef, {
      cursor: secondPage.continueCursor,
      batchSize: 1,
    });
    expect(thirdPage.patched).toBe(1);
    expect(thirdPage.isDone).toBe(true);

    expect(await pointsOf(t, firstId)).toBe(5);
    expect(await pointsOf(t, secondId)).toBe(0);
    expect(await pointsOf(t, thirdId)).toBe(0);

    const again = await t.mutation(backfillRef, { cursor: thirdPage.continueCursor, batchSize: 1 });
    expect(again.patched).toBe(0);
    expect(again.isDone).toBe(true);
  });

  it("uses a default page size and rejects an invalid batch", async () => {
    const t = createConvexTest();
    await insertBareParticipant(t);
    await insertBareParticipant(t);

    const page = await t.mutation(backfillRef, {});
    expect(page.patched).toBe(2);
    expect(page.isDone).toBe(true);

    const before = await t.run((ctx) => ctx.db.query("participants").collect());
    await expectAdminErrorCode(t.mutation(backfillRef, { batchSize: 0 }), "INVALID_POINTS");
    await expectAdminErrorCode(t.mutation(backfillRef, { batchSize: 101 }), "INVALID_POINTS");
    await expectAdminErrorCode(t.mutation(backfillRef, { batchSize: 1.5 }), "INVALID_POINTS");
    const after = await t.run((ctx) => ctx.db.query("participants").collect());
    expect(after.map((row) => row.points)).toEqual(before.map((row) => row.points));
  });
});
