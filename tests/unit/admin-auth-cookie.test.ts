import { describe, expect, it } from "vitest";
import {
  ADMIN_SESSION_COOKIE,
  clearAdminSessionCookie,
  readAdminSessionCookie,
  serializeAdminSessionCookie,
} from "../../server/adminAuthCookie";

describe("organizer session cookie helpers", () => {
  it("serializes an HttpOnly SameSite=Strict cookie", () => {
    const cookie = serializeAdminSessionCookie("abc123", true);
    expect(cookie).toContain(`${ADMIN_SESSION_COOKIE}=abc123`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=strict");
    expect(cookie).toContain("Secure");
  });

  it("reads the organizer cookie from a Cookie header", () => {
    const token = "fedcba".repeat(10).slice(0, 64);
    const cookie = readAdminSessionCookie(
      `other=value; ${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; path=/`,
    );
    expect(cookie).toBe(token);
  });

  it("clears the organizer cookie", () => {
    const cookie = clearAdminSessionCookie(true);
    expect(cookie).toContain(`${ADMIN_SESSION_COOKIE}=`);
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("HttpOnly");
  });
});
