/** Allow manual recovery if a scheduled action stopped before saving its result. */
export const NOTIFICATION_ATTEMPT_STALE_MS = 5 * 60_000;

type NotificationAttempt = { status: string; updatedAt: number };

export function notificationAttemptExpired(notification: NotificationAttempt | undefined, now: number) {
  return !!notification && ["scheduled", "sending"].includes(notification.status)
    && now - notification.updatedAt > NOTIFICATION_ATTEMPT_STALE_MS;
}

export function notificationCanRetry(notification: NotificationAttempt | undefined, now: number) {
  return !notification || ["failed", "unknown", "unavailable"].includes(notification.status) || notificationAttemptExpired(notification, now);
}
