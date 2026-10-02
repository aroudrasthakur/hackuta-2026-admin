export const applicationStatuses = [
  "Unreviewed", "Under Review", "Accepted", "Waitlisted", "Rejected",
] as const;
export type ApplicationStatus = (typeof applicationStatuses)[number];
export type StatusFilter = "All" | ApplicationStatus;
export type SubmissionSort = "newest" | "oldest";

// Adapt the authenticated query result to this presentation model.
export type ApplicationListItem = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  school: string;
  status: ApplicationStatus;
  submittedAt: number;
};

export function selectApplications(
  applications: readonly ApplicationListItem[],
  search: string,
  status: StatusFilter,
  sort: SubmissionSort,
): ApplicationListItem[] {
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return applications.filter((application) => {
    const fields = [application.firstName, application.lastName,
      application.email, application.school].map((field) => field.toLowerCase());
    return (status === "All" || application.status === status)
      && terms.every((term) => fields.some((field) => field.includes(term)));
  }).sort((a, b) => {
    const difference = sort === "newest"
      ? b.submittedAt - a.submittedAt : a.submittedAt - b.submittedAt;
    return difference || a.id.localeCompare(b.id);
  });
}
