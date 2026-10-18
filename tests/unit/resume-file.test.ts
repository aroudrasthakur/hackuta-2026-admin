import { describe, expect, it } from "vitest";
import { isUnsupportedNonPdfResume } from "../../src/lib/resumeFile";

describe("isUnsupportedNonPdfResume", () => {
  it.each([
    ["Resume.pdf", false],
    ["Resume.PDF", false],
    [" resume.Pdf ", false],
    ["Resume.docx", true],
    ["Resume.PDF?token=1", false],
    ["Resume.docx?v=2", true],
  ])("uses normalized filename %s -> %s", (filename, unsupported) => {
    expect(isUnsupportedNonPdfResume(filename, null)).toBe(unsupported);
  });

  it("falls back to the URL path when the filename has no extension", () => {
    expect(isUnsupportedNonPdfResume("resume", "https://cdn.example.com/files/applicant.PDF")).toBe(false);
    expect(isUnsupportedNonPdfResume("resume", "https://cdn.example.com/files/applicant.docx")).toBe(true);
  });

  it("allows preview when the extension cannot be determined", () => {
    expect(isUnsupportedNonPdfResume(null, "https://cdn.example.com/download/abc123")).toBe(false);
  });
});
