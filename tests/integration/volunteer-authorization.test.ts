import { makeFunctionReference } from "convex/server";
import { ConvexHttpClient } from "convex/browser";
import { describe, expect, it, vi } from "vitest";
import {
  listDecisionEmailQueueRef, releaseDecisionEmailsRef, retryFailedDecisionEmailsRef,
  setApplicationDecisionRef, setDecisionEmailHoldRef,
} from "../../src/convex/adminApi";
import { expectAdminErrorCode } from "../helpers/adminErrors";
import { createConvexTest } from "../helpers/convexTestContext";
import { seedApplicant, seedStaff } from "../helpers/reviewTestKit";
import { mutateOrganizerSignIn, ORGANIZER_TEST_PASSWORD, seedAdminAccount } from "../helpers/staffTestFixtures";
import { hashSessionToken } from "../../convex/admin/staffAuth";
import { getCurrentStaffRef } from "../../src/convex/adminApi";
import { ADMIN_SESSION_COOKIE } from "../../server/adminAuthCookie";
import { handleAdminSignIn, handleAdminSessionToken } from "../../server/adminAuthHandlers";

describe("volunteer API boundaries", () => {
  it("rejects all decision email APIs before reading or changing the queue", async () => {
    const t = createConvexTest();
    const admin = await seedStaff(t, { role: "admin" });
    const volunteer = await seedStaff(t, { role: "volunteer" });
    const { applicationId } = await seedApplicant(t);
    await t.mutation(setApplicationDecisionRef, { sessionToken: admin.sessionToken, applicationId, decision: "accepted" });
    const before = await t.run((ctx) => ctx.db.query("decisionEmailQueue").collect());
    const sessionToken = volunteer.sessionToken;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const calls = [
        () => t.query(listDecisionEmailQueueRef, { sessionToken }),
        () => t.mutation(setDecisionEmailHoldRef, { sessionToken, itemId: before[0]._id, held: true }),
        () => t.mutation(retryFailedDecisionEmailsRef, { sessionToken }),
        () => t.action(releaseDecisionEmailsRef, { sessionToken }),
      ];
      for (const call of calls) await expectAdminErrorCode(call(), "NOT_AUTHORIZED");
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(await t.run((ctx) => ctx.db.query("decisionEmailQueue").collect())).toEqual(before);
      expect(await t.run((ctx) => ctx.db.query("participants").collect())).toEqual([]);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("rejects sample application creation and administrator account provisioning", async () => {
    const t = createConvexTest();
    const { sessionToken } = await seedStaff(t, { role: "volunteer" });
    const sample = makeFunctionReference<"mutation">("admin/applications:createSampleApplication");
    const provision = makeFunctionReference<"mutation">("admin/auth:createAndProvisionAdmin");
    await expectAdminErrorCode(t.mutation(sample, {
      sessionToken, email: "sample@example.com", firstName: "Sample", lastName: "Person", school: "UTA",
    }), "NOT_AUTHORIZED");
    await expectAdminErrorCode(t.mutation(provision, {
      sessionToken, email: "elevated@example.com", name: "Elevated", password: ORGANIZER_TEST_PASSWORD,
    }), "NOT_AUTHORIZED");
    expect(await t.run((ctx) => ctx.db.query("applications").collect())).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("admins").collect())).toHaveLength(1);
  });

  it("uses the same secure cookie transport for a real volunteer staff login", async () => {
    const t = createConvexTest();
    const adminId = await seedAdminAccount(t, { email: "volunteer@hackuta.org", role: "volunteer", active: true });
    // Run the real route handler with only its Convex transport replaced by convex-test.
    const transport = vi.spyOn(ConvexHttpClient.prototype, "mutation").mockImplementation(
      (_ref, args) => mutateOrganizerSignIn(t, args as { email: string; password: string; clientIp?: string }),
    );
    try {
      const response = await handleAdminSignIn(new Request("https://admin.hackuta.test/api/admin/sign-in", {
        method: "POST", headers: { "content-type": "application/json", origin: "https://admin.hackuta.test" },
        body: JSON.stringify({ email: " VOLUNTEER@hackuta.org ", password: ORGANIZER_TEST_PASSWORD }),
      }), "https://test.convex.cloud");
      expect(response.status).toBe(200);
      const cookie = response.headers.get("set-cookie")!;
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("SameSite=strict");
      expect(JSON.stringify(await response.json())).not.toMatch(/sessionToken|password/);
      const tokenResponse = await handleAdminSessionToken(new Request("https://admin.hackuta.test/api/admin/session-token", { headers: { cookie } }));
      const token = await tokenResponse.text();
      expect(cookie).toContain(`${ADMIN_SESSION_COOKIE}=${token}`);
      expect(await t.query(getCurrentStaffRef, { sessionToken: token })).toMatchObject({ adminId, role: "volunteer", canCheckIn: false, canFoodCheckIn: false });
      const sessions = await t.run((ctx) => ctx.db.query("adminSessions").collect());
      expect(sessions).toMatchObject([{ sessionTokenHash: await hashSessionToken(token) }]);
      expect(JSON.stringify(sessions)).not.toContain(token);
    } finally {
      transport.mockRestore();
    }
  });
});
