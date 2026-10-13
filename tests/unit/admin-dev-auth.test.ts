import { describe, expect, it } from "vitest";
import { routeAdminAuthRequest } from "../../server/adminAuthHandlers";

describe("local development auth bypass", () => {
  it("does not expose the dev sign-in endpoint when disabled", async () => {
    const response = await routeAdminAuthRequest(
      new Request("http://localhost/api/admin/dev-sign-in", {
        method: "POST",
      }),
      { devAuth: { enabled: false } },
    );

    expect(response.status).toBe(404);
  });

  it("reports missing local credentials without trying to sign in", async () => {
    const response = await routeAdminAuthRequest(
      new Request("http://localhost/api/admin/dev-sign-in", {
        method: "POST",
      }),
      { devAuth: { enabled: true } },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Set ADMIN_DEV_AUTH_EMAIL and ADMIN_DEV_AUTH_PASSWORD in .env.local.",
    });
  });
});
