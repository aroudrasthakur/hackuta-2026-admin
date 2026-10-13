import { makeFunctionReference } from "convex/server";

export type SubmittedApplication = {
  _id: string;
  applicantName: string | null;
  firstName?: string;
  lastName?: string;
  school?: string;
  otherSchool?: string;
  submittedAt?: number;
  status: "under_review" | "accepted" | "waitlisted" | "rejected" | null;
  reviewerName: string | null;
};

export const getCurrentStaffRef = makeFunctionReference<"query">("admin/auth:getCurrentStaff");
export const listSubmittedApplicationsRef =
  makeFunctionReference<
    "query",
    { sessionToken: string },
    SubmittedApplication[]
  >("admin/applications:listSubmittedApplications");
