// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { GenericId } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationReviewHistory } from "../../src/components/ApplicationReviewHistory";
import { listApplicationReviewLogsRef, type ReviewHistoryEvent } from "../../src/convex/adminApi";

const mocks = vi.hoisted(() => ({ paginatedQuery: vi.fn(), loadMore: vi.fn() }));
vi.mock("../../src/convex/reactBindings", () => ({
  ConvexProvider: ({ children }: { children: unknown }) => children,
  usePaginatedQuery: mocks.paginatedQuery,
  useQuery: vi.fn(),
  useMutation: vi.fn(),
}));

const applicationId = "application-a" as GenericId<"applications">;

function event(id: string, actorName: string, action: ReviewHistoryEvent["action"], createdAt: number) {
  return { _id: id as GenericId<"applicationReviewLogs">, actorName, action, createdAt };
}

describe("application review history panel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mocks.loadMore.mockReset();
    mocks.paginatedQuery.mockReset().mockReturnValue({ results: [], status: "Exhausted", loadMore: mocks.loadMore });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  async function render(state?: { results: ReviewHistoryEvent[]; status: string }) {
    if (state) mocks.paginatedQuery.mockReturnValue({ ...state, loadMore: mocks.loadMore });
    await act(async () => root.render(
      <ApplicationReviewHistory applicationId={applicationId} sessionToken="internal-session" />,
    ));
  }

  const button = () => container.querySelector("button");

  it("subscribes to the admin history query for the application", async () => {
    await render();
    expect(mocks.paginatedQuery).toHaveBeenCalledWith(
      listApplicationReviewLogsRef,
      { sessionToken: "internal-session", applicationId },
      { initialNumItems: 50 },
    );
  });

  it("shows a loading state before the first page arrives", async () => {
    await render({ results: [], status: "LoadingFirstPage" });
    expect(container.textContent).toContain("Loading review history");
  });

  it("shows an empty state when there is no activity", async () => {
    await render();
    expect(container.textContent).toContain("No review activity yet");
    expect(button()).toBeNull();
  });

  it("lists every event in order with organizer, action, and time, without edit controls", async () => {
    const events = [
      event("log-1", "Avery Admin", "viewed", 1_700_000_000_000),
      event("log-2", "Riley Reviewer", "started_review", 1_700_000_100_000),
      event("log-3", "Riley Reviewer", "viewed", 1_700_000_200_000),
      event("log-4", "Riley Reviewer", "review_ended", 1_700_000_300_000),
      event("log-5", "Avery Admin", "accepted", 1_700_000_400_000),
      event("log-6", "Avery Admin", "rejected", 1_700_000_500_000),
      event("log-7", "Avery Admin", "waitlisted", 1_700_000_600_000),
    ];
    await render({ results: events, status: "Exhausted" });
    const rows = Array.from(container.querySelectorAll("li"));
    expect(rows.map((row) => row.querySelector("p")?.textContent)).toEqual([
      "Avery Admin Viewed application",
      "Riley Reviewer Started review",
      "Riley Reviewer Viewed application",
      "Riley Reviewer Ended review",
      "Avery Admin Accepted applicant",
      "Avery Admin Rejected applicant",
      "Avery Admin Waitlisted applicant",
    ]);
    expect(rows[0].querySelector("time")?.textContent).toBe(new Date(1_700_000_000_000).toLocaleString());
    expect(container.querySelectorAll("button, input, textarea, select")).toHaveLength(0);
  });

  it("folds consecutive views into a collapsed group that lists each view, newest first", async () => {
    await render({
      results: [
        event("log-6", "Avery Admin", "accepted", 1_700_000_600_000),
        event("log-5", "Avery Admin", "viewed", 1_700_000_500_000),
        event("log-4", "Sam Second", "viewed", 1_700_000_400_000),
        event("log-3", "Sam Second", "viewed", 1_700_000_300_000),
        event("log-2", "Riley Reviewer", "started_review", 1_700_000_200_000),
        event("log-1", "Riley Reviewer", "viewed", 1_700_000_100_000),
      ],
      status: "Exhausted",
    });
    const rows = Array.from(container.querySelectorAll("ol > li")).filter((row) => !row.closest("details"));
    expect(rows).toHaveLength(4);
    const group = container.querySelector("details");
    expect(group?.open).toBe(false);
    expect(group?.querySelector("summary")?.textContent).toContain("Viewed application ×3");
    expect(group?.querySelector("summary time")?.textContent).toBe(new Date(1_700_000_500_000).toLocaleString());
    expect(Array.from(group!.querySelectorAll("li")).map((row) => row.querySelector("p")?.textContent)).toEqual([
      "Avery Admin Viewed application",
      "Sam Second Viewed application",
      "Sam Second Viewed application",
    ]);
    expect(container.querySelectorAll("details")).toHaveLength(1);
  });

  it("styles each decision distinctly and mutes views", async () => {
    await render({
      results: [
        event("log-1", "Avery Admin", "accepted", 1),
        event("log-2", "Avery Admin", "rejected", 2),
        event("log-3", "Avery Admin", "waitlisted", 3),
        event("log-4", "Avery Admin", "viewed", 4),
      ],
      status: "Exhausted",
    });
    const actions = Array.from(container.querySelectorAll("li p span:last-child"));
    expect(actions.map((action) => /text-(green|red|amber|mist)/.exec(action.className)?.[1])).toEqual([
      "green",
      "red",
      "amber",
      "mist",
    ]);
  });

  it("loads more activity on request", async () => {
    await render({ results: [event("log-1", "Avery Admin", "viewed", 1)], status: "CanLoadMore" });
    await act(async () => button()!.click());
    expect(mocks.loadMore).toHaveBeenCalledWith(50);
    await render({ results: [event("log-1", "Avery Admin", "viewed", 1)], status: "LoadingMore" });
    expect(button()?.disabled).toBe(true);
  });

  it("contains query errors inside the panel without exposing details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.paginatedQuery.mockImplementation(() => { throw new Error("Private backend error"); });
    await render();
    expect(container.querySelector("h3")?.textContent).toBe("Review history");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("couldn’t load the review history");
    expect(container.textContent).not.toContain("Private backend error");
  });
});
