import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("convex/react", () => ({
  ConvexReactClient: class {
    constructor(public url: string) {}
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Convex client setup", () => {
  it("trims trailing slashes and whitespace from the deployment URL", async () => {
    const { normalizeConvexUrl } = await import("../../src/lib/convexClient");
    expect(normalizeConvexUrl(" https://example.convex.cloud// ")).toBe("https://example.convex.cloud");
    expect(normalizeConvexUrl("   ")).toBeUndefined();
    expect(normalizeConvexUrl(undefined)).toBeUndefined();
  });

  it("creates a client when the URL is set", async () => {
    vi.stubEnv("VITE_CONVEX_URL", "https://standing-manatee-425.convex.cloud/");
    const { getConvexClient } = await import("../../src/lib/convexClient");
    expect(getConvexClient()).toMatchObject({ url: "https://standing-manatee-425.convex.cloud" });
  });

  it("has no client when the URL is missing", async () => {
    vi.stubEnv("VITE_CONVEX_URL", "");
    const { getConvexClient } = await import("../../src/lib/convexClient");
    expect(getConvexClient()).toBeNull();
  });
});
