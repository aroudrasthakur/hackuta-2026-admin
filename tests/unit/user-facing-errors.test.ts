import { ConvexError } from "convex/values";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_ERROR_MESSAGES,
  adminError,
  adminErrorCode,
  GENERIC_ERROR_MESSAGE,
  isAdminErrorCode,
  type AdminErrorCode,
} from "../../shared/admin/errors";
import {
  reportUserFacingError,
  UserFacingError,
  userFacingErrorMessage,
} from "../../src/lib/userFacingError";
import { expectAdminErrorCode } from "../helpers/adminErrors";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("admin error catalog", () => {
  it.each(Object.keys(ADMIN_ERROR_MESSAGES) as AdminErrorCode[])(
    "round-trips %s through a ConvexError",
    (code) => {
      const error = adminError(code);
      expect(error).toBeInstanceOf(ConvexError);
      expect(error.data).toEqual({ code, message: ADMIN_ERROR_MESSAGES[code] });
      expect(adminErrorCode(error)).toBe(code);
      expect(userFacingErrorMessage(error)).toBe(ADMIN_ERROR_MESSAGES[code]);
    },
  );

  it.each([
    ["null", null],
    ["a string", "Not authorized"],
    ["a plain Error", new Error("Not authorized")],
    ["a ConvexError with string data", new ConvexError("Passwords do not match.")],
    ["an unknown code", new ConvexError({ code: "DROP_TABLES", message: "x" })],
    ["a prototype key", { data: { code: "toString" } }],
  ])("has no code for %s", (_label, value) => {
    expect(adminErrorCode(value)).toBeNull();
  });

  it("only accepts catalog codes", () => {
    expect(isAdminErrorCode("REVIEW_CLAIMED")).toBe(true);
    expect(isAdminErrorCode("hasOwnProperty")).toBe(false);
    expect(isAdminErrorCode(42)).toBe(false);
  });
});

describe("userFacingErrorMessage", () => {
  it("shows a UserFacingError message as written", () => {
    expect(userFacingErrorMessage(new UserFacingError("Check your cookies."))).toBe("Check your cookies.");
  });

  it.each([
    ["a redacted production error", new Error("[CONVEX M(admin/x)] [Request ID: 1a2b] Server Error")],
    ["a dev error with a stack", new Error("Uncaught Error: boom\n    at handler (convex/admin/x.ts:1:1)")],
    ["a non-Error throw", { reason: "?" }],
  ])("hides %s behind the fallback", (_label, error) => {
    expect(userFacingErrorMessage(error)).toBe(GENERIC_ERROR_MESSAGE);
    expect(userFacingErrorMessage(error, "Try again.")).toBe("Try again.");
  });

  it("logs the original error before returning the message", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const original = new Error("db exploded");
    expect(reportUserFacingError("Saving failed", original, "Try again.")).toBe("Try again.");
    expect(consoleError).toHaveBeenCalledWith("Saving failed", original);
  });
});

describe("expectAdminErrorCode", () => {
  it("passes on the matching code", async () => {
    await expectAdminErrorCode(Promise.reject(adminError("REVIEW_CLAIMED")), "REVIEW_CLAIMED");
  });

  it.each([
    ["no error", () => Promise.resolve("ok")],
    ["a different code", () => Promise.reject(adminError("ADMIN_ONLY"))],
    ["a plain Error that only mentions the code", () => Promise.reject(new Error("REVIEW_CLAIMED"))],
  ])("fails on %s", async (_label, run) => {
    await expect(expectAdminErrorCode(run, "REVIEW_CLAIMED")).rejects.toThrow();
  });
});
