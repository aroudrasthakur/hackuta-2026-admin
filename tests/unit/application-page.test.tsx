// @vitest-environment happy-dom
import { getByLabelText, queryByLabelText, within } from "@testing-library/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AdminAuthContext,
  type AdminAuthContextValue,
} from "../../src/contexts/adminAuthContext";
import type { SubmittedApplicationSummary } from "../../src/convex/adminApi";
import { ApplicationsPage } from "../../src/pages/admin/ApplicationsPage";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
  action: vi.fn(),
}));

vi.mock("../../src/convex/reactBindings", () => ({
  ConvexProvider: ({ children }: { children: unknown }) => children,
  useQuery: mocks.query,
  useMutation: mocks.mutation,
  usePaginatedQuery: vi.fn(),
}));

function fixtures(): SubmittedApplicationSummary[] {
  return [
    {
      applicationId: "application-a" as SubmittedApplicationSummary["applicationId"],
      applicantName: "Taylor Student",
      email: "taylor@example.com",
      school: "Example University",
      submittedAt: 100,
      reviewStatus: null,
      currentReviewerName: null,
    },
    {
      applicationId: "application-b" as SubmittedApplicationSummary["applicationId"],
      applicantName: "Sam Lee",
      email: "sam@example.com",
      school: "Community College",
      submittedAt: 200,
      reviewStatus: "under_review",
      currentReviewerName: "Jordan Reviewer",
    },
    {
      applicationId: "application-c" as SubmittedApplicationSummary["applicationId"],
      applicantName: "Alex Chen",
      email: "alex@example.com",
      school: "Example University",
      submittedAt: 300,
      reviewStatus: "accepted",
      currentReviewerName: "Jordan Reviewer",
    },
    {
      applicationId: "application-d" as SubmittedApplicationSummary["applicationId"],
      applicantName: "Morgan Patel",
      email: "morgan@example.com",
      school: "City College",
      submittedAt: 400,
      reviewStatus: "waitlisted",
      currentReviewerName: null,
    },
    {
      applicationId: "application-e" as SubmittedApplicationSummary["applicationId"],
      applicantName: "Casey Jones",
      email: "casey@example.com",
      school: "State University",
      submittedAt: 500,
      reviewStatus: "rejected",
      currentReviewerName: null,
    },
    {
      applicationId: "application-f" as SubmittedApplicationSummary["applicationId"],
      applicantName: "Riley Withdrawn",
      email: "riley@example.com",
      school: "State University",
      submittedAt: 600,
      reviewStatus: "withdrawn",
      currentReviewerName: null,
    },
  ];
}

function staffContext(role: "admin"): AdminAuthContextValue {
  return {
    staff: {
      adminId: "staff",
      email: "staff@hackuta.org",
      name: "Staff",
      role,
      expiresAt: Date.now() + 60_000,
    },
    sessionToken: "test-session",
    authError: null,
    isAuthenticated: true,
    isLoading: false,
    sessionReady: true,
    signIn: vi.fn(),
    signOut: vi.fn(),
  };
}

describe.each(["admin"] as const)(
  "applications controls for %s",
  (role) => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
      Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
      mocks.query.mockReset().mockReturnValue(fixtures());
      mocks.mutation.mockReset();
      mocks.action.mockReset();

      container = document.createElement("div");
      document.body.append(container);
      root = createRoot(container);
    });

    afterEach(async () => {
      await act(async () => root.unmount());
      container.remove();
    });

    async function renderPage(path = "/admin/applications") {
      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={[path]}>
            <AdminAuthContext.Provider value={staffContext(role)}>
              <ApplicationsPage />
            </AdminAuthContext.Provider>
          </MemoryRouter>,
        );
      });
    }

    function names() {
      return Array.from(container.querySelectorAll('tbody th[scope="row"] > span:first-child')).map(
        (element) => element.textContent,
      );
    }

    function articleForApplicant(name: string) {
      for (const article of container.querySelectorAll("article")) {
        try {
          within(article).getByRole("heading", { level: 3, name });
          return article;
        } catch {
          // try next card
        }
      }
      throw new Error(`Missing application card for ${name}`);
    }

    async function search(value: string) {
      const input = container.querySelector<HTMLInputElement>(
        'input[type="search"]',
      )!;
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;

      await act(async () => {
        setter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }

    function listboxTrigger(labelText: string) {
      const label = Array.from(container.querySelectorAll(".admin-field label")).find((element) =>
        element.textContent?.includes(labelText),
      );
      const field = label?.closest(".admin-field");
      return field?.querySelector('[role="combobox"]') as HTMLButtonElement | undefined;
    }

    function listboxValue(labelText: string) {
      return listboxTrigger(labelText)?.getAttribute("data-value");
    }

    async function selectFilter(labelText: string, value: string) {
      const label = Array.from(container.querySelectorAll(".admin-field label")).find((element) =>
        element.textContent?.includes(labelText),
      )!;
      const field = label.closest(".admin-field")!;
      const trigger = field.querySelector('[role="combobox"]') as HTMLButtonElement;

      await act(async () => {
        trigger.click();
      });

      const option = field.querySelector(`[role="listbox"] [data-value="${value}"]`) as HTMLButtonElement;
      await act(async () => {
        option.click();
      });
    }

    it.each([
      ["  TAYLOR  ", ["Taylor Student"]],
      ["lee", ["Sam Lee"]],
      ["alex@example.com", ["Alex Chen"]],
      ["EXAMPLE UNIVERSITY", ["Taylor Student", "Alex Chen"]],
    ])("searches for %s", async (term, expected) => {
      await renderPage();
      await selectFilter("Review status", "all");
      await search(term);
      expect(names()).toEqual(expected);
    });

    it.each([
      ["needs_review", "Taylor Student"],
      ["under_review", "Sam Lee"],
      ["accepted", "Alex Chen"],
      ["waitlisted", "Morgan Patel"],
      ["rejected", "Casey Jones"],
    ])("filters status %s", async (status, expected) => {
      await renderPage();
      await selectFilter("Review status", status);
      expect(names()).toEqual([expected]);

      await selectFilter("Review status", "all");
      expect(names()).toHaveLength(6);
    });

    it("combines search and status filtering", async () => {
      await renderPage();
      await search("Example University");
      await selectFilter("Review status", "accepted");
      expect(names()).toEqual(["Alex Chen"]);
    });

    it("defaults to all applications, oldest first", async () => {
      await renderPage();
      expect(names()).toEqual([
        "Taylor Student",
        "Sam Lee",
        "Alex Chen",
        "Morgan Patel",
        "Casey Jones",
        "Riley Withdrawn",
      ]);
      expect(container.textContent).toContain("2 need review");
      expect(container.textContent).toContain("6 total applications");
    });

    it("shows final decision badges beside review links only when decided", async () => {
      await renderPage();
      await selectFilter("Review status", "all");

      for (const [name, label] of [
        ["Alex Chen", "Accepted"],
        ["Morgan Patel", "Waitlisted"],
        ["Casey Jones", "Rejected"],
      ] as const) {
        const card = articleForApplicant(name);
        expect(
          within(card)
            .getByRole("link", { name: new RegExp(`Review application for ${name}`, "i") })
            .getAttribute("href"),
        ).toContain("/admin/applications/");
        expect(getByLabelText(card, `Decision: ${label}`).textContent).toBe(label);
      }

      for (const name of ["Taylor Student", "Sam Lee"]) {
        const card = articleForApplicant(name);
        within(card).getByRole("link", {
          name: new RegExp(`Review application for ${name}`, "i"),
        });
        expect(queryByLabelText(card, /^Decision:/)).toBeNull();
      }
    });

    it("updates the badge when the current review status changes", async () => {
      await renderPage();
      await selectFilter("Review status", "all");
      const updatedApplications = fixtures().map((application) =>
        application.applicantName === "Alex Chen"
          ? { ...application, reviewStatus: "rejected" as const }
          : application,
      );
      mocks.query.mockReturnValue(updatedApplications);
      await search("Alex Chen");

      const card = articleForApplicant("Alex Chen");
      expect(getByLabelText(card, "Decision: Rejected").textContent).toBe("Rejected");
      expect(queryByLabelText(card, "Decision: Accepted")).toBeNull();
    });

    it("sorts all applications oldest first and supports newest first", async () => {
      await renderPage();
      await selectFilter("Review status", "all");
      expect(names()).toEqual([
        "Taylor Student",
        "Sam Lee",
        "Alex Chen",
        "Morgan Patel",
        "Casey Jones",
        "Riley Withdrawn",
      ]);

      await selectFilter("Submission time", "newest");

      expect(names()).toEqual([
        "Riley Withdrawn",
        "Casey Jones",
        "Morgan Patel",
        "Alex Chen",
        "Sam Lee",
        "Taylor Student",
      ]);
    });

    it("shows an empty result when filters match nothing", async () => {
      await renderPage();
      await search("no-such-applicant");
      await selectFilter("Review status", "accepted");
      await selectFilter("Submission time", "newest");

      expect(names()).toEqual([]);
      expect(container.textContent).toContain("No matching applications");
      expect(container.textContent).toContain("Showing 0 of 6 applications");
    });

    it("can expand a search to include completed decisions", async () => {
      await renderPage();
      await selectFilter("Review status", "needs_review");
      await search("alex@example.com");
      expect(names()).toEqual([]);
      const expand = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "Search all applications",
      )!;
      await act(async () => expand.click());
      expect(names()).toEqual(["Alex Chen"]);
      expect(container.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe("alex@example.com");
    });

    it("distinguishes a cleared queue from an empty submission list", async () => {
      mocks.query.mockReturnValue(fixtures().filter((application) =>
        ["accepted", "waitlisted", "rejected", "withdrawn"].includes(application.reviewStatus ?? ""),
      ));
      await renderPage();
      await selectFilter("Review status", "needs_review");
      expect(container.textContent).toContain("No applications need review");
      const expand = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "View all applications",
      )!;
      await act(async () => expand.click());
      expect(names()).toHaveLength(4);
    });

    it("restores controls from a queue URL", async () => {
      await renderPage("/admin/applications?search=example&status=all&sort=newest");
      expect(names()).toEqual(["Riley Withdrawn", "Casey Jones", "Morgan Patel", "Alex Chen", "Sam Lee", "Taylor Student"]);
      expect(listboxValue("Review status")).toBe("all");
      expect(listboxValue("Submission time")).toBe("newest");
    });

    it("falls back to queue defaults for invalid URL controls", async () => {
      await renderPage("/admin/applications?status=invalid&sort=invalid");
      expect(names()).toHaveLength(6);
      expect(listboxValue("Review status")).toBe("all");
      expect(listboxValue("Submission time")).toBe("oldest");
    });

    it("recovers from a query failure using Try again", async () => {
      const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        mocks.query.mockImplementation(() => { throw new Error("offline"); });
        await renderPage();
        expect(container.querySelector('[role="alert"]')?.textContent).toContain("Unable to load applications");
        mocks.query.mockReturnValue(fixtures());
        const retry = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Try again")!;
        await act(async () => retry.click());
        expect(names()).toHaveLength(6);
      } finally {
        errorLog.mockRestore();
      }
    });

    it("shows the loading state", async () => {
      mocks.query.mockReturnValue(undefined);
      await renderPage();
      expect(container.textContent).toContain("Loading applications");
    });

    it("shows the empty submission state", async () => {
      mocks.query.mockReturnValue([]);
      await renderPage();
      expect(container.textContent).toContain("No submitted applications");
    });

    it("does not use mutation or action hooks while changing controls", async () => {
      await renderPage();
      await search("Example");
      await selectFilter("Review status", "accepted");
      await selectFilter("Submission time", "oldest");

      expect(mocks.mutation).not.toHaveBeenCalled();
      expect(mocks.action).not.toHaveBeenCalled();
    });

    it("shows ten applications per page with navigation", async () => {
      const many = Array.from({ length: 11 }, (_, index) => ({
        applicationId: `application-${index}` as SubmittedApplicationSummary["applicationId"],
        applicantName: `Applicant ${String(index + 1).padStart(2, "0")}`,
        email: `applicant-${index}@example.com`,
        school: "Example University",
        submittedAt: index + 1,
        reviewStatus: null,
        currentReviewerName: null,
      }));
      mocks.query.mockReturnValue(many);
      await renderPage();

      expect(names()).toHaveLength(10);
      expect(container.textContent).toContain("Showing 1–10 of 11 applications");
      expect(container.querySelector('nav[aria-label="Applications pages"]')).not.toBeNull();

      const next = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Next")!;
      await act(async () => next.click());
      expect(names()).toHaveLength(1);
      expect(names()[0]).toBe("Applicant 11");
      expect(container.textContent).toContain("Showing 11–11 of 11 applications");

      const previous = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Previous")!;
      await act(async () => previous.click());
      expect(names()).toHaveLength(10);
      expect(container.textContent).toContain("Showing 1–10 of 11 applications");
    });

    it("clamps an out-of-range page back to the last page", async () => {
      const many = Array.from({ length: 11 }, (_, index) => ({
        applicationId: `application-${index}` as SubmittedApplicationSummary["applicationId"],
        applicantName: `Applicant ${String(index + 1).padStart(2, "0")}`,
        email: `applicant-${index}@example.com`,
        school: "Example University",
        submittedAt: index + 1,
        reviewStatus: null,
        currentReviewerName: null,
      }));
      mocks.query.mockReturnValue(many);
      await renderPage("/admin/applications?page=99");
      expect(names()).toHaveLength(1);
      expect(container.textContent).toContain("Page 2 of 2");
    });

    it("ignores a non-numeric page query", async () => {
      await renderPage("/admin/applications?page=abc");
      expect(names()).toHaveLength(6);
      expect(container.textContent).not.toContain("Page 2 of");
    });
  },
);
