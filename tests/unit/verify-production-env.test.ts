import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const scriptPath = fileURLToPath(new URL("../../scripts/verify-production-env.mjs", import.meta.url));

function runVerify(env: Record<string, string | undefined>) {
  try {
    execFileSync(process.execPath, [scriptPath], {
      env: { ...process.env, ...env },
      stdio: "pipe",
    });
    return 0;
  } catch (error) {
    const err = error as { status?: number };
    return err.status ?? 1;
  }
}

describe("verify-production-env", () => {
  it("blocks VITE_DEV_AUTH_BYPASS on production-like builds", () => {
    expect(
      runVerify({
        NODE_ENV: "production",
        VITE_DEV_AUTH_BYPASS: "true",
        VITE_E2E_MOCK: "false",
      }),
    ).toBe(1);
  });

  it("allows VITE_E2E_MOCK in GitHub Actions CI builds", () => {
    expect(
      runVerify({
        NODE_ENV: "production",
        CI: "true",
        GITHUB_ACTIONS: "true",
        VITE_E2E_MOCK: "true",
        VITE_DEV_AUTH_BYPASS: "false",
      }),
    ).toBe(0);
  });
});
