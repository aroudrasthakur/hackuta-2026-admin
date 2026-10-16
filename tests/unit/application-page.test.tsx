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
  ];
}

function staffContext(role: "reviewer" | "admin"): AdminAuthContextValue {
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

describe.each(["reviewer", "admin"] as const)(
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

    async function renderPage() {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <AdminAuthContext.Provider value={staffContext(role)}>
              <ApplicationsPage />
            </AdminAuthContext.Provider>
          </MemoryRouter>,
        );
      });
    }

    function names() {
      return Array.from(container.querySelectorAll("article h3")).map(
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

    async function select(index: number, value: string) {
      const element = container.querySelectorAll("select")[index];

      await act(async () => {
        element.value = value;
        element.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }

    it.each([
      ["  TAYLOR  ", ["Taylor Student"]],
      ["lee", ["Sam Lee"]],
      ["alex@example.com", ["Alex Chen"]],
      ["EXAMPLE UNIVERSITY", ["Alex Chen", "Taylor Student"]],
    ])("searches for %s", async (term, expected) => {
      await renderPage();
      await search(term);
      expect(names()).toEqual(expected);
    });

    it.each([
      ["unreviewed", "Taylor Student"],
      ["under_review", "Sam Lee"],
      ["accepted", "Alex Chen"],
      ["waitlisted", "Morgan Patel"],
      ["rejected", "Casey Jones"],
    ])("filters status %s", async (status, expected) => {
      await renderPage();
      await select(0, status);
      expect(names()).toEqual([expected]);

      await select(0, "all");
      expect(names()).toHaveLength(5);
    });

    it("combines search and status filtering", async () => {
      await renderPage();
      await search("Example University");
      await select(0, "accepted");
      expect(names()).toEqual(["Alex Chen"]);
    });

    it("shows final decision badges beside review links only when decided", async () => {
      await renderPage();

      for (const [name, label] of [
        ["Alex Chen", "Accepted"],
        ["Morgan Patel", "Waitlisted"],
        ["Casey Jones", "Rejected"],
      ] as const) {
        const card = articleForApplicant(name);
        expect(
          within(card).getByRole("link", { name: "Review Application" }).getAttribute("href"),
        ).toContain("/admin/applications/");
        expect(getByLabelText(card, `Decision: ${label}`).textContent).toBe(label);
      }

      for (const name of ["Taylor Student", "Sam Lee"]) {
        const card = articleForApplicant(name);
        within(card).getByRole("link", { name: "Review Application" });
        expect(queryByLabelText(card, /^Decision:/)).toBeNull();
      }
    });

    it("updates the badge when the current review status changes", async () => {
      await renderPage();
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

    it("sorts newest first by default and supports oldest first", async () => {
      await renderPage();

      expect(names()).toEqual([
        "Casey Jones",
        "Morgan Patel",
        "Alex Chen",
        "Sam Lee",
        "Taylor Student",
      ]);

      await select(1, "oldest");

      expect(names()).toEqual([
        "Taylor Student",
        "Sam Lee",
        "Alex Chen",
        "Morgan Patel",
        "Casey Jones",
      ]);
    });

    it("shows an empty result and resets all controls", async () => {
      await renderPage();
      await search("no-such-applicant");
      await select(0, "accepted");
      await select(1, "oldest");

      expect(names()).toEqual([]);
      expect(container.textContent).toContain("No matching applications");
      expect(container.textContent).toContain("Showing 0 of 5 applications");

      const reset = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "Reset controls",
      )!;

      await act(async () => reset.click());

      expect(
        container.querySelector<HTMLInputElement>('input[type="search"]')!.value,
      ).toBe("");
      expect(container.querySelectorAll("select")[0].value).toBe("all");
      expect(container.querySelectorAll("select")[1].value).toBe("newest");
      expect(names()).toHaveLength(5);
      expect(names()[0]).toBe("Casey Jones");
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
      await select(0, "accepted");
      await select(1, "oldest");

      expect(mocks.mutation).not.toHaveBeenCalled();
      expect(mocks.action).not.toHaveBeenCalled();
    });
  },
);
