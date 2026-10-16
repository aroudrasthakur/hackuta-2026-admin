// @vitest-environment happy-dom
import { act, StrictMode, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import type { GenericId } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APPLICATION_QUESTIONS } from "../../shared/registration/constants";
import { AdminProtectedRoute } from "../../src/components/AdminProtectedRoute";
import { AdminAuthContext, type AdminAuthContextValue } from "../../src/contexts/adminAuthContext";
import {
  getApplicationRef,
  listApplicationReviewLogsRef,
  listSubmittedApplicationsRef,
  logApplicationReviewActionRef,
  setApplicationDecisionRef,
  type ApplicationDetail,
} from "../../src/convex/adminApi";
import {
  ApplicationReviewContent,
  ApplicationReviewPage,
} from "../../src/pages/admin/ApplicationReviewPage";
import { ApplicationsPage } from "../../src/pages/admin/ApplicationsPage";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  paginatedQuery: vi.fn(),
  mutationHook: vi.fn(),
  recordView: vi.fn(),
  finalizeDecision: vi.fn(),
  actionHook: vi.fn(),
}));
vi.mock("../../src/convex/reactBindings", () => ({
  ConvexProvider: ({ children }: { children: unknown }) => children,
  useQuery: mocks.query,
  usePaginatedQuery: mocks.paginatedQuery,
  useMutation: mocks.mutationHook,
}));

function applicationDetail(): ApplicationDetail {
  return {
    application: {
      _id: "application-a" as GenericId<"applications">, _creationTime: 1,
      authUserId: "applicant" as GenericId<"users">, email: "taylor@example.com", createdAt: 1,
      formSubmitted: true, submittedAt: 1_700_000_000_000,
      firstName: "Taylor", lastName: "Student", phone: "(817) 555-0123", age: 21,
      school: "Other (Please Specify)", otherSchool: "Example University",
      major: "Computer science", experienceLevel: "Beginner", hackathonsAttended: 0,
      internationalStudent: false, raceEthnicity: ["Chinese", "White"],
      builtOrWantToBuild: "I built a project.\nIt helps my community.",
      shortDeadlineLearning: "I learned a new tool on a short deadline.",
      dietaryRestrictions: ["Vegan"], allergyDetails: "Peanuts",
      accessibilityNeeds: "Step-free access", emergencyContactName: "Jordan Student",
      emergencyContactRelationship: "Sibling", emergencyContactPhone: "(817) 555-0124",
      mlhCodeOfConductAgreed: true, mlhCodeOfConductAgreedAt: 1_700_000_000_000,
      mlhCommunicationsConsent: false, github: "https://github.com/example",
    },
    reviewStatus: "under_review",
    reviewActivity: {
      reviewedBy: null,
      currentReviewerName: null,
      startedAt: null,
      lastActiveAt: null,
      isFinal: false,
      isStale: false,
      activeReviewStaleMs: 30 * 60 * 1000,
    },
    resume: { status: "available", url: "https://files.example.com/resume.pdf", filename: "Taylor.pdf" },
  };
}

function staffContext(overrides: Partial<AdminAuthContextValue> = {}): AdminAuthContextValue {
  return {
    staff: { adminId: "staff", email: "staff@hackuta.org", name: "Staff", role: "reviewer", expiresAt: Date.now() + 60_000 },
    sessionToken: "internal-session", isAuthenticated: true, isLoading: false, sessionReady: true,
    signIn: vi.fn(), signOut: vi.fn(), ...overrides,
  };
}

describe("read-only application review page", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mocks.query.mockReset().mockImplementation((ref) => {
      if (ref === listSubmittedApplicationsRef) return [];
      return applicationDetail();
    });
    mocks.paginatedQuery.mockReset().mockReturnValue({ results: [], status: "Exhausted", loadMore: vi.fn() });
    mocks.mutationHook.mockReset().mockImplementation((ref) =>
      ref === setApplicationDecisionRef ? mocks.finalizeDecision : mocks.recordView,
    );
    mocks.finalizeDecision.mockReset().mockResolvedValue({ logId: "decision-log", duplicate: false });
    mocks.recordView.mockReset().mockResolvedValue("view-log");
    mocks.actionHook.mockReset();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    expect(mocks.actionHook).not.toHaveBeenCalled();
  });

  async function renderPage({
    path = "/admin/applications/application-a", context = staffContext(), navigation = false,
  }: { path?: string; context?: AdminAuthContextValue; navigation?: boolean } = {}) {
    await act(async () => root.render(
      <StrictMode>
        <AdminAuthContext.Provider value={context}>
          <MemoryRouter key={path} initialEntries={[path]}>
            {navigation && <>
              <Link to="/admin/applications/application-b" data-testid="next">Next application</Link>
              <Link to="/admin/applications/application-a" data-testid="reopen">Reopen application</Link>
            </>}
            <Routes>
              <Route path="/admin/applications/:applicationId" element={
                <AdminProtectedRoute><ApplicationReviewPage /></AdminProtectedRoute>
              } />
              <Route path="/admin/applications" element={<ApplicationsPage />} />
              <Route path="/admin/login" element={<p>Organizer sign-in</p>} />
            </Routes>
          </MemoryRouter>
        </AdminAuthContext.Provider>
      </StrictMode>,
    ));
  }

  async function renderDetail(detail: ApplicationDetail | null | undefined) {
    mocks.query.mockImplementation((ref) => {
      if (ref === listSubmittedApplicationsRef) return [];
      return detail;
    });
    await renderPage();
  }

  function answer(label: string) {
    return Array.from(container.querySelectorAll("dt"))
      .find((element) => element.textContent === label)?.nextElementSibling?.textContent;
  }

  function backLink() {
    return Array.from(container.querySelectorAll("a"))
      .find((element) => element.textContent === "Back to Applications");
  }

  it.each(["reviewer", "admin"] as const)("shows decision controls without finalizing until confirmation", async (role) => {
    const context = staffContext();
    context.staff = { ...context.staff!, role };
    await renderPage({ context });
    expect(mocks.query).toHaveBeenCalledWith(getApplicationRef, {
      sessionToken: "internal-session", applicationId: "application-a",
    });
    expect(mocks.mutationHook).toHaveBeenCalledWith(logApplicationReviewActionRef);
    expect(mocks.recordView).toHaveBeenCalledExactlyOnceWith({
      sessionToken: "internal-session", applicationId: "application-a", action: "viewed",
    });
    expect(container.textContent).toContain("Taylor Student");
    for (const title of ["Personal and contact information", "Education", "Technical and hackathon background",
      "Application responses", "Dietary and allergy information", "Accessibility", "Emergency contact", "MLH and consent information", "Resume"]) {
      expect(container.querySelector(`section[aria-label="${title}"]`)).not.toBeNull();
    }
    expect(answer("Other school")).toBe("Example University");
    expect(answer("Hackathons attended")).toBe("0");
    expect(answer("International student")).toBe("No");
    expect(answer("Race / ethnicity")).toBe("Chinese, White");
    expect(answer("Dietary restrictions")).toBe("Vegan");
    expect(answer("MLH code of conduct agreement")).toBe("Yes");
    expect(answer("MLH communications consent")).toBe("No");
    expect(answer("Code of conduct agreed at")).toBe(new Date(1_700_000_000_000).toLocaleString());
    expect(answer(APPLICATION_QUESTIONS.builtOrWantToBuild)).toBe("I built a project.\nIt helps my community.");
    expect(answer("Allergy details")).toBe("Peanuts");
    expect(answer("Accessibility needs")).toBe("Step-free access");
    expect(answer("Contact name")).toBe("Jordan Student");
    expect(container.textContent).toContain("Review status: Under Review");
    expect(container.querySelectorAll("input, textarea, select")).toHaveLength(0);
    expect(container.textContent).toContain("Start review");
    expect(container.textContent).toContain("Accept");
    expect(mocks.finalizeDecision).not.toHaveBeenCalled();
    await act(async () =>
      Array.from(container.querySelectorAll("button")).find((el) => el.textContent === "Accept")!.click(),
    );
    expect(mocks.finalizeDecision).not.toHaveBeenCalled();
    await act(async () =>
      Array.from(container.querySelectorAll("button")).find((el) => el.textContent === "Confirm acceptance")!.click(),
    );
    expect(mocks.finalizeDecision).toHaveBeenCalledExactlyOnceWith({
      sessionToken: "internal-session",
      applicationId: "application-a",
      decision: "accepted",
    });
  });

  it.each(["reviewer", "admin"] as const)("shows review history only to admin accounts (%s)", async (role) => {
    const context = staffContext();
    context.staff = { ...context.staff!, role };
    await renderPage({ context });
    const history = container.querySelector('section[aria-label="Review history"]');
    if (role === "admin") {
      expect(history).not.toBeNull();
      expect(mocks.paginatedQuery).toHaveBeenCalledWith(
        listApplicationReviewLogsRef,
        { sessionToken: "internal-session", applicationId: "application-a" },
        { initialNumItems: 50 },
      );
    } else {
      expect(history).toBeNull();
      expect(mocks.paginatedQuery).not.toHaveBeenCalled();
    }
  });

  it("handles sparse and older applications without raw missing values", async () => {
    const detail = applicationDetail();
    detail.application = {
      _id: detail.application._id, _creationTime: 1, authUserId: detail.application.authUserId,
      email: "older@example.com", createdAt: 1, formSubmitted: true,
    };
    detail.reviewStatus = null;
    detail.resume = { status: "none", url: null, filename: null };
    await renderDetail(detail);
    expect(container.textContent).toContain("Review status: Unreviewed");
    expect(container.textContent).toContain("Submitted: Not recorded");
    expect(answer("First name")).toBe("Not provided");
    expect(answer("Dietary restrictions")).toBe("Not provided");
    expect(answer("Code of conduct agreed at")).toBe("Not recorded");
    expect(container.textContent).toContain("No resume was attached.");
    expect(container.textContent).not.toMatch(/undefined|null/);
  });

  it("distinguishes an empty dietary selection from missing answers", async () => {
    const detail = applicationDetail();
    detail.application.dietaryRestrictions = [];
    detail.application.raceEthnicity = [];
    await renderDetail(detail);
    expect(answer("Dietary restrictions")).toBe("None selected");
    expect(answer("Race / ethnicity")).toBe("Not provided");
  });

  it("offers an in-page preview with a fallback filename and no PDF link", async () => {
    const detail = applicationDetail();
    detail.resume.filename = null;
    await renderDetail(detail);
    const section = container.querySelector('section[aria-label="Resume"]');
    expect(section?.textContent).toContain("Applicant resume");
    expect(section?.querySelector("button")?.textContent).toBe("Preview Resume");
    expect(section?.querySelector("a")).toBeNull();
    expect(section?.querySelector("dialog")?.hasAttribute("open")).toBe(false);
  });

  it("explains an unavailable attached resume without a broken link", async () => {
    const detail = applicationDetail();
    detail.resume = { status: "missing", url: null, filename: "missing.pdf" };
    await renderDetail(detail);
    const section = container.querySelector('section[aria-label="Resume"]');
    expect(section?.textContent).toContain("The attached resume is no longer available.");
    expect(section?.querySelector("a")).toBeNull();
  });

  it("renders applicant markup as text and does not link unsafe URL schemes", async () => {
    const detail = applicationDetail();
    detail.application.builtOrWantToBuild = "<img src=x onerror=alert(1)>";
    detail.application.portfolio = "javascript:alert(1)";
    await renderDetail(detail);
    expect(answer(APPLICATION_QUESTIONS.builtOrWantToBuild)).toBe("<img src=x onerror=alert(1)>");
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(container.querySelector('a[href="https://github.com/example"]')).not.toBeNull();
  });

  it.each([undefined, null])("preserves navigation when application data is %s", async (detail) => {
    await renderDetail(detail);
    expect(container.textContent).toContain(detail === undefined ? "Loading application" : "Application not found");
    expect(backLink()?.getAttribute("href")).toBe("/admin/applications");
    expect(mocks.recordView).not.toHaveBeenCalled();
  });

  it("contains query errors within the page and recovers on another application", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.query.mockImplementation((ref, args: { applicationId: string }) => {
      if (ref === listSubmittedApplicationsRef) return [];
      if (args.applicationId === "application-a") throw new Error("Private backend error");
      return applicationDetail();
    });
    await renderPage({ navigation: true });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Unable to load application");
    expect(container.textContent).not.toContain("Private backend error");
    expect(mocks.recordView).not.toHaveBeenCalled();
    expect(backLink()).toBeDefined();
    await act(async () => container.querySelector<HTMLAnchorElement>('[data-testid="next"]')!.click());
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain("Taylor Student");
  });

  it("does not query applicant data while staff authentication is loading", async () => {
    await renderPage({ context: staffContext({ isLoading: true }) });
    expect(container.textContent).toContain("Verifying organizer session");
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.recordView).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated visitors before loading application data", async () => {
    await renderPage({ context: staffContext({ staff: null, sessionToken: null, isAuthenticated: false }) });
    expect(container.textContent).toContain("Organizer sign-in");
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.recordView).not.toHaveBeenCalled();
  });

  it("supports the Back to Applications link without generating another log", async () => {
    await renderPage();
    await act(async () => backLink()!.click());
    expect(container.textContent).toContain("No submitted applications");
    expect(mocks.recordView).toHaveBeenCalledTimes(1);
  });

  it.each(["/admin/applications", "/admin/applications?search=taylor&status=accepted&sort=name"])(
    "keeps dashboard route %s free of view events", async (path) => {
      await renderPage({ path });
      expect(mocks.query).toHaveBeenCalledWith(listSubmittedApplicationsRef, {
        sessionToken: "internal-session",
      });
      expect(mocks.query).not.toHaveBeenCalledWith(getApplicationRef, expect.anything());
      expect(mocks.mutationHook).not.toHaveBeenCalled();
      expect(mocks.recordView).not.toHaveBeenCalled();
    },
  );

  it("records once after loading and ignores Strict Mode, rerenders, and query updates", async () => {
    await renderDetail(undefined);
    expect(mocks.recordView).not.toHaveBeenCalled();
    mocks.query.mockImplementation((ref) => {
      if (ref === listSubmittedApplicationsRef) return [];
      return applicationDetail();
    });
    await renderPage();
    const detail = applicationDetail();
    detail.reviewStatus = "accepted";
    await renderDetail(detail);
    expect(container.textContent).toContain("Review status: Accepted");
    await renderPage();
    expect(mocks.recordView).toHaveBeenCalledTimes(1);
  });

  it("logs viewed for each application when the review content stays mounted", async () => {
    mocks.query.mockImplementation((ref, args: { applicationId: string }) => {
      if (ref === listSubmittedApplicationsRef) return [];
      const detail = applicationDetail();
      detail.application._id = args.applicationId as GenericId<"applications">;
      return detail;
    });

    function Harness() {
      const [applicationId, setApplicationId] = useState("application-a");
      return (
        <>
          <button type="button" data-testid="switch-app" onClick={() => setApplicationId("application-b")}>
            Switch application
          </button>
          <ApplicationReviewContent
            applicationId={applicationId}
            sessionToken="internal-session"
            staffAdminId="staff"
            isAdmin={false}
          />
        </>
      );
    }

    await act(async () =>
      root.render(
        <StrictMode>
          <AdminAuthContext.Provider value={staffContext()}>
            <Harness />
          </AdminAuthContext.Provider>
        </StrictMode>,
      ),
    );
    expect(mocks.recordView).toHaveBeenCalledExactlyOnceWith({
      sessionToken: "internal-session",
      applicationId: "application-a",
      action: "viewed",
    });

    await act(async () => container.querySelector<HTMLButtonElement>('[data-testid="switch-app"]')!.click());
    expect(mocks.recordView.mock.calls.map(([args]) => args.applicationId)).toEqual([
      "application-a",
      "application-b",
    ]);
  });

  it("records new visits to the same application and other applications", async () => {
    mocks.query.mockImplementation((ref, args: { applicationId: string }) => {
      if (ref === listSubmittedApplicationsRef) return [];
      const detail = applicationDetail();
      detail.application._id = args.applicationId as GenericId<"applications">;
      return detail;
    });
    await renderPage({ navigation: true });
    await act(async () => container.querySelector<HTMLAnchorElement>('[data-testid="next"]')!.click());
    await act(async () => container.querySelector<HTMLAnchorElement>('[data-testid="reopen"]')!.click());
    await act(async () => backLink()!.click());
    await act(async () => container.querySelector<HTMLAnchorElement>('[data-testid="reopen"]')!.click());
    await act(async () => container.querySelector<HTMLAnchorElement>('[data-testid="reopen"]')!.click());
    expect(mocks.recordView.mock.calls.map(([args]) => args.applicationId))
      .toEqual(["application-a", "application-b", "application-a", "application-a", "application-a"]);
  });

  it("shows a failure notice without retrying, and retries on a later visit", async () => {
    mocks.recordView.mockRejectedValueOnce(new Error("Private logging error"));
    await renderPage({ navigation: true });
    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain("Please reopen the application to try again.");
    expect(container.textContent).toContain("Taylor Student");
    expect(container.textContent).not.toContain("Private logging error");
    await renderPage({ navigation: true });
    expect(mocks.recordView).toHaveBeenCalledTimes(1);
    await act(async () => backLink()!.click());
    await act(async () => container.querySelector<HTMLAnchorElement>('[data-testid="reopen"]')!.click());
    expect(mocks.recordView).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("ignores a logging failure that arrives after leaving the application", async () => {
    let reject!: (reason: Error) => void;
    mocks.recordView.mockReturnValueOnce(new Promise((_resolve, rejectPromise) => { reject = rejectPromise; }));
    await renderPage({ navigation: true });
    await act(async () => backLink()!.click());
    await act(async () => reject(new Error("Late failure")));
    expect(container.textContent).toContain("No submitted applications");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(mocks.recordView).toHaveBeenCalledTimes(1);
  });
});
