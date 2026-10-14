import { describe, expect, it } from "vitest";
import { isAdminDevAuthBypassEnabled } from "../../server/devAuthConfig";

describe("admin dev auth bypass gating", () => {
  it("enables only in development when the env flag is true", () => {
    expect(
      isAdminDevAuthBypassEnabled({ mode: "development", viteDevAuthBypass: "true" }),
    ).toBe(true);
  });

  it.each([
    ["production", "true"],
    ["preview", "true"],
    ["development", "false"],
    ["development", undefined],
    ["development", "1"],
  ] as const)("stays off for mode=%s viteDevAuthBypass=%s", (mode, viteDevAuthBypass) => {
    expect(isAdminDevAuthBypassEnabled({ mode, viteDevAuthBypass })).toBe(false);
  });
});
