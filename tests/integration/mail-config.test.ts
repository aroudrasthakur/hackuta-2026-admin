import { describe, expect, it } from "vitest";
import { getMailConfigRef, setMailConfigRef } from "../../src/convex/adminApi";
import { expectAdminErrorCode } from "../helpers/adminErrors";
import { createConvexTest } from "../helpers/convexTestContext";
import { seedStaff } from "../helpers/reviewTestKit";

describe("mailConfig admin API", () => {
  it("returns both flags enabled when the table is empty", async () => {
    const t = createConvexTest();
    const { sessionToken } = await seedStaff(t, { role: "admin" });
    expect(await t.query(getMailConfigRef, { sessionToken })).toEqual({
      confirmationEmail: true,
      decisionEmail: true,
    });
    expect(await t.run((ctx) => ctx.db.query("mailConfig").collect())).toEqual([]);
  });

  it("creates one current row and patches only the provided flags", async () => {
    const t = createConvexTest();
    const { sessionToken } = await seedStaff(t, { role: "admin" });

    const pausedConfirmation = await t.mutation(setMailConfigRef, {
      sessionToken,
      confirmationEmail: false,
    });
    expect(pausedConfirmation).toEqual({ confirmationEmail: false, decisionEmail: true });

    const rowsAfterInsert = await t.run((ctx) => ctx.db.query("mailConfig").collect());
    expect(rowsAfterInsert).toHaveLength(1);
    expect(rowsAfterInsert[0]).toMatchObject({
      key: "current",
      confirmationEmail: false,
      decisionEmail: true,
    });
    const firstUpdatedAt = rowsAfterInsert[0]!.updatedAt;

    const pausedDecision = await t.mutation(setMailConfigRef, {
      sessionToken,
      decisionEmail: false,
    });
    expect(pausedDecision).toEqual({ confirmationEmail: false, decisionEmail: false });

    const rowsAfterPatch = await t.run((ctx) => ctx.db.query("mailConfig").collect());
    expect(rowsAfterPatch).toHaveLength(1);
    expect(rowsAfterPatch[0]!._id).toBe(rowsAfterInsert[0]!._id);
    expect(rowsAfterPatch[0]!.updatedAt).toBeGreaterThanOrEqual(firstUpdatedAt);
    expect(await t.query(getMailConfigRef, { sessionToken })).toEqual({
      confirmationEmail: false,
      decisionEmail: false,
    });
  });

  it("can turn a single flag back on without changing the other", async () => {
    const t = createConvexTest();
    const { sessionToken } = await seedStaff(t, { role: "admin" });
    await t.mutation(setMailConfigRef, {
      sessionToken,
      confirmationEmail: false,
      decisionEmail: false,
    });
    expect(
      await t.mutation(setMailConfigRef, { sessionToken, decisionEmail: true }),
    ).toEqual({ confirmationEmail: false, decisionEmail: true });
  });

  it("rejects missing, volunteer, and unauthenticated sessions", async () => {
    const t = createConvexTest();
    const volunteer = await seedStaff(t, { role: "volunteer" });
    await expectAdminErrorCode(
      t.query(getMailConfigRef, { sessionToken: "missing" }),
      "NOT_AUTHENTICATED",
    );
    await expectAdminErrorCode(
      t.mutation(setMailConfigRef, { sessionToken: "missing", confirmationEmail: false }),
      "NOT_AUTHENTICATED",
    );
    await expectAdminErrorCode(
      t.query(getMailConfigRef, { sessionToken: volunteer.sessionToken }),
      "NOT_AUTHORIZED",
    );
    await expectAdminErrorCode(
      t.mutation(setMailConfigRef, {
        sessionToken: volunteer.sessionToken,
        decisionEmail: false,
      }),
      "NOT_AUTHORIZED",
    );
    expect(await t.run((ctx) => ctx.db.query("mailConfig").collect())).toEqual([]);
  });
});
