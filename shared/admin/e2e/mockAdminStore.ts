import { E2E_ADMIN, E2E_APPLICATION_IDS, E2E_REVIEWER } from "./credentials.ts";

const ACTIVE_REVIEW_STALE_MS = 30 * 60 * 1000;

type StaffRole = "reviewer" | "admin";

type StaffRecord = {
  adminId: string;
  email: string;
  name: string;
  role: StaffRole;
};

type ApplicationRecord = {
  _id: string;
  _creationTime: number;
  authUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  school: string;
  createdAt: number;
  formSubmitted: true;
  submittedAt: number;
};

type ReviewRecord = {
  applicationId: string;
  status: string;
  reviewedBy?: string;
  startedAt?: number;
  lastActiveAt?: number;
  createdAt: number;
  updatedAt: number;
  notification?: {
    logId: string; attempt: number; requestedBy: string; recipient: string;
    status: "scheduled" | "sending" | "queued" | "sent" | "failed" | "unknown" | "unavailable";
    serviceId?: string; updatedAt: number;
  };
};

type LogRecord = {
  _id: string;
  applicationId: string;
  adminId: string;
  action: string;
  createdAt: number;
};

type SessionRecord = {
  sessionToken: string;
  adminId: string;
  expiresAt: number;
};

let revision = 0;
const listeners = new Set<() => void>();

function bump() {
  revision += 1;
  for (const listener of listeners) listener();
}

export function subscribeE2eMockStore(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getE2eMockRevision() {
  return revision;
}

const staffById = new Map<string, StaffRecord>();
const staffByEmail = new Map<string, StaffRecord>();
const sessions = new Map<string, SessionRecord>();
const applications = new Map<string, ApplicationRecord>();
const reviews = new Map<string, ReviewRecord>();
const logs: LogRecord[] = [];
let nextLogId = 100;

function seedStaff(record: StaffRecord) {
  staffById.set(record.adminId, record);
  staffByEmail.set(record.email, record);
}

function seedApplication(
  id: string,
  fields: Omit<ApplicationRecord, "_id" | "_creationTime" | "formSubmitted">,
  review?: Omit<ReviewRecord, "applicationId">,
) {
  applications.set(id, {
    _id: id,
    _creationTime: fields.createdAt,
    formSubmitted: true,
    ...fields,
  });
  if (review) {
    reviews.set(id, { applicationId: id, ...review });
  }
}

function resetStore() {
  staffById.clear();
  staffByEmail.clear();
  sessions.clear();
  applications.clear();
  reviews.clear();
  logs.length = 0;
  nextLogId = 100;

  seedStaff({
    adminId: "e2e-admin-reviewer",
    email: E2E_REVIEWER.email,
    name: E2E_REVIEWER.name,
    role: E2E_REVIEWER.role,
  });
  seedStaff({
    adminId: "e2e-admin-admin",
    email: E2E_ADMIN.email,
    name: E2E_ADMIN.name,
    role: E2E_ADMIN.role,
  });

  const now = Date.now();
  seedApplication(E2E_APPLICATION_IDS.unreviewed, {
    authUserId: "e2e-user-1",
    email: "taylor.unreviewed@example.com",
    firstName: "Taylor",
    lastName: "Unreviewed",
    school: "Example University",
    createdAt: now - 3_000,
    submittedAt: now - 2_000,
  }, { status: "under_review", createdAt: now, updatedAt: now });

  seedApplication(
    E2E_APPLICATION_IDS.underReview,
    {
      authUserId: "e2e-user-2",
      email: "jordan.review@example.com",
      firstName: "Jordan",
      lastName: "Review",
      school: "North Texas College",
      createdAt: now - 2_000,
      submittedAt: now - 1_500,
    },
    {
      status: "under_review",
      reviewedBy: "e2e-admin-reviewer",
      startedAt: now - 600_000,
      lastActiveAt: now - 300_000,
      createdAt: now - 600_000,
      updatedAt: now - 300_000,
    },
  );

  seedApplication(
    E2E_APPLICATION_IDS.readyForDecision,
    {
      authUserId: "e2e-user-3",
      email: "casey.decision@example.com",
      firstName: "Casey",
      lastName: "Decision",
      school: "Tech Institute",
      createdAt: now - 1_000,
      submittedAt: now - 500,
    },
    {
      status: "under_review",
      reviewedBy: "e2e-admin-reviewer",
      startedAt: now - 120_000,
      lastActiveAt: now - 60_000,
      createdAt: now - 120_000,
      updatedAt: now - 60_000,
    },
  );

  seedApplication(
    E2E_APPLICATION_IDS.accepted,
    {
      authUserId: "e2e-user-4",
      email: "alex.accepted@example.com",
      firstName: "Alex",
      lastName: "Accepted",
      school: "State University",
      createdAt: now - 5_000,
      submittedAt: now - 4_000,
    },
    {
      status: "accepted",
      reviewedBy: "e2e-admin-admin",
      startedAt: now - 3_000,
      lastActiveAt: now - 2_000,
      createdAt: now - 3_000,
      updatedAt: now - 2_000,
    },
  );

  logs.push({
    _id: "e2e-seed-log-accepted",
    applicationId: E2E_APPLICATION_IDS.accepted,
    adminId: "e2e-admin-admin",
    action: "accepted",
    createdAt: now - 2_000,
  });

  bump();
}

resetStore();

export function resetE2eMockStore() {
  resetStore();
}

function adminFromSessionToken(sessionToken: string) {
  const embedded = /^e2e-session-(e2e-admin-(?:reviewer|admin))-\d+$/.exec(sessionToken);
  if (embedded?.[1]) {
    const admin = staffById.get(embedded[1]);
    if (admin) return admin;
  }
  const session = sessions.get(sessionToken);
  if (!session || session.expiresAt <= Date.now()) {
    return null;
  }
  return staffById.get(session.adminId) ?? null;
}

function requireSession(sessionToken: string) {
  const admin = adminFromSessionToken(sessionToken);
  if (!admin) {
    throw new Error("Not authenticated");
  }
  return admin;
}

function requireReviewer(sessionToken: string) {
  return requireSession(sessionToken);
}

function requireAdmin(sessionToken: string) {
  const admin = requireSession(sessionToken);
  if (admin.role !== "admin") {
    throw new Error("Not authorized");
  }
  return admin;
}

function isFinalStatus(status: string) {
  return status === "accepted" || status === "rejected" || status === "waitlisted";
}

function reviewActivity(review: ReviewRecord | undefined, now: number) {
  if (!review) {
    return {
      reviewedBy: null,
      currentReviewerName: null,
      startedAt: null,
      lastActiveAt: null,
      isFinal: false,
      isStale: false,
      activeReviewStaleMs: ACTIVE_REVIEW_STALE_MS,
    };
  }
  const reviewer = review.reviewedBy ? staffById.get(review.reviewedBy) : undefined;
  const lastActiveAt = review.lastActiveAt ?? null;
  const isStale =
    review.status === "under_review" &&
    lastActiveAt !== null &&
    now - lastActiveAt > ACTIVE_REVIEW_STALE_MS;
  return {
    reviewedBy: review.reviewedBy ?? null,
    currentReviewerName: reviewer?.name ?? null,
    startedAt: review.startedAt ?? null,
    lastActiveAt,
    isFinal: isFinalStatus(review.status),
    isStale,
    ...(review.status === "under_review" && review.reviewedBy ? { expiresAt: (review.lastActiveAt ?? review.startedAt ?? review.updatedAt) + ACTIVE_REVIEW_STALE_MS } : {}),
    activeReviewStaleMs: ACTIVE_REVIEW_STALE_MS,
  };
}

export function e2eMockSignIn(email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  const staff = staffByEmail.get(normalized);
  const valid =
    (normalized === E2E_REVIEWER.email && password === E2E_REVIEWER.password) ||
    (normalized === E2E_ADMIN.email && password === E2E_ADMIN.password);
  if (!staff || !valid) {
    return { ok: false as const, error: "Invalid email or password." };
  }
  const sessionToken = `e2e-session-${staff.adminId}-${Date.now()}`;
  sessions.set(sessionToken, {
    sessionToken,
    adminId: staff.adminId,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  });
  bump();
  return {
    ok: true as const,
    sessionToken,
    expiresAt: sessions.get(sessionToken)!.expiresAt,
  };
}

export function e2eMockSignOut(sessionToken: string) {
  sessions.delete(sessionToken);
  bump();
  return { ok: true as const };
}

export function e2eMockRunQuery(path: string, args: Record<string, unknown>) {
  const sessionToken = String(args.sessionToken ?? "");

  switch (path) {
    case "admin/auth:getCurrentStaff": {
      const admin = adminFromSessionToken(sessionToken);
      if (!admin) return null;
      return {
        adminId: admin.adminId,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      };
    }
    case "admin/applications:listSubmittedApplications": {
      requireReviewer(sessionToken);
      return [...applications.values()]
        .map((application) => {
          const review = reviews.get(application._id);
          const reviewer = review?.reviewedBy ? staffById.get(review.reviewedBy) : undefined;
          return {
            applicationId: application._id,
            email: application.email,
            applicantName: `${application.firstName} ${application.lastName}`,
            school: application.school,
            submittedAt: application.submittedAt,
            reviewStatus: review?.status ?? null,
            currentReviewerName: reviewer?.name ?? null,
            ...(review?.status === "under_review" && review.reviewedBy ? {
              reviewClaim: { reviewedBy: review.reviewedBy, expiresAt: (review.lastActiveAt ?? review.startedAt ?? review.updatedAt) + ACTIVE_REVIEW_STALE_MS },
            } : {}),
          };
        })
        .sort((left, right) => (right.submittedAt ?? 0) - (left.submittedAt ?? 0));
    }
    case "admin/applications:getApplication": {
      requireReviewer(sessionToken);
      const applicationId = String(args.applicationId ?? "");
      const application = applications.get(applicationId);
      if (!application) return null;
      const review = reviews.get(applicationId);
      const now = Date.now();
      return {
        application,
        ...(review?.notification ? { notification: review.notification } : {}),
        reviewStatus: review?.status ?? null,
        reviewActivity: reviewActivity(review, now),
        resume: { status: "none" as const, url: null, filename: null },
      };
    }
    case "admin/applicationReviewLogs:listApplicationReviewLogs": {
      requireAdmin(sessionToken);
      const applicationId = String(args.applicationId ?? "");
      if (!applications.has(applicationId)) throw new Error("Application not found");
      const paginationOpts = args.paginationOpts as { numItems: number; cursor: string | null };
      const filtered = logs
        .filter((log) => log.applicationId === applicationId)
        .sort((left, right) => right.createdAt - left.createdAt);
      const end = paginationOpts.numItems;
      const page = filtered.slice(0, end);
      return {
        page: page.map((log) => ({
          _id: log._id,
          action: log.action,
          createdAt: log.createdAt,
          actorName: staffById.get(log.adminId)?.name ?? "Unknown organizer",
        })),
        isDone: end >= filtered.length,
        continueCursor: end >= filtered.length ? null : String(end),
      };
    }
    default:
      throw new Error(`Unhandled E2E mock query: ${path}`);
  }
}

export async function e2eMockRunMutation(path: string, args: Record<string, unknown>) {
  const sessionToken = String(args.sessionToken ?? "");
  const now = Date.now();

  switch (path) {
    case "admin/notificationActions:checkDecisionNotification": {
      requireReviewer(sessionToken);
      const review = reviews.get(String(args.applicationId));
      if (!review?.notification?.serviceId) throw new Error("No email service ID is available to check.");
      review.notification.status = "sent";
      bump();
      return;
    }
    case "admin/decisionNotifications:retryDecisionNotification": {
      const admin = requireReviewer(sessionToken);
      const applicationId = String(args.applicationId);
      const review = reviews.get(applicationId);
      if (!review || !isFinalStatus(review.status)) throw new Error("A decision is required before sending a notification.");
      if (review.notification && !["failed", "unknown", "unavailable"].includes(review.notification.status)) throw new Error("This notification is already in progress or has been sent.");
      const log = [...logs].reverse().find((entry) => entry.applicationId === applicationId && entry.action === review.status);
      if (!log) throw new Error("No recorded decision is available to notify.");
      review.notification = {
        logId: log._id, attempt: (review.notification?.attempt ?? 0) + 1, requestedBy: admin.adminId,
        recipient: applications.get(applicationId)!.email, status: "queued", serviceId: "mock-email", updatedAt: now,
      };
      bump();
      return;
    }
    case "admin/applicationReviewLogs:logApplicationReviewAction": {
      const admin = requireReviewer(sessionToken);
      const applicationId = String(args.applicationId ?? "");
      const action = String(args.action ?? "");
      if (!applications.has(applicationId)) throw new Error("Application not found");

      if (action === "started_review") {
        let review = reviews.get(applicationId);
        if (!review) {
          review = {
            applicationId,
            status: "under_review",
            reviewedBy: admin.adminId,
            startedAt: now,
            lastActiveAt: now,
            createdAt: now,
            updatedAt: now,
          };
          reviews.set(applicationId, review);
        } else if (review.status === "under_review" && review.reviewedBy === admin.adminId) {
          review.lastActiveAt = now;
          review.updatedAt = now;
        } else if (
          review.status !== "under_review" ||
          !review.reviewedBy ||
          review.reviewedBy === admin.adminId ||
          (review.lastActiveAt !== undefined && now - review.lastActiveAt > ACTIVE_REVIEW_STALE_MS)
        ) {
          review.status = "under_review";
          review.reviewedBy = admin.adminId;
          review.startedAt = review.startedAt ?? now;
          review.lastActiveAt = now;
          review.updatedAt = now;
        } else {
          throw new Error("Another organizer is actively reviewing this application.");
        }
      }

      const logId = `e2e-log-${nextLogId++}`;
      logs.push({
        _id: logId,
        applicationId,
        adminId: admin.adminId,
        action,
        createdAt: now,
      });
      bump();
      return logId;
    }
    case "admin/applicationReviewLogs:setApplicationDecision": {
      const admin = requireReviewer(sessionToken);
      const applicationId = String(args.applicationId ?? "");
      const decision = String(args.decision ?? "") as "accepted" | "rejected" | "waitlisted";
      if (!applications.has(applicationId)) throw new Error("Application not found");
      const review = reviews.get(applicationId);
      if (!review) throw new Error("Application review not found");
      if (isFinalStatus(review.status) && !(review.status === "waitlisted" && decision === "accepted")) {
        throw new Error("This application already has a final decision.");
      }
      if (
        review.status === "under_review" &&
        review.reviewedBy &&
        review.reviewedBy !== admin.adminId &&
        review.lastActiveAt !== undefined &&
        now - review.lastActiveAt <= ACTIVE_REVIEW_STALE_MS
      ) {
        throw new Error("Application is already being reviewed by another organizer.");
      }
      review.status = decision;
      review.reviewedBy = admin.adminId;
      review.lastActiveAt = now;
      review.updatedAt = now;
      const logId = `e2e-log-${nextLogId++}`;
      logs.push({
        _id: logId,
        applicationId,
        adminId: admin.adminId,
        action: decision,
        createdAt: now,
      });
      review.notification = {
        logId, attempt: 1, requestedBy: admin.adminId, recipient: applications.get(applicationId)!.email,
        status: "queued", serviceId: `mock-email-${logId}`, updatedAt: now,
      };
      bump();
      return { logId, duplicate: false };
    }
    default:
      throw new Error(`Unhandled E2E mock mutation: ${path}`);
  }
}
