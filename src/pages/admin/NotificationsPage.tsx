import { useId, useState } from "react";
import { AdminPageHeader } from "../../components/AdminPageHeader";
import { AdminStatusBadge, type StatusTone } from "../../components/AdminStatusBadge";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { ShopDialog } from "../../components/shop/ShopDialog";
import { LoadingState } from "../../components/states/LoadingState";
import { QueryErrorState } from "../../components/states/QueryErrorState";
import {
  cancelNotificationRef,
  listNotificationsAdminRef,
  publishNotificationNowRef,
  saveNotificationDraftRef,
  scheduleNotificationRef,
  type AdminNotificationRow,
} from "../../convex/adminApi";
import { useMutation, usePaginatedQuery } from "../../convex/reactBindings";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { formatShopTime, fromDateTimeInput, toDateTimeInput } from "../../lib/shopFormat";
import { reportUserFacingError } from "../../lib/userFacingError";
import {
  NOTIFICATION_LINK_LABEL_MAX_LENGTH,
  NOTIFICATION_LINK_URL_MAX_LENGTH,
  NOTIFICATION_MESSAGE_MAX_LENGTH,
  NOTIFICATION_STATUSES,
  NOTIFICATION_TITLE_MAX_LENGTH,
  NOTIFICATION_TYPES,
  normalizeNotificationLinkLabel,
  normalizeNotificationLinkUrl,
  type NotificationStatus,
  type NotificationType,
} from "../../../shared/admin/notificationRules";

const PAGE_SIZE = 25;
const HOUR_MS = 60 * 60 * 1000;

const NOTIFICATION_TYPE_META: Record<
  NotificationType,
  { label: string; tone: StatusTone }
> = {
  general: { label: "General", tone: "neutral" },
  event: { label: "Event", tone: "info" },
  reminder: { label: "Reminder", tone: "warning" },
  flash_sale: { label: "Flash sale", tone: "positive" },
  important: { label: "Important", tone: "negative" },
};

const NOTIFICATION_STATUS_META: Record<
  NotificationStatus,
  { label: string; tone: StatusTone }
> = {
  draft: { label: "Draft", tone: "neutral" },
  scheduled: { label: "Scheduled", tone: "info" },
  published: { label: "Published", tone: "positive" },
  cancelled: { label: "Cancelled", tone: "negative" },
};

type ComposerDraft = {
  notificationId: AdminNotificationRow["notificationId"] | null;
  status: NotificationStatus | null;
  title: string;
  message: string;
  type: NotificationType;
  linkUrl: string;
  linkLabel: string;
  scheduledAt: string;
  expiresAt: string;
};

function emptyComposerDraft(): ComposerDraft {
  const nextQuarterHour = Math.ceil((Date.now() + 15 * 60 * 1000) / (15 * 60 * 1000)) * 15 * 60 * 1000;
  return {
    notificationId: null,
    status: null,
    title: "",
    message: "",
    type: "general",
    linkUrl: "",
    linkLabel: "",
    scheduledAt: toDateTimeInput(nextQuarterHour),
    expiresAt: "",
  };
}

function composerFromRow(row: AdminNotificationRow): ComposerDraft {
  const defaultSchedule = Math.ceil((Date.now() + HOUR_MS) / (15 * 60 * 1000)) * 15 * 60 * 1000;
  return {
    notificationId: row.notificationId,
    status: row.status,
    title: row.title,
    message: row.message,
    type: row.type,
    linkUrl: row.linkUrl ?? "",
    linkLabel: row.linkLabel ?? "",
    scheduledAt: toDateTimeInput(row.scheduledAt ?? defaultSchedule),
    expiresAt: row.expiresAt ? toDateTimeInput(row.expiresAt) : "",
  };
}

function validateComposer(draft: ComposerDraft, mode: "draft" | "publish" | "schedule") {
  const problems: string[] = [];
  const title = draft.title.trim();
  const message = draft.message.trim();
  if (!title) problems.push("Enter a notification title.");
  else if (title.length > NOTIFICATION_TITLE_MAX_LENGTH) {
    problems.push(`Keep the title under ${NOTIFICATION_TITLE_MAX_LENGTH} characters.`);
  }
  if (!message) problems.push("Enter a notification message.");
  else if (message.length > NOTIFICATION_MESSAGE_MAX_LENGTH) {
    problems.push(`Keep the message under ${NOTIFICATION_MESSAGE_MAX_LENGTH} characters.`);
  }

  let linkUrl: string | undefined;
  try {
    linkUrl = normalizeNotificationLinkUrl(draft.linkUrl);
  } catch {
    problems.push("Enter a valid link URL starting with / (e.g. /dashboard/schedule) or https://.");
  }

  let linkLabel: string | undefined;
  try {
    linkLabel = normalizeNotificationLinkLabel(draft.linkLabel, Boolean(draft.linkUrl.trim()));
  } catch {
    problems.push(
      draft.linkUrl.trim()
        ? `Keep the link label under ${NOTIFICATION_LINK_LABEL_MAX_LENGTH} characters.`
        : "Add a link URL before setting a link label.",
    );
  }

  const now = Date.now();
  const scheduledAt = draft.scheduledAt ? fromDateTimeInput(draft.scheduledAt) : null;
  const expiresAt = draft.expiresAt ? fromDateTimeInput(draft.expiresAt) : null;

  if (draft.expiresAt && expiresAt === null) {
    problems.push("Enter a valid expiration date and time.");
  }

  if (mode === "schedule") {
    if (scheduledAt === null) {
      problems.push("Choose a scheduled date and time.");
    } else if (scheduledAt <= now) {
      problems.push("Choose a future date and time for scheduled delivery.");
    } else if (expiresAt !== null && expiresAt <= scheduledAt) {
      problems.push("The expiration time must be after the scheduled delivery time.");
    }
  } else if (mode === "publish" && expiresAt !== null && expiresAt <= now) {
    problems.push("The expiration time must be in the future.");
  }

  return {
    problems,
    fields: {
      title,
      message,
      type: draft.type,
      linkUrl: linkUrl ?? null,
      linkLabel: linkLabel ?? null,
      expiresAt,
    },
    scheduledAt,
  };
}

function formatNotificationTiming(row: AdminNotificationRow) {
  if (row.status === "published" && row.publishedAt !== null) {
    return formatShopTime(row.publishedAt);
  }
  if (row.status === "scheduled" && row.scheduledAt !== null) {
    return formatShopTime(row.scheduledAt);
  }
  if (row.status === "cancelled" && row.cancelledAt !== null) {
    return `Cancelled ${formatShopTime(row.cancelledAt)}`;
  }
  return "Not scheduled";
}

function NotificationPreviewCard({ draft }: { draft: ComposerDraft }) {
  const typeMeta = NOTIFICATION_TYPE_META[draft.type];
  const title = draft.title.trim() || "Notification title";
  const message =
    draft.message.trim() ||
    "Your notification message will appear here on the participant Notifications tab.";
  const linkUrl = draft.linkUrl.trim();
  const linkLabel = draft.linkLabel.trim() || "Open link";
  const scheduledTime = fromDateTimeInput(draft.scheduledAt);
  const previewTimestamp =
    draft.status === "scheduled" && scheduledTime
      ? formatShopTime(scheduledTime)
      : "Just now";

  return (
    <div
      aria-label="Live participant preview"
      className="rounded-2xl border border-night/15 bg-[#fff8ef] p-4 shadow-xs space-y-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <AdminStatusBadge tone={typeMeta.tone}>{typeMeta.label}</AdminStatusBadge>
          <h3 className="text-base font-semibold text-night">{title}</h3>
        </div>
        <time className="text-xs text-muted">{previewTimestamp}</time>
      </div>
      <p className="text-sm text-night/85 whitespace-pre-line break-words">{message}</p>
      {linkUrl ? (
        <p className="pt-1">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-ocean underline">
            {linkLabel} ({linkUrl})
          </span>
        </p>
      ) : null}
    </div>
  );
}

function NotificationDetailsDialog({
  row,
  onClose,
  onEdit,
  onDuplicateAsDraft,
}: {
  row: AdminNotificationRow;
  onClose: () => void;
  onEdit: (row: AdminNotificationRow) => void;
  onDuplicateAsDraft: (row: AdminNotificationRow) => void;
}) {
  const typeMeta = NOTIFICATION_TYPE_META[row.type];
  const statusMeta = NOTIFICATION_STATUS_META[row.status];
  const canEdit = row.status === "draft" || row.status === "scheduled";

  return (
    <ShopDialog
      title={row.title}
      description={`${typeMeta.label} notification · ${statusMeta.label}`}
      onClose={onClose}
      onSubmit={onClose}
      footer={
        <>
          {canEdit ? (
            <button
              type="button"
              className="shop-pill shop-pill--ink"
              onClick={() => {
                onClose();
                onEdit(row);
              }}
            >
              Edit notification
            </button>
          ) : (
            <button
              type="button"
              className="shop-pill"
              onClick={() => {
                onClose();
                onDuplicateAsDraft(row);
              }}
            >
              Copy to new draft
            </button>
          )}
          <button type="submit" className="shop-pill">
            Close
          </button>
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        <AdminStatusBadge tone={typeMeta.tone}>{typeMeta.label}</AdminStatusBadge>
        <AdminStatusBadge tone={statusMeta.tone}>{statusMeta.label}</AdminStatusBadge>
        {row.expired ? <AdminStatusBadge tone="warning">Expired</AdminStatusBadge> : null}
      </div>
      <p className="text-sm text-night whitespace-pre-line break-words">{row.message}</p>
      <dl className="shop-summary">
        <div>
          <dt>Created by</dt>
          <dd>{row.createdBy.name} · {formatShopTime(row.createdAt)}</dd>
        </div>
        {row.scheduledAt !== null ? (
          <div>
            <dt>Scheduled for</dt>
            <dd>{formatShopTime(row.scheduledAt)}</dd>
          </div>
        ) : null}
        {row.publishedAt !== null ? (
          <div>
            <dt>Published at</dt>
            <dd>{formatShopTime(row.publishedAt)}</dd>
          </div>
        ) : null}
        {row.expiresAt !== null ? (
          <div>
            <dt>Expires at</dt>
            <dd>{formatShopTime(row.expiresAt)}</dd>
          </div>
        ) : null}
        {row.cancelledAt !== null ? (
          <div>
            <dt>Cancelled at</dt>
            <dd>{formatShopTime(row.cancelledAt)}</dd>
          </div>
        ) : null}
        {row.linkUrl ? (
          <div>
            <dt>Link</dt>
            <dd>{row.linkLabel ? `${row.linkLabel} (${row.linkUrl})` : row.linkUrl}</dd>
          </div>
        ) : null}
        {row.relatedFlashSale ? (
          <div>
            <dt>Flash sale</dt>
            <dd>{row.relatedFlashSale.title}</dd>
          </div>
        ) : null}
        {row.relatedEvent ? (
          <div>
            <dt>Related event</dt>
            <dd>{row.relatedEvent.name}</dd>
          </div>
        ) : null}
      </dl>
      {row.status === "published" ? (
        <p className="text-xs text-muted">
          Published notifications are locked so participant history stays accurate. Use Copy to new draft to send a follow-up or correction.
        </p>
      ) : null}
    </ShopDialog>
  );
}

function NotificationsManager({ sessionToken }: { sessionToken: string }) {
  const id = useId();
  const field = (name: string) => `${id}-${name}`;
  const [composer, setComposer] = useState<ComposerDraft>(emptyComposerDraft);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingSendNow, setConfirmingSendNow] = useState(false);
  const [viewing, setViewing] = useState<AdminNotificationRow | null>(null);
  const [cancelling, setCancelling] = useState<AdminNotificationRow | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<NotificationType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<NotificationStatus | "all">("all");

  const activeSearch = committedSearch || searchInput.trim();
  const { results, status, loadMore } = usePaginatedQuery(
    listNotificationsAdminRef,
    {
      sessionToken,
      ...(activeSearch ? { search: activeSearch } : {}),
      ...(typeFilter !== "all" ? { type: typeFilter } : {}),
      ...(statusFilter !== "all" ? { status: statusFilter } : {}),
    },
    { initialNumItems: PAGE_SIZE },
  );

  const saveDraft = useMutation(saveNotificationDraftRef);
  const publishNow = useMutation(publishNotificationNowRef);
  const schedule = useMutation(scheduleNotificationRef);
  const cancelNotification = useMutation(cancelNotificationRef);

  function patchComposer(next: Partial<ComposerDraft>) {
    setComposer((current) => ({ ...current, ...next }));
  }

  function resetComposer() {
    setProblems([]);
    setError(null);
    setConfirmingSendNow(false);
    setComposer(emptyComposerDraft());
  }

  async function handleSaveDraft() {
    if (busy) return;
    const checked = validateComposer(composer, "draft");
    setProblems(checked.problems);
    setError(null);
    setNotice(null);
    if (checked.problems.length > 0) return;
    setBusy(true);
    try {
      await saveDraft({
        sessionToken,
        ...(composer.notificationId ? { notificationId: composer.notificationId } : {}),
        ...checked.fields,
      });
      setNotice(
        composer.notificationId
          ? `Draft “${checked.fields.title}” updated.`
          : `Draft “${checked.fields.title}” saved.`,
      );
      resetComposer();
    } catch (caught) {
      setError(
        reportUserFacingError(
          "Unable to save notification draft",
          caught,
          "We couldn't save this draft. Please try again.",
          { source: "NotificationsPage.saveDraft" },
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  function requestSendNow() {
    if (busy) return;
    const checked = validateComposer(composer, "publish");
    setProblems(checked.problems);
    setError(null);
    setNotice(null);
    if (checked.problems.length > 0) return;
    setConfirmingSendNow(true);
  }

  async function confirmSendNow() {
    if (busy) return;
    const checked = validateComposer(composer, "publish");
    if (checked.problems.length > 0) {
      setProblems(checked.problems);
      setConfirmingSendNow(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await publishNow({
        sessionToken,
        ...(composer.notificationId ? { notificationId: composer.notificationId } : {}),
        ...checked.fields,
      });
      setConfirmingSendNow(false);
      setNotice(`“${checked.fields.title}” was published to participants.`);
      resetComposer();
    } catch (caught) {
      setConfirmingSendNow(false);
      setError(
        reportUserFacingError(
          "Unable to publish notification",
          caught,
          "We couldn't publish this notification. Please try again.",
          { source: "NotificationsPage.publishNow" },
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSchedule() {
    if (busy) return;
    const checked = validateComposer(composer, "schedule");
    setProblems(checked.problems);
    setError(null);
    setNotice(null);
    if (checked.problems.length > 0 || checked.scheduledAt === null) return;
    setBusy(true);
    try {
      await schedule({
        sessionToken,
        ...(composer.notificationId ? { notificationId: composer.notificationId } : {}),
        scheduledAt: checked.scheduledAt,
        ...checked.fields,
      });
      setNotice(
        `“${checked.fields.title}” is scheduled for ${formatShopTime(checked.scheduledAt)}.`,
      );
      resetComposer();
    } catch (caught) {
      setError(
        reportUserFacingError(
          "Unable to schedule notification",
          caught,
          "We couldn't schedule this notification. Please try again.",
          { source: "NotificationsPage.schedule" },
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmCancelNotification() {
    if (!cancelling || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await cancelNotification({
        sessionToken,
        notificationId: cancelling.notificationId,
      });
      if (composer.notificationId === cancelling.notificationId) {
        resetComposer();
      }
      setNotice(`“${cancelling.title}” was cancelled and will not be sent.`);
      setCancelling(null);
    } catch (caught) {
      setError(
        reportUserFacingError(
          "Unable to cancel notification",
          caught,
          "We couldn't cancel this notification. Please try again.",
          { source: "NotificationsPage.cancel" },
        ),
      );
      setCancelling(null);
    } finally {
      setBusy(false);
    }
  }

  function startEditing(row: AdminNotificationRow) {
    setProblems([]);
    setError(null);
    setNotice(null);
    setComposer(composerFromRow(row));
  }

  function duplicateToDraft(row: AdminNotificationRow) {
    setProblems([]);
    setError(null);
    setNotice(null);
    setComposer({
      ...composerFromRow(row),
      notificationId: null,
      status: null,
    });
  }

  return (
    <div className="space-y-6">
      {notice ? (
        <p role="status" className="admin-callout admin-callout--success">
          {notice}
        </p>
      ) : null}

      <div className="shop-layout">
        <form
          noValidate
          aria-labelledby={field("composer-heading")}
          className="shop-tablet shop-tablet--paper"
          onSubmit={(event) => {
            event.preventDefault();
            requestSendNow();
          }}
        >
          <div className="shop-tablet__body">
            <div>
              <h2 id={field("composer-heading")} className="shop-tablet__title">
                {composer.notificationId
                  ? composer.status === "scheduled"
                    ? "Edit scheduled notification"
                    : "Edit notification draft"
                  : "Compose notification"}
              </h2>
              <p className="shop-tablet__hint">
                Broadcast updates, event reminders, and promotions to the participant portal Notifications tab.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="admin-field sm:col-span-2" htmlFor={field("title")}>
                Title
                <input
                  id={field("title")}
                  className="admin-field__control"
                  maxLength={NOTIFICATION_TITLE_MAX_LENGTH}
                  placeholder="For example: Lunch is Ready"
                  value={composer.title}
                  onChange={(event) => patchComposer({ title: event.target.value })}
                />
              </label>

              <label className="admin-field" htmlFor={field("type")}>
                Notification type
                <select
                  id={field("type")}
                  className="admin-field__control"
                  value={composer.type}
                  onChange={(event) =>
                    patchComposer({ type: event.target.value as NotificationType })
                  }
                >
                  {NOTIFICATION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {NOTIFICATION_TYPE_META[type].label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="admin-field" htmlFor={field("scheduledAt")}>
                Schedule for (when scheduling)
                <input
                  id={field("scheduledAt")}
                  type="datetime-local"
                  className="admin-field__control"
                  value={composer.scheduledAt}
                  onChange={(event) => patchComposer({ scheduledAt: event.target.value })}
                />
              </label>

              <label className="admin-field sm:col-span-2" htmlFor={field("message")}>
                Message
                <textarea
                  id={field("message")}
                  className="admin-field__control min-h-24"
                  maxLength={NOTIFICATION_MESSAGE_MAX_LENGTH}
                  placeholder="Write the message participants will see in their Notifications tab."
                  value={composer.message}
                  onChange={(event) => patchComposer({ message: event.target.value })}
                />
              </label>

              <label className="admin-field" htmlFor={field("linkUrl")}>
                Link URL (optional)
                <input
                  id={field("linkUrl")}
                  className="admin-field__control"
                  maxLength={NOTIFICATION_LINK_URL_MAX_LENGTH}
                  placeholder="/dashboard/schedule or https://..."
                  value={composer.linkUrl}
                  onChange={(event) => patchComposer({ linkUrl: event.target.value })}
                />
              </label>

              <label className="admin-field" htmlFor={field("linkLabel")}>
                Link label (optional)
                <input
                  id={field("linkLabel")}
                  className="admin-field__control"
                  maxLength={NOTIFICATION_LINK_LABEL_MAX_LENGTH}
                  placeholder="View schedule"
                  value={composer.linkLabel}
                  onChange={(event) => patchComposer({ linkLabel: event.target.value })}
                />
              </label>

              <label className="admin-field sm:col-span-2" htmlFor={field("expiresAt")}>
                Expires at (optional)
                <input
                  id={field("expiresAt")}
                  type="datetime-local"
                  className="admin-field__control"
                  value={composer.expiresAt}
                  onChange={(event) => patchComposer({ expiresAt: event.target.value })}
                />
              </label>
            </div>

            {problems.length > 0 || error ? (
              <div role="alert" className="admin-callout admin-callout--alert">
                <p className="font-semibold">Check this notification before continuing</p>
                {problems.map((problem) => (
                  <p key={problem}>{problem}</p>
                ))}
                {error ? <p>{error}</p> : null}
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="shop-pill"
                disabled={busy}
                onClick={resetComposer}
              >
                {composer.notificationId ? "Stop editing" : "Clear"}
              </button>
              <button
                type="button"
                className="shop-pill"
                disabled={busy}
                onClick={() => void handleSaveDraft()}
              >
                Save as draft
              </button>
              <button
                type="button"
                className="shop-pill shop-pill--ink"
                disabled={busy}
                onClick={() => void handleSchedule()}
              >
                {composer.notificationId && composer.status === "scheduled"
                  ? "Update schedule"
                  : "Schedule"}
              </button>
              <button
                type="submit"
                className="shop-odyssey shop-odyssey--night"
                disabled={busy}
                aria-busy={busy || undefined}
              >
                Send Now
              </button>
            </div>
          </div>
        </form>

        <section aria-labelledby={field("preview-heading")} className="shop-tablet">
          <div className="shop-tablet__body">
            <div>
              <h2 id={field("preview-heading")} className="shop-tablet__title">
                Participant preview
              </h2>
              <p className="shop-tablet__hint">
                How this card looks in the participant portal Notifications tab once published.
              </p>
            </div>
            <NotificationPreviewCard draft={composer} />
          </div>
        </section>
      </div>

      <section aria-labelledby={field("table-heading")} className="shop-tablet">
        <div className="shop-toolbar">
          <div>
            <h2 id={field("table-heading")} className="shop-tablet__title">
              Notification Management
            </h2>
            <p className="shop-tablet__hint">
              Drafts, scheduled announcements, flash sale alerts, and published notification history.
            </p>
          </div>
          <p className="text-sm text-muted">
            {status === "LoadingFirstPage" ? "Loading…" : `${results.length} notifications shown`}
          </p>
        </div>

        <form
          className="shop-toolbar"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            setCommittedSearch(searchInput.trim());
          }}
        >
          <div className="shop-toolbar__group">
            <label className="admin-field" htmlFor={field("search")}>
              <span className="sr-only">Search notifications</span>
              <input
                id={field("search")}
                type="search"
                className="admin-field__control"
                maxLength={100}
                placeholder="Search by title or message"
                value={searchInput}
                onChange={(event) => {
                  setSearchInput(event.target.value);
                  if (!event.target.value.trim()) setCommittedSearch("");
                }}
              />
            </label>
            <label className="admin-field" htmlFor={field("filter-type")}>
              <span className="sr-only">Filter by type</span>
              <select
                id={field("filter-type")}
                aria-label="Filter by type"
                className="admin-field__control"
                value={typeFilter}
                onChange={(event) =>
                  setTypeFilter(event.target.value as NotificationType | "all")
                }
              >
                <option value="all">All types</option>
                {NOTIFICATION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {NOTIFICATION_TYPE_META[type].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field" htmlFor={field("filter-status")}>
              <span className="sr-only">Filter by status</span>
              <select
                id={field("filter-status")}
                aria-label="Filter by status"
                className="admin-field__control"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as NotificationStatus | "all")
                }
              >
                <option value="all">All statuses</option>
                {NOTIFICATION_STATUSES.map((itemStatus) => (
                  <option key={itemStatus} value={itemStatus}>
                    {NOTIFICATION_STATUS_META[itemStatus].label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="shop-pill">
              Search
            </button>
            {searchInput || committedSearch || typeFilter !== "all" || statusFilter !== "all" ? (
              <button
                type="button"
                className="shop-pill shop-pill--ghost"
                onClick={() => {
                  setSearchInput("");
                  setCommittedSearch("");
                  setTypeFilter("all");
                  setStatusFilter("all");
                }}
              >
                Clear filters
              </button>
            ) : null}
          </div>
        </form>

        {status === "LoadingFirstPage" ? (
          <LoadingState layout="rows" message="Loading notifications…" />
        ) : (
          <div className="shop-table-scroll">
            <table className="admin-table shop-table">
              <caption className="sr-only">Participant notifications</caption>
              <thead>
                <tr>
                  <th scope="col">Notification</th>
                  <th scope="col">Type</th>
                  <th scope="col">Status</th>
                  <th scope="col">Scheduled/Published</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {results.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted">
                      {activeSearch || typeFilter !== "all" || statusFilter !== "all"
                        ? "No notifications match these filters."
                        : "No notifications yet."}
                    </td>
                  </tr>
                ) : (
                  results.map((row) => {
                    const typeMeta = NOTIFICATION_TYPE_META[row.type];
                    const statusMeta = NOTIFICATION_STATUS_META[row.status];
                    const editable = row.status === "draft" || row.status === "scheduled";
                    return (
                      <tr key={row.notificationId}>
                        <th scope="row" className="shop-table__name">
                          <span className="block font-semibold text-night">{row.title}</span>
                          <span className="mt-0.5 block text-xs font-normal text-muted line-clamp-2">
                            {row.message}
                          </span>
                        </th>
                        <td className="whitespace-nowrap">
                          <AdminStatusBadge tone={typeMeta.tone}>{typeMeta.label}</AdminStatusBadge>
                        </td>
                        <td className="whitespace-nowrap">
                          <div className="flex flex-wrap items-center gap-1">
                            <AdminStatusBadge tone={statusMeta.tone}>
                              {statusMeta.label}
                            </AdminStatusBadge>
                            {row.expired ? (
                              <AdminStatusBadge tone="warning">Expired</AdminStatusBadge>
                            ) : null}
                          </div>
                        </td>
                        <td className="whitespace-nowrap tabular-nums">
                          {formatNotificationTiming(row)}
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="shop-pill shop-pill--sm"
                              aria-label={`View ${row.title}`}
                              onClick={() => setViewing(row)}
                            >
                              View
                            </button>
                            {editable ? (
                              <>
                                <button
                                  type="button"
                                  className="shop-pill shop-pill--sm"
                                  aria-label={`Edit ${row.title}`}
                                  onClick={() => startEditing(row)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="shop-pill shop-pill--sm shop-pill--danger"
                                  aria-label={`Cancel ${row.title}`}
                                  onClick={() => setCancelling(row)}
                                >
                                  Cancel
                                </button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {status === "CanLoadMore" || status === "LoadingMore" ? (
          <div className="p-4">
            <button
              type="button"
              className="shop-pill shop-pill--sm"
              disabled={status === "LoadingMore"}
              onClick={() => loadMore(PAGE_SIZE)}
            >
              {status === "LoadingMore" ? "Loading notifications…" : "Load more notifications"}
            </button>
          </div>
        ) : null}
      </section>

      {confirmingSendNow ? (
        <ShopDialog
          title="Send notification now?"
          description="This publishes the notification immediately to all participants."
          onClose={() => setConfirmingSendNow(false)}
          onSubmit={() => void confirmSendNow()}
          footer={
            <>
              <button
                type="button"
                className="shop-pill"
                disabled={busy}
                onClick={() => setConfirmingSendNow(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="shop-odyssey shop-odyssey--night"
                disabled={busy}
                aria-busy={busy || undefined}
              >
                {busy ? "Sending…" : "Confirm & Send Now"}
              </button>
            </>
          }
        >
          <NotificationPreviewCard draft={composer} />
        </ShopDialog>
      ) : null}

      {cancelling ? (
        <ShopDialog
          title={`Cancel “${cancelling.title}”?`}
          description="This notification will be marked cancelled and will not be published to participants."
          onClose={() => setCancelling(null)}
          onSubmit={() => void confirmCancelNotification()}
          footer={
            <>
              <button
                type="button"
                className="shop-pill"
                disabled={busy}
                onClick={() => setCancelling(null)}
              >
                Keep notification
              </button>
              <button
                type="submit"
                className="shop-pill shop-pill--danger"
                disabled={busy}
                aria-busy={busy || undefined}
              >
                {busy ? "Cancelling…" : "Confirm cancel"}
              </button>
            </>
          }
        >
          <p className="text-sm text-night">{cancelling.message}</p>
        </ShopDialog>
      ) : null}

      {viewing ? (
        <NotificationDetailsDialog
          row={viewing}
          onClose={() => setViewing(null)}
          onEdit={startEditing}
          onDuplicateAsDraft={duplicateToDraft}
        />
      ) : null}
    </div>
  );
}

export function NotificationsPage() {
  const { sessionToken, staff } = useAdminAuth();
  const [retry, setRetry] = useState(0);

  return (
    <section aria-labelledby="notifications-heading" className="space-y-6">
      <AdminPageHeader
        id="notifications-heading"
        title="Send notifications"
        description="Compose, preview, schedule, and manage live participant announcements across the event."
      />
      {staff?.role === "admin" && sessionToken ? (
        <ErrorBoundary
          key={`${sessionToken}:${retry}`}
          fallback={
            <QueryErrorState
              title="Unable to load notifications"
              onRetry={() => setRetry((value) => value + 1)}
            />
          }
        >
          <NotificationsManager sessionToken={sessionToken} />
        </ErrorBoundary>
      ) : (
        <LoadingState message="Verifying administrator access…" />
      )}
    </section>
  );
}
