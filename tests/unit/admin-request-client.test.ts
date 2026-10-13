import { describe, expect, it } from "vitest";
import { getAdminSignInClientIp, isLoopbackAdminRequest } from "../../server/adminRequestClient";

describe("adminRequestClient", () => {
  it("treats localhost hosts as loopback", () => {
    expect(
      isLoopbackAdminRequest(new Request("http://127.0.0.1:5373/api/admin/sign-in")),
    ).toBe(true);
    expect(
      isLoopbackAdminRequest(new Request("http://localhost/api/admin/dev-sign-in")),
    ).toBe(true);
  });

  it("rejects remote hosts and remote forwarded clients", () => {
    expect(
      isLoopbackAdminRequest(new Request("http://203.0.113.1/api/admin/dev-sign-in")),
    ).toBe(false);
    expect(
      isLoopbackAdminRequest(
        new Request("http://127.0.0.1/api/admin/dev-sign-in", {
          headers: { "x-forwarded-for": "203.0.113.9" },
        }),
      ),
    ).toBe(false);
  });

  it("uses the first X-Forwarded-For hop as the sign-in client IP", () => {
    const ip = getAdminSignInClientIp(
      new Request("http://127.0.0.1/api/admin/sign-in", {
        headers: { "x-forwarded-for": "203.0.113.4, 10.0.0.1" },
      }),
    );
    expect(ip).toBe("203.0.113.4");
  });
});
