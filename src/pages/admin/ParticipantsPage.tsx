import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { EmptyState } from "../../components/states/EmptyState";
import { usePaginatedQuery, useMutation, useQuery } from "../../convex/reactBindings";
import {
  getParticipantDetailsRef,
  listParticipantsRef,
  promoteParticipantToVolunteerRef,
  restoreVolunteerRef,
  revokeVolunteerRef,
  setParticipantPointsRef,
  type ParticipantRow,
} from "../../convex/adminApi";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { reportUserFacingError } from "../../lib/userFacingError";
import {
  reviewDangerButtonClass,
  reviewPrimaryButtonClass,
  reviewSecondaryButtonClass,
} from "../../lib/reviewButtonClasses";
import { ADJUSTMENT_REASON_MAX_LENGTH } from "../../../shared/admin/volunteerRules";
import { PASSWORD_MIN_LENGTH, PASSWORD_REQUIREMENTS_MESSAGE } from "../../../shared/auth/password";
import { ADMIN_ROUTES } from "../../types/routes";

const PAGE_SIZE = 25;
const controlClass = "admin-field__control";
const participantIdText = (participant: ParticipantRow) => participant.participantId;

function formatTimestamp(timestamp: number | null) {
  if (timestamp === null) return "Not yet";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function StatusBadge({ children, positive }: { children: string; positive: boolean }) {
  return (
    <span className={`inline-flex min-h-7 items-center rounded-full border px-2.5 py-0.5 text-sm font-semibold ${
      positive ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-sand bg-clay/50 text-ocean"
    }`}>
      {children}
    </span>
  );
}

function RosterSkeleton() {
  return (
    <div role="status" aria-label="Loading participants" className="admin-card overflow-hidden">
      <span className="sr-only">Loading participants…</span>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[850px]">
          <thead><tr className="border-b border-sand text-left text-ocean">
            {["Participant", "Points", "Check-in", "Food", "Volunteer", "Actions"].map((heading) => (
              <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>
            ))}
          </tr></thead>
          <tbody>{Array.from({ length: 5 }, (_, index) => (
            <tr key={index} className="border-b border-sand/70 last:border-0">
              {Array.from({ length: 6 }, (_, cell) => (
                <td key={cell} className="px-4 py-4">
                  <span className="block h-5 animate-pulse rounded bg-clay/70" />
                </td>
              ))}
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="space-y-3 p-4 md:hidden">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="space-y-3 rounded-lg border border-sand/70 p-4">
            <span className="block h-5 animate-pulse rounded bg-clay/70" />
            <span className="block h-4 w-2/3 animate-pulse rounded bg-clay/70" />
            <span className="block h-4 w-1/2 animate-pulse rounded bg-clay/70" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ParticipantsRoster({ sessionToken, onOpen }: {
  sessionToken: string;
  onOpen: (participant: ParticipantRow, trigger: HTMLButtonElement) => void;
}) {
  const [search, setSearch] = useState("");
  const [checkInFilter, setCheckInFilter] = useState("all");
  const [foodFilter, setFoodFilter] = useState("all");
  const [volunteerFilter, setVolunteerFilter] = useState("all");
  const checkedIn = checkInFilter === "all" ? undefined : checkInFilter === "checked";
  const foodRedeemed = foodFilter === "all" ? undefined : foodFilter === "redeemed";
  const volunteerStatus = volunteerFilter === "all" ? undefined : volunteerFilter;
  const args = useMemo(() => ({
    sessionToken,
    search: search.trim(),
    ...(checkedIn === undefined ? {} : { checkedIn }),
    ...(foodRedeemed === undefined ? {} : { foodRedeemed }),
    ...(volunteerStatus === undefined ? {} : {
      volunteerStatus: volunteerStatus as "none" | "linked" | "active" | "inactive",
    }),
  }), [checkedIn, foodRedeemed, search, sessionToken, volunteerStatus]);
  const { results, status, loadMore } = usePaginatedQuery(
    listParticipantsRef,
    args,
    { initialNumItems: PAGE_SIZE },
  );
  const isLoading = status === "LoadingFirstPage" || status === "LoadingMore";
  const hasFilters = search.trim() !== "" || checkInFilter !== "all" ||
    foodFilter !== "all" || volunteerFilter !== "all";
  const finished = status === "Exhausted";

  function clearFilters() {
    setSearch("");
    setCheckInFilter("all");
    setFoodFilter("all");
    setVolunteerFilter("all");
  }

  return (
    <section aria-label="Accepted participants" className="space-y-5">
      <div className="admin-card admin-card__body grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_1fr_1fr_1fr_auto]">
        <label className="admin-field sm:col-span-2 xl:col-span-1">
          Search name or email
          <input
            type="search"
            value={search}
            maxLength={100}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search participants"
            className={controlClass}
          />
        </label>
        <label className="admin-field">
          Check-in status
          <select className={controlClass} value={checkInFilter} onChange={(event) => setCheckInFilter(event.target.value)}>
            <option value="all">All check-in statuses</option>
            <option value="checked">Checked in</option>
            <option value="not">Not checked in</option>
          </select>
        </label>
        <label className="admin-field">
          Food redemption
          <select className={controlClass} value={foodFilter} onChange={(event) => setFoodFilter(event.target.value)}>
            <option value="all">All food statuses</option>
            <option value="redeemed">Redeemed</option>
            <option value="not">Not redeemed</option>
          </select>
        </label>
        <label className="admin-field">
          Volunteer status
          <select className={controlClass} value={volunteerFilter} onChange={(event) => setVolunteerFilter(event.target.value)}>
            <option value="all">All volunteer statuses</option>
            <option value="none">Not a volunteer</option>
            <option value="linked">Linked volunteer</option>
            <option value="active">Active volunteer</option>
            <option value="inactive">Inactive volunteer</option>
          </select>
        </label>
        <div className="flex items-end">
          <button type="button" onClick={clearFilters} disabled={!hasFilters} className={`${reviewSecondaryButtonClass} w-full xl:w-auto`}>
            Clear filters
          </button>
        </div>
      </div>

      {isLoading && results.length === 0 ? <RosterSkeleton /> : null}
      {results.length > 0 ? (
        <>
          <p role="status" aria-live="polite" className="text-sm text-ocean">
            Showing {results.length} participant{results.length === 1 ? "" : "s"} from the roster pages loaded.
          </p>
          <div className="admin-card overflow-hidden">
            <ul className="space-y-3 p-3 md:hidden">
              {results.map((participant) => (
                <li key={participantIdText(participant)} className="space-y-3 rounded-xl border border-sand/80 bg-white/70 p-4">
                  <div className="min-w-0">
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      className="text-left font-semibold text-night underline decoration-ocean/50 underline-offset-2"
                      onClick={(event) => onOpen(participant, event.currentTarget)}
                    >
                      {participant.name}
                    </button>
                    <p className="break-all text-sm text-ocean">{participant.email ?? "No email on file"}</p>
                  </div>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div><dt className="font-semibold text-ocean">Points</dt><dd className="text-night">{participant.points}</dd></div>
                    <div><dt className="font-semibold text-ocean">Volunteer</dt><dd>{participant.volunteer ? participant.volunteer.active ? "Active" : "Inactive" : "No"}</dd></div>
                    <div><dt className="font-semibold text-ocean">Check-in</dt><dd>{participant.checkedInAt === null ? "Not checked in" : "Checked in"}</dd></div>
                    <div><dt className="font-semibold text-ocean">Food</dt><dd>{participant.foodCheckedInAt === null ? "Not redeemed" : "Redeemed"}</dd></div>
                  </dl>
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    className={`${reviewSecondaryButtonClass} w-full`}
                    onClick={(event) => onOpen(participant, event.currentTarget)}
                  >
                    View details
                  </button>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[850px] text-left">
              <thead>
                <tr className="border-b border-sand text-ocean">
                  <th scope="col" className="px-4 py-3 font-semibold">Participant</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Points</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Check-in</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Food</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Volunteer</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {results.map((participant) => (
                  <tr key={participantIdText(participant)} className="border-b border-sand/70 last:border-0">
                    <td className="max-w-[18rem] px-4 py-3">
                      <button
                        type="button"
                        aria-haspopup="dialog"
                        className="text-left font-semibold text-night underline decoration-ocean/50 underline-offset-2"
                        onClick={(event) => onOpen(participant, event.currentTarget)}
                      >
                        {participant.name}
                      </button>
                      <p className="break-all text-sm text-ocean">{participant.email ?? "No email on file"}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold">{participant.points}</td>
                    <td className="px-4 py-3">
                      <StatusBadge positive={participant.checkedInAt !== null}>
                        {participant.checkedInAt === null ? "Not checked in" : "Checked in"}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge positive={participant.foodCheckedInAt !== null}>
                        {participant.foodCheckedInAt === null ? "Not redeemed" : "Redeemed"}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge positive={participant.volunteer?.active === true}>
                        {participant.volunteer ? participant.volunteer.active ? "Active" : "Inactive" : "No"}
                      </StatusBadge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <button
                        type="button"
                        aria-haspopup="dialog"
                        className={`${reviewSecondaryButtonClass} px-3`}
                        onClick={(event) => onOpen(participant, event.currentTarget)}
                      >
                        View details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </>
      ) : null}

      {results.length === 0 && finished ? (
        <EmptyState
          title={hasFilters ? (search.trim() ? "No search results" : "No participants match these filters") : "No participants yet"}
          description={hasFilters
            ? "Try another search or clear some filters to see more accepted participants."
            : "Accepted participants will appear here when their participant records are ready."}
        />
      ) : null}

      {results.length === 0 && !finished && !isLoading ? (
        <div className="admin-card admin-card__body space-y-3 text-center">
          <h2 className="admin-card__title">No matches in the roster pages loaded</h2>
          <p className="admin-page-lead">The roster is searched a page at a time. Continue to scan the next page for matching participants.</p>
        </div>
      ) : null}

      {status === "CanLoadMore" || status === "LoadingMore" ? (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={status === "LoadingMore"}
            onClick={() => loadMore(PAGE_SIZE)}
            className={reviewPrimaryButtonClass}
          >
            {status === "LoadingMore" ? "Loading participants…" : "Load more participants"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

type SelectedParticipant = {
  participant: ParticipantRow;
  trigger: HTMLButtonElement;
};

export function ParticipantsPage() {
  const [retryKey, setRetryKey] = useState(0);
  return (
    <ErrorBoundary key={retryKey} fallback={
      <div className="admin-card admin-card__body space-y-3" role="alert">
        <h2 className="admin-card__title">Participants could not be loaded</h2>
        <p className="admin-page-lead">A participant request failed. Check your connection and retry.</p>
        <button type="button" onClick={() => setRetryKey((key) => key + 1)} className={reviewSecondaryButtonClass}>Retry</button>
      </div>
    }>
      <ParticipantsPageContent />
    </ErrorBoundary>
  );
}

function ParticipantsPageContent() {
  const { sessionToken, staff } = useAdminAuth();
  const [selected, setSelected] = useState<SelectedParticipant | null>(null);
  const [editingPoints, setEditingPoints] = useState(false);
  const [newPoints, setNewPoints] = useState("");
  const [reason, setReason] = useState("");
  const [promoting, setPromoting] = useState(false);
  const [staffEmail, setStaffEmail] = useState("");
  const [initialPassword, setInitialPassword] = useState("");
  const [canCheckIn, setCanCheckIn] = useState(false);
  const [canFoodCheckIn, setCanFoodCheckIn] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [busy, setBusy] = useState<"points" | "promote" | "volunteer" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const detailDialog = useRef<HTMLDialogElement>(null);
  const detailTitleId = "participant-detail-title";
  const details = useQuery(
    getParticipantDetailsRef,
    sessionToken && selected
      ? { sessionToken, participantId: selected.participant.participantId }
      : "skip",
  );
  const setPoints = useMutation(setParticipantPointsRef);
  const promote = useMutation(promoteParticipantToVolunteerRef);
  const revoke = useMutation(revokeVolunteerRef);
  const restore = useMutation(restoreVolunteerRef);

  useEffect(() => {
    if (selected && detailDialog.current && !detailDialog.current.open) {
      detailDialog.current.showModal();
    }
  }, [selected]);

  function openDetails(participant: ParticipantRow, trigger: HTMLButtonElement) {
    setEditingPoints(false);
    setPromoting(false);
    setConfirmRevoke(false);
    setError(null);
    setNotice(null);
    setSelected({ participant, trigger });
  }

  function closeDetails() {
    detailDialog.current?.close();
    setSelected(null);
    setEditingPoints(false);
    setPromoting(false);
    setConfirmRevoke(false);
    setError(null);
    setNotice(null);
  }

  function onDialogClose() {
    const trigger = selected?.trigger;
    setSelected(null);
    setEditingPoints(false);
    setPromoting(false);
    setConfirmRevoke(false);
    setError(null);
    setNotice(null);
    trigger?.focus();
  }

  function beginPointsEdit() {
    if (!details) return;
    setNewPoints(String(details.points));
    setReason("");
    setError(null);
    setNotice(null);
    setEditingPoints(true);
  }

  function beginPromotion() {
    if (!details) return;
    setStaffEmail(details.email ?? "");
    setInitialPassword("");
    setCanCheckIn(false);
    setCanFoodCheckIn(false);
    setError(null);
    setNotice(null);
    setPromoting(true);
  }

  async function submitPoints(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionToken || !selected || !details || busy) return;
    const target = Number(newPoints);
    if (!Number.isSafeInteger(target) || target < 0) {
      setError("Enter a nonnegative whole-number balance within the safe integer range.");
      return;
    }
    if (!reason.trim()) {
      setError("Enter a reason for this point adjustment.");
      return;
    }
    if (reason.trim().length > ADJUSTMENT_REASON_MAX_LENGTH) {
      setError(`Keep the reason to ${ADJUSTMENT_REASON_MAX_LENGTH} characters or fewer.`);
      return;
    }
    setBusy("points");
    setError(null);
    setNotice(null);
    try {
      const result = await setPoints({
        sessionToken,
        participantId: details.participantId,
        points: target,
        reason: reason.trim(),
      });
      setEditingPoints(false);
      setNotice(result.changed
        ? `Points updated from ${result.previousPoints} to ${result.newPoints}. The adjustment was added to the audit history.`
        : `Points remain at ${result.newPoints}; no adjustment was needed.`);
    } catch (caught) {
      setError(reportUserFacingError(
        "Unable to update participant points",
        caught,
        "Points were not changed. Check the balance and reason, then try again.",
        { source: "ParticipantsPage.submitPoints" },
      ));
    } finally {
      setBusy(null);
    }
  }

  async function submitPromotion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionToken || !details || busy) return;
    if (
      initialPassword.length < PASSWORD_MIN_LENGTH ||
      !/\d/.test(initialPassword) ||
      !/[a-z]/.test(initialPassword) ||
      !/[A-Z]/.test(initialPassword)
    ) {
      setError(PASSWORD_REQUIREMENTS_MESSAGE);
      return;
    }
    setBusy("promote");
    setError(null);
    setNotice(null);
    try {
      const result = await promote({
        sessionToken,
        participantId: details.participantId,
        email: staffEmail.trim(),
        name: details.name,
        password: initialPassword,
        canCheckIn,
        canFoodCheckIn,
      });
      setInitialPassword("");
      setPromoting(false);
      setNotice(`Volunteer staff account created for ${result.email}.`);
    } catch (caught) {
      setError(reportUserFacingError(
        "Unable to promote participant",
        caught,
        "The volunteer account was not created. Check the staff email and password requirements, then try again.",
        { source: "ParticipantsPage.submitPromotion" },
      ));
    } finally {
      setBusy(null);
    }
  }

  async function updateVolunteer(active: boolean) {
    if (!sessionToken || !details?.volunteer || busy) return;
    setBusy("volunteer");
    setError(null);
    setNotice(null);
    try {
      if (active) {
        await restore({ sessionToken, volunteerAdminId: details.volunteer.adminId });
        setNotice("Volunteer access restored. The volunteer must sign in again.");
      } else {
        await revoke({ sessionToken, volunteerAdminId: details.volunteer.adminId });
        setNotice("Volunteer access revoked and existing sessions invalidated.");
      }
      setConfirmRevoke(false);
    } catch (caught) {
      setError(reportUserFacingError(
        active ? "Unable to restore volunteer access" : "Unable to revoke volunteer access",
        caught,
        "Volunteer access was not changed. Please try again.",
        { source: "ParticipantsPage.updateVolunteer" },
      ));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="participants-heading" className="space-y-5">
      <header className="space-y-2">
        <h1 id="participants-heading" className="admin-page-title">Participants</h1>
        <p className="admin-page-lead">Manage accepted participants, check-in and food status, points, and linked volunteer access.</p>
      </header>
      {staff?.role === "admin" && sessionToken ? (
        <ParticipantsRoster sessionToken={sessionToken} onOpen={openDetails} />
      ) : (
        <div role="status" className="admin-card admin-card__body">Verifying administrator access…</div>
      )}

      <dialog
        ref={detailDialog}
        aria-labelledby={detailTitleId}
        aria-modal="true"
        className="participants-dialog"
        onCancel={(event) => { event.preventDefault(); closeDetails(); }}
        onClose={onDialogClose}
      >
        {selected ? (
          <div className="flex max-h-full min-h-0 flex-col">
            <header className="flex items-start justify-between gap-4 border-b border-sand px-5 py-4">
              <div className="min-w-0">
                <h2 id={detailTitleId} className="admin-card__title">Participant details</h2>
                <p className="mt-1 break-words text-sm text-ocean">
                  {details?.name ?? selected.participant.name}
                </p>
              </div>
              <button type="button" onClick={closeDetails} className={reviewSecondaryButtonClass}>Close</button>
            </header>
            <div className="min-h-0 space-y-5 overflow-y-auto p-5">
              {error ? <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</p> : null}
              {notice ? <p role="status" aria-live="polite" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950">{notice}</p> : null}
              {details === undefined ? (
                <p role="status" className="admin-page-lead">Loading participant details…</p>
              ) : details === null ? (
                <div role="alert" className="space-y-3">
                  <p>This participant is no longer available or is not accepted.</p>
                  <button type="button" onClick={closeDetails} className={reviewSecondaryButtonClass}>Close details</button>
                </div>
              ) : (
                <>
                  <dl className="grid gap-4 sm:grid-cols-2">
                    <div><dt className="text-sm font-semibold text-ocean">Name</dt><dd className="break-words font-semibold text-night">{details.name}</dd></div>
                    <div><dt className="text-sm font-semibold text-ocean">Email</dt><dd className="break-all text-night">{details.email ?? "No email on file"}</dd></div>
                    <div><dt className="text-sm font-semibold text-ocean">Current points</dt><dd className="text-night">{details.points}</dd></div>
                    <div><dt className="text-sm font-semibold text-ocean">General check-in</dt><dd className="text-night">
                      {details.checkedInAt === null ? "Not checked in" : <time dateTime={new Date(details.checkedInAt).toISOString()}>{formatTimestamp(details.checkedInAt)}</time>}
                    </dd></div>
                    <div><dt className="text-sm font-semibold text-ocean">Food redemption</dt><dd className="text-night">
                      {details.foodCheckedInAt === null ? "Not redeemed" : <time dateTime={new Date(details.foodCheckedInAt).toISOString()}>{formatTimestamp(details.foodCheckedInAt)}</time>}
                    </dd></div>
                  </dl>

                  {details.pointsConsistent ? null : (
                    <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                      The stored balance does not match the point ledger. Contact the tech team before making a correction.
                    </p>
                  )}

                  {details.volunteer ? (
                    <section aria-label="Linked volunteer account" className="rounded-xl border border-sand bg-white/70 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-night">Linked volunteer account</h3>
                          <p className="break-all text-sm text-ocean">{details.volunteer.name} · {details.volunteer.email}</p>
                          <p className="mt-2"><StatusBadge positive={details.volunteer.active}>{details.volunteer.active ? "Active" : "Inactive"}</StatusBadge></p>
                        </div>
                        <Link className={`${reviewSecondaryButtonClass} no-underline`} to={ADMIN_ROUTES.volunteers} onClick={closeDetails}>
                          Volunteer management
                        </Link>
                      </div>
                      <p className="mt-3 text-sm text-ocean">Capabilities: {[
                        details.volunteer.canCheckIn ? "Check-in" : null,
                        details.volunteer.canFoodCheckIn ? "Food redemption" : null,
                      ].filter(Boolean).join(", ") || "None assigned"}</p>
                      {!confirmRevoke ? (
                        details.volunteer.active ? (
                          <button type="button" disabled={busy !== null} className={`${reviewDangerButtonClass} mt-4`} onClick={() => setConfirmRevoke(true)}>
                            Revoke volunteer access
                          </button>
                        ) : (
                          <button type="button" disabled={busy !== null} className={`${reviewSecondaryButtonClass} mt-4`} onClick={() => void updateVolunteer(true)}>
                            {busy === "volunteer" ? "Restoring…" : "Restore volunteer access"}
                          </button>
                        )
                      ) : (
                        <div className="mt-4 space-y-3 rounded-lg border border-red-300 bg-red-50 p-3">
                          <p className="text-sm text-red-950">Revoke this account? Its active sessions will be invalidated. Existing capabilities and audit history will be retained.</p>
                          <div className="flex flex-wrap gap-2">
                            <button type="button" disabled={busy !== null} className={reviewDangerButtonClass} onClick={() => void updateVolunteer(false)}>
                              {busy === "volunteer" ? "Revoking…" : "Confirm revoke"}
                            </button>
                            <button type="button" disabled={busy !== null} className={reviewSecondaryButtonClass} onClick={() => setConfirmRevoke(false)}>Cancel</button>
                          </div>
                        </div>
                      )}
                    </section>
                  ) : (
                    <section className="rounded-xl border border-sand bg-white/70 p-4">
                      <h3 className="font-semibold text-night">Volunteer status</h3>
                      <p className="mt-1 text-sm text-ocean">No linked volunteer staff account.</p>
                    </section>
                  )}

                  {editingPoints ? (
                    <form className="space-y-4 rounded-xl border border-sand bg-white/70 p-4" onSubmit={(event) => void submitPoints(event)}>
                      <h3 className="font-semibold text-night">Edit points</h3>
                      <p className="text-sm text-ocean">Current balance: <strong>{details.points}</strong></p>
                      <label className="admin-field">
                        New target balance
                        <input
                          type="number"
                          min="0"
                          max={Number.MAX_SAFE_INTEGER}
                          step="1"
                          required
                          value={newPoints}
                          onChange={(event) => setNewPoints(event.target.value)}
                          className={controlClass}
                        />
                      </label>
                      <p className="text-sm text-ocean">Difference: {
                        newPoints !== "" && Number.isSafeInteger(Number(newPoints)) && Number(newPoints) >= 0
                          ? `${Number(newPoints) - details.points >= 0 ? "+" : ""}${Number(newPoints) - details.points}`
                          : "Enter a valid nonnegative whole number"
                      }</p>
                      <label className="admin-field">
                        Adjustment reason
                        <textarea
                          required
                          maxLength={ADJUSTMENT_REASON_MAX_LENGTH}
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                          className={`${controlClass} min-h-24 resize-y`}
                        />
                      </label>
                      <p className="text-right text-xs text-ocean">{reason.length}/{ADJUSTMENT_REASON_MAX_LENGTH}</p>
                      <div className="flex flex-wrap gap-2">
                        <button type="submit" disabled={busy !== null} className={reviewPrimaryButtonClass}>
                          {busy === "points" ? "Saving…" : "Confirm points adjustment"}
                        </button>
                        <button type="button" disabled={busy !== null} className={reviewSecondaryButtonClass} onClick={() => setEditingPoints(false)}>Cancel</button>
                      </div>
                    </form>
                  ) : (
                    <button type="button" disabled={busy !== null || !details.pointsConsistent} className={reviewSecondaryButtonClass} onClick={beginPointsEdit}>
                      Edit Points
                    </button>
                  )}

                  {promoting ? (
                    <form className="space-y-4 rounded-xl border border-sand bg-white/70 p-4" onSubmit={(event) => void submitPromotion(event)}>
                      <h3 className="font-semibold text-night">Promote to Volunteer</h3>
                      <p className="text-sm text-ocean">
                        Create a separate staff account for <strong>{details.name}</strong>. This password is for staff sign-in and is separate from participant login credentials.
                      </p>
                      <label className="admin-field">
                        Staff account email
                        <input type="email" required value={staffEmail} onChange={(event) => setStaffEmail(event.target.value)} className={controlClass} autoComplete="off" />
                      </label>
                      <label className="admin-field">
                        Initial password
                        <input
                          type="password"
                          required
                          minLength={PASSWORD_MIN_LENGTH}
                          value={initialPassword}
                          onChange={(event) => setInitialPassword(event.target.value)}
                          className={controlClass}
                          autoComplete="new-password"
                          aria-describedby="participant-password-help"
                        />
                      </label>
                      <p id="participant-password-help" className="text-sm text-ocean">{PASSWORD_REQUIREMENTS_MESSAGE}</p>
                      <fieldset className="space-y-2">
                        <legend className="text-sm font-semibold text-night">Staff capabilities</legend>
                        <label className="flex min-h-11 items-center gap-2 text-sm text-night">
                          <input type="checkbox" checked={canCheckIn} onChange={(event) => setCanCheckIn(event.target.checked)} />
                          Can check participants in
                        </label>
                        <label className="flex min-h-11 items-center gap-2 text-sm text-night">
                          <input type="checkbox" checked={canFoodCheckIn} onChange={(event) => setCanFoodCheckIn(event.target.checked)} />
                          Can redeem participant food
                        </label>
                      </fieldset>
                      <div className="flex flex-wrap gap-2">
                        <button type="submit" disabled={busy !== null} className={reviewPrimaryButtonClass}>
                          {busy === "promote" ? "Creating account…" : "Confirm promotion"}
                        </button>
                        <button type="button" disabled={busy !== null} className={reviewSecondaryButtonClass} onClick={() => setPromoting(false)}>Cancel</button>
                      </div>
                    </form>
                  ) : !details.volunteer ? (
                    <button type="button" disabled={busy !== null} className={reviewPrimaryButtonClass} onClick={beginPromotion}>
                      Promote to Volunteer
                    </button>
                  ) : null}

                  {details.awards.length > 0 ? (
                    <section aria-label="Event point awards" className="space-y-2">
                      <h3 className="font-semibold text-night">Event point awards</h3>
                      <ul className="divide-y divide-sand/70 rounded-lg border border-sand bg-white/70 px-3">
                        {details.awards.map((award) => (
                          <li key={`${award.eventId}-${award.awardedAt}`} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                            <span>{award.eventName} · +{award.pointsAwarded}</span>
                            <time dateTime={new Date(award.awardedAt).toISOString()} className="text-ocean">{formatTimestamp(award.awardedAt)}</time>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                </>
              )}
            </div>
          </div>
        ) : null}
      </dialog>
    </section>
  );
}
