import { describe, expect, it } from "vitest";
import {
  MAX_SCAN_VALUE_LENGTH,
  normalizeBadgeQr,
  normalizeRegistrationQr,
  scanLookupCandidates,
} from "../../shared/admin/qrValues";

const token = "ab".repeat(32);

describe("normalizeRegistrationQr", () => {
  it("accepts 64 hex characters, forgiving whitespace and case", () => {
    expect(normalizeRegistrationQr(token)).toBe(token);
    expect(normalizeRegistrationQr(` ${token.toUpperCase().slice(0, 32)}\n${token.slice(32)} `)).toBe(token);
  });

  it.each(["", "abc", "g".repeat(64), `${token}a`, "https://example.com", "HACKUTA-BADGE-0001", " ".repeat(600)])("rejects %j", (value) => {
    expect(normalizeRegistrationQr(value)).toBeNull();
  });
});

describe("normalizeBadgeQr", () => {
  it("keeps the printed value exactly, trimming only surrounding whitespace", () => {
    expect(normalizeBadgeQr(" HACKUTA-Badge 0001\n")).toBe("HACKUTA-Badge 0001");
    expect(normalizeBadgeQr("https://badges.example/b/42?x=1")).toBe("https://badges.example/b/42?x=1");
    expect(normalizeBadgeQr("x".repeat(MAX_SCAN_VALUE_LENGTH))).toHaveLength(MAX_SCAN_VALUE_LENGTH);
  });

  it.each(["", "   ", "x".repeat(MAX_SCAN_VALUE_LENGTH + 1), "BAD\u0000GE", "BAD\u0007GE", "BAD\u007fGE", "x".repeat(10_000)])("rejects %j", (value) => {
    expect(normalizeBadgeQr(value)).toBeNull();
  });
});

describe("scanLookupCandidates", () => {
  it("tries the exact badge value first, then the registration reading", () => {
    expect(scanLookupCandidates(" HACKUTA-BADGE-0001 ")).toEqual(["HACKUTA-BADGE-0001"]);
    expect(scanLookupCandidates(token)).toEqual([token]);
    expect(scanLookupCandidates(token.toUpperCase())).toEqual([token.toUpperCase(), token]);
    expect(scanLookupCandidates("BAD\u0007GE")).toEqual([]);
  });
});
