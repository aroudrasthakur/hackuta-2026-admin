import { describe, expect, it, vi } from "vitest";
import { convexRequestIdFromError, logAdminError } from "../../shared/admin/logAdminError";

describe("logAdminError", () => {
  it("extracts Convex request IDs from error messages", () => {
    expect(
      convexRequestIdFromError(new Error("[CONVEX M(x)] [Request ID: abc-123] Server Error")),
    ).toBe("abc-123");
    expect(convexRequestIdFromError(new Error("no id here"))).toBeNull();
    expect(convexRequestIdFromError("boom")).toBeNull();
  });

  it("never logs the raw caught value as a separate argument", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    logAdminError("Organizer sign-in failed", new Error("secret details"), {
      route: "/api/admin/sign-in",
      convexFunction: "admin/auth:signIn",
    });
    expect(consoleError).toHaveBeenCalledOnce();
    expect(consoleError.mock.calls[0]).toHaveLength(2);
    expect(consoleError.mock.calls[0]?.[1]).toMatchObject({
      route: "/api/admin/sign-in",
      convexFunction: "admin/auth:signIn",
      convexRequestId: null,
      errorMessage: "secret details",
    });
  });
});
