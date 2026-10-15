import {
  ADMIN_ERROR_MESSAGES,
  adminErrorCode,
  GENERIC_ERROR_MESSAGE,
} from "../../shared/admin/errors";

/** An error whose message was written for organizers and is safe to display as-is. */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

/**
 * Message to show for a caught error. Known Convex error codes get their catalog message;
 * anything else gets `fallback` so raw server text, request IDs, and stacks never reach the UI.
 */
export function userFacingErrorMessage(caught: unknown, fallback = GENERIC_ERROR_MESSAGE) {
  if (caught instanceof UserFacingError) return caught.message;
  const code = adminErrorCode(caught);
  return code ? ADMIN_ERROR_MESSAGES[code] : fallback;
}

/** Logs the original error for debugging, then returns the message to show. */
export function reportUserFacingError(context: string, caught: unknown, fallback?: string) {
  console.error(context, caught);
  return userFacingErrorMessage(caught, fallback);
}
