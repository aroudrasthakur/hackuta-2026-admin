import { describe, expect, it } from "vitest";
import { isAdminDevAuthBypassEnabled } from "../../server/devAuthConfig";
import { routeAdminAuthRequest } from "../../server/adminAuthHandlers";

describe("local development auth bypass", () => {
  it("treats production mode as disabled even when VITE_DEV_AUTH_BYPASS would be set", () => {
    expect(
      isAdminDevAuthBypassEnabled({ mode: "production", viteDevAuthBypass: "true" }),
    ).toBe(false);
  });

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

  it("rejects dev sign-in from a non-loopback host even when enabled", async () => {
    const response = await routeAdminAuthRequest(
      new Request("http://192.168.1.50/api/admin/dev-sign-in", {
        method: "POST",
      }),
      {
        devAuth: {
          enabled: true,
          email: "admin@hackuta.org",
          password: "SecurePass1",
        },
      },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Dev sign-in is only available from localhost.",
    });
  });

  it("rejects dev sign-in when forwarded from a remote client", async () => {
    const response = await routeAdminAuthRequest(
      new Request("http://127.0.0.1/api/admin/dev-sign-in", {
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.9" },
      }),
      {
        devAuth: {
          enabled: true,
          email: "admin@hackuta.org",
          password: "SecurePass1",
        },
      },
    );

    expect(response.status).toBe(403);
  });
});
