/** Structured server/browser logs for organizer failures — never include email, password, IP, or bodies. */
export type AdminLogMeta = {
  route?: string;
  convexFunction?: string;
  convexRequestId?: string | null;
  source?: string;
};

export function convexRequestIdFromError(error: unknown): string | null {
  if (!(error instanceof Error)) {
    return null;
  }
  const match = /\[Request ID: ([^\]]+)\]/.exec(error.message);
  return match?.[1] ?? null;
}

function errorSummary(caught: unknown): Record<string, string> {
  if (caught instanceof Error) {
    return { errorName: caught.name, errorMessage: caught.message };
  }
  if (caught === undefined) {
    return {};
  }
  return { errorType: typeof caught };
}

export function logAdminError(context: string, caught: unknown, meta: AdminLogMeta = {}) {
  console.error(context, {
    ...meta,
    convexRequestId: meta.convexRequestId ?? convexRequestIdFromError(caught),
    ...errorSummary(caught),
  });
}
