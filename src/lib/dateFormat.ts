export const reviewHistoryDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** e.g. "Oct, 14 - 9:58 PM" for application timestamps in the admin UI. */
export function formatApplicationDisplayDate(timestampMs: number): string {
  const date = new Date(timestampMs);
  const month = date.toLocaleString("en-US", { month: "short" });
  const day = date.getDate();
  const time = date.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${month}, ${day} - ${time}`;
}
