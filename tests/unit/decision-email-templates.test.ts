import { describe, expect, it } from "vitest";
import { buildDecisionEmailContent } from "../../convex/admin/decisionEmailTemplates";

describe("decision email templates", () => {
  it.each(["accepted", "rejected", "waitlisted"] as const)(
    "builds %s copy with the hackathon name",
    (decision) => {
      const content = buildDecisionEmailContent({
        decision,
        applicantName: "Taylor",
        hackathonName: "HackUTA 2026",
      });
      expect(content.subject).toContain("HackUTA 2026");
      expect(content.text).toContain("Taylor");
      expect(content.text).toContain("HackUTA 2026 organizers");
    },
  );
});
