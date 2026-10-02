import { useState } from "react";
import { useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { LoadingState } from "../../components/states/LoadingState";
import { useSearchParams } from "react-router-dom";
import { EmptyState } from "../../components/states/EmptyState";
import { applicationStatuses, selectApplications } from "../../lib/applicationList";
import type { ApplicationListItem, StatusFilter, SubmissionSort } from "../../lib/applicationList";

const sampleApplications: readonly ApplicationListItem[] = applicationStatuses.map((status, index) => ({
  id: `sample-${index}`,
  firstName: ["Alex", "Jordan", "Taylor", "Morgan", "Casey"][index] ?? "Sample",
  lastName: ["Rivera", "Patel", "Chen", "Smith", "Jones"][index] ?? "Applicant",
  email: `sample${index + 1}@example.com`,
  school: index % 2 === 0 ? "University of Texas at Arlington" : "University of North Texas",
  status,
  submittedAt: Date.UTC(2026, 8, 20 + index, 12),
}));

const controlClass = "w-full rounded-lg border border-sand bg-light px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-ocean";

// Shared presentation for both roles; no queries, mutations, or logging callbacks.
export function ApplicationList({ applications }: { applications: readonly ApplicationListItem[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("All");
  const [sort, setSort] = useState<SubmissionSort>("newest");
  const visible = selectApplications(applications, search, status, sort);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span>Search applications</span>
          <input type="search" className={controlClass} value={search}
            placeholder="Name, email, or school" onChange={(event) => setSearch(event.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          <span>Status</span>
          <select className={controlClass} value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}>
            {["All", ...applicationStatuses].map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Submission time</span>
          <select className={controlClass} value={sort}
            onChange={(event) => setSort(event.target.value as SubmissionSort)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
      </div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <p role="status" aria-live="polite">Showing {visible.length} of {applications.length} applications</p>
        <button type="button" className="rounded px-3 py-2 text-ocean underline focus:ring-2 focus:ring-ocean"
          onClick={() => { setSearch(""); setStatus("All"); setSort("newest"); }}>Reset controls</button>
      </div>
      {visible.length === 0 ? (
        <EmptyState title={applications.length === 0 ? "No applications yet" : "No applications match"}
          description={applications.length === 0 ? "Applications will appear here when available." : "Try another search or reset the controls."} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-sand">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Applications matching the current search and status filter</caption>
            <thead className="bg-clay"><tr>
              {["Name", "Email", "School", "Status", "Submitted"].map((heading) => (
                <th scope="col" key={heading} className="px-4 py-3">{heading}</th>
              ))}
            </tr></thead>
            <tbody>{visible.map((application) => (
              <tr key={application.id} className="border-t border-sand">
                <td className="px-4 py-3">{application.firstName} {application.lastName}</td>
                <td className="px-4 py-3">{application.email}</td>
                <td className="px-4 py-3">{application.school}</td>
                <td className="whitespace-nowrap px-4 py-3">{application.status}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <time dateTime={new Date(application.submittedAt).toISOString()}>
                    {new Date(application.submittedAt).toLocaleString()}
                  </time>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const listRef = makeFunctionReference<"query", Record<string, never>, ApplicationListItem[]>("admin/applications:list");

function LiveApplications() {
  const applications = useQuery(listRef, {});
  if (applications === undefined) return <LoadingState message="Loading applications…" />;
  return <ApplicationList applications={applications} />;
}

export function ApplicationsPage() {
  const [params] = useSearchParams();
  const preview = import.meta.env.DEV && params.get("preview") === "1";
  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl text-night">Applications</h2>
      {preview ? (
        <>
          <p className="rounded-lg border border-sand bg-clay p-3 text-sm">
            Sample data preview — these fictional applications are local and are not saved to Convex.
          </p>
          <ApplicationList applications={sampleApplications} />
        </>
      ) : (
        <LiveApplications />
      )}
    </section>
  );
}
