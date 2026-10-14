import { afterEach, describe, expect, it, vi } from "vitest";
import * as passwordHash from "../../convex/admin/passwordHash";
import { ADMIN_SIGN_IN_DUMMY_PASSWORD_HASH } from "../../convex/admin/signInSecurityConstants";
import { createConvexTest } from "../helpers/convexTestContext";
import { mutateOrganizerSignIn, seedAdminAccount } from "../helpers/staffTestFixtures";

describe("organizer sign-in constant-time verification", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs Scrypt verify against the dummy hash when the email is not provisioned", async () => {
    const verifySpy = vi.spyOn(passwordHash, "verifyPassword");
    const t = createConvexTest();

    const result = await mutateOrganizerSignIn(t, {
      email: "missing@hackuta.org",
      password: "SomePassword1!",
      clientIp: "127.0.0.1",
    });

    expect(result.ok).toBe(false);
    expect(verifySpy).toHaveBeenCalledWith(
      ADMIN_SIGN_IN_DUMMY_PASSWORD_HASH,
      "SomePassword1!",
    );
  });

  it("runs Scrypt verify against the stored hash for a provisioned account", async () => {
    const verifySpy = vi.spyOn(passwordHash, "verifyPassword");
    const t = createConvexTest();
    await seedAdminAccount(t, { email: "known@hackuta.org", role: "admin", active: true });

    await mutateOrganizerSignIn(t, {
      email: "known@hackuta.org",
      password: "WrongPassword1!",
      clientIp: "127.0.0.1",
    });

    expect(verifySpy).toHaveBeenCalled();
    const [hashArg] = verifySpy.mock.calls[0] ?? [];
    expect(hashArg).not.toBe(ADMIN_SIGN_IN_DUMMY_PASSWORD_HASH);
    expect(typeof hashArg).toBe("string");
    expect(String(hashArg).length).toBeGreaterThan(10);
  });
});
