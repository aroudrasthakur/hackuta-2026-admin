import { describe, expect, it } from "vitest";
import { resolveReviewIsStale } from "../../shared/admin/reviewActivityStale";
import { queueReviewStatus } from "../../shared/admin/reviewQueue";

describe("resolveReviewIsStale", () => {
  it("prefers expiresAt when present", () => {
    expect(resolveReviewIsStale({ expiresAt: 100, isStale: false }, 101)).toBe(true);
    expect(resolveReviewIsStale({ expiresAt: 100, isStale: true }, 50)).toBe(false);
  });

  it("falls back to isStale when expiresAt is omitted", () => {
    expect(resolveReviewIsStale({ isStale: true }, 1)).toBe(true);
    expect(resolveReviewIsStale({ isStale: false }, 1)).toBe(false);
  });

  it("computes stale from last activity when newer fields are missing", () => {
    expect(
      resolveReviewIsStale(
        { lastActiveAt: 1_000, activeReviewStaleMs: 15 * 60 * 1000 },
        1_000 + 15 * 60 * 1000 + 1,
      ),
    ).toBe(true);
    expect(
      resolveReviewIsStale(
        { lastActiveAt: 1_000, activeReviewStaleMs: 15 * 60 * 1000 },
        1_000 + 1,
      ),
    ).toBe(false);
  });
});

describe("queueReviewStatus without reviewClaim.expiresAt", () => {
  it("keeps an active claim when expiry is unknown", () => {
    const application = {
      reviewStatus: "under_review" as const,
      currentReviewerName: "Riley",
      reviewClaim: { reviewedBy: "riley" },
    };
    expect(queueReviewStatus(application, 999_999)).toBe("under_review");
  });

  it("honors claimIsStale when expiry is unknown", () => {
    const application = {
      reviewStatus: "under_review" as const,
      currentReviewerName: "Riley",
      reviewClaim: { reviewedBy: "riley" },
      claimIsStale: true,
    };
    expect(queueReviewStatus(application, 1)).toBe("stale");
  });
});
