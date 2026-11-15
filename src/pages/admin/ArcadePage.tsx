import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "../../convex/reactBindings";
import {
  getArcadeAdminRef,
  updateArcadeGameRef,
  updateArcadeSettingsRef,
  type ArcadeAdminSnapshot,
} from "../../convex/arcadeApi";
import { AccessSwitch } from "../../components/admin/AccessSwitch";
import { AdminPageHeader } from "../../components/AdminPageHeader";
import { AdminStatusBadge, type StatusTone } from "../../components/AdminStatusBadge";
import { LoadingState } from "../../components/states/LoadingState";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { useNow } from "../../hooks/useNow";
import { reviewPrimaryButtonClass, reviewSecondaryButtonClass } from "../../lib/reviewButtonClasses";
import { formatLogTime, fromDateTimeInputValue, toDateTimeInputValue } from "../../lib/staffLogFormat";
import { userFacingErrorMessage } from "../../lib/userFacingError";
import {
  ARCADE_SETTINGS_ERROR_MESSAGES,
  ARCADE_MODES,
  checkArcadeSettings,
  type ArcadeMode,
  type ArcadeStatus,
} from "../../../shared/arcade/rules";

type SettingsDraft = {
  mode: ArcadeMode;
  opensAt: string;
  closesAt: string;
  launchEnabled: boolean;
  backupSignIn: boolean;
};

function draftFromSnapshot(snapshot: ArcadeAdminSnapshot): SettingsDraft {
  return {
    mode: snapshot.settings.mode,
    opensAt: snapshot.settings.opensAt != null ? toDateTimeInputValue(snapshot.settings.opensAt) : "",
    closesAt: snapshot.settings.closesAt != null ? toDateTimeInputValue(snapshot.settings.closesAt) : "",
    launchEnabled: snapshot.settings.launchEnabled,
    backupSignIn: snapshot.settings.backupSignIn,
  };
}

const STATUS_TONE: Record<ArcadeStatus, StatusTone> = {
  on: "positive",
  scheduled: "info",
  off: "warning",
};

const STATUS_LABEL: Record<ArcadeStatus, string> = {
  on: "Open",
  scheduled: "Scheduled",
  off: "Closed",
};

function ArcadeControls({ sessionToken }: { sessionToken: string }) {
  const now = useNow();
  const snapshot = useQuery(getArcadeAdminRef, { sessionToken });
  const saveSettings = useMutation(updateArcadeSettingsRef);
  const saveGame = useMutation(updateArcadeGameRef);
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [gameBusy, setGameBusy] = useState<string | null>(null);

  useEffect(() => {
    if (snapshot && draft === null) setDraft(draftFromSnapshot(snapshot));
  }, [draft, snapshot]);

  if (snapshot === undefined) return <LoadingState message="Loading arcade controls…" />;

  const live = snapshot.state;
  const synced = draft ?? draftFromSnapshot(snapshot);

  async function submitSettings(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    const opensAt = synced.mode === "scheduled" ? fromDateTimeInputValue(synced.opensAt) : null;
    const closesAt =
      synced.mode === "scheduled" || synced.mode === "on"
        ? fromDateTimeInputValue(synced.closesAt)
        : null;
    if (synced.mode === "scheduled" && (opensAt === null || closesAt === null)) {
      setError("Enter an open and close time for a scheduled window.");
      setSaving(false);
      return;
    }
    const checked = checkArcadeSettings(
      {
        mode: synced.mode,
        ...(synced.mode === "scheduled" ? { opensAt, closesAt } : {}),
        ...(synced.mode === "on" && closesAt !== null ? { closesAt } : {}),
      },
      now,
    );
    if (!checked.ok) {
      setError(ARCADE_SETTINGS_ERROR_MESSAGES[checked.code]);
      setSaving(false);
      return;
    }
    try {
      await saveSettings({
        sessionToken,
        mode: synced.mode,
        launchEnabled: synced.launchEnabled,
        backupSignIn: synced.backupSignIn,
        ...(synced.mode === "scheduled" ? { opensAt, closesAt } : {}),
        ...(synced.mode === "on" ? { opensAt: null, closesAt } : {}),
        ...(synced.mode === "off" ? { opensAt: null, closesAt: null } : {}),
      });
      setNotice("Arcade schedule saved. Players see the new gates on their next refresh.");
      setDraft(null);
    } catch (caught) {
      setError(userFacingErrorMessage(caught, "We could not save the arcade schedule."));
    } finally {
      setSaving(false);
    }
  }

  async function toggleGame(key: string, enabled: boolean) {
    setGameBusy(key);
    setError("");
    try {
      await saveGame({ sessionToken, key, enabled });
      setNotice(`${key} ${enabled ? "enabled" : "paused"}.`);
    } catch (caught) {
      setError(userFacingErrorMessage(caught, "We could not update that game."));
    } finally {
      setGameBusy(null);
    }
  }

  return (
  <>
    <AdminPageHeader
      id="arcade-heading"
      title="Arcade"
      description="Time-gate the HackUTA points arcade and switch individual games. The server clock decides what hackers see right now."
    />

    {notice ? (
      <p role="status" className="admin-callout">
        {notice}
      </p>
    ) : null}
    {error ? (
      <p role="alert" className="admin-callout admin-callout--error">
        {error}
      </p>
    ) : null}

    <div className="admin-card grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Live status</h2>
        <AdminStatusBadge tone={STATUS_TONE[live.status]}>{STATUS_LABEL[live.status]}</AdminStatusBadge>
      </div>
      <ul className="grid gap-1 text-sm">
        <li>
          Stored switch: <strong>{snapshot.settings.mode}</strong>
          {snapshot.settings.updatedAt ? (
            <span className="text-muted"> · last changed {formatLogTime(snapshot.settings.updatedAt)}</span>
          ) : null}
        </li>
        {live.opensAt ? (
          <li>
            Opens: <time dateTime={new Date(live.opensAt).toISOString()}>{formatLogTime(live.opensAt)}</time>
          </li>
        ) : null}
        {live.closesAt ? (
          <li>
            Closes: <time dateTime={new Date(live.closesAt).toISOString()}>{formatLogTime(live.closesAt)}</time>
          </li>
        ) : null}
        <li className="text-muted">Server now: {formatLogTime(snapshot.serverNow)}</li>
      </ul>
    </div>

    <form className="admin-card grid gap-4" onSubmit={(event) => void submitSettings(event)} aria-labelledby="arcade-settings-title">
      <h2 id="arcade-settings-title" className="text-lg font-semibold">
        Gates &amp; schedule
      </h2>
      <p className="text-muted text-sm">
        <strong>Off</strong> seals the arcade (withdrawals still work). <strong>On</strong> opens now, with an optional auto-close time.
        <strong> Scheduled</strong> opens and closes automatically between two times (your browser timezone).
      </p>

      <fieldset>
        <legend className="sr-only">Arcade mode</legend>
        <div className="flex flex-wrap gap-4">
          {ARCADE_MODES.map((mode) => (
            <label key={mode} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="arcade-mode"
                checked={synced.mode === mode}
                onChange={() => setDraft({ ...synced, mode })}
              />
              <span>{mode === "off" ? "Off" : mode === "on" ? "On now" : "Scheduled window"}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {synced.mode === "scheduled" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="admin-field">
            Opens at
            <input
              type="datetime-local"
              className="admin-field__control"
              value={synced.opensAt}
              required
              onChange={(event) => setDraft({ ...synced, opensAt: event.target.value })}
            />
          </label>
          <label className="admin-field">
            Closes at
            <input
              type="datetime-local"
              className="admin-field__control"
              value={synced.closesAt}
              required
              onChange={(event) => setDraft({ ...synced, closesAt: event.target.value })}
            />
          </label>
        </div>
      ) : null}

      {synced.mode === "on" ? (
        <label className="admin-field sm:max-w-md">
          Auto-close at (optional)
          <input
            type="datetime-local"
            className="admin-field__control"
            value={synced.closesAt}
            onChange={(event) => setDraft({ ...synced, closesAt: event.target.value })}
          />
          <span className="text-sm text-muted">Leave blank to stay open until you switch off manually.</span>
        </label>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold">Profile launch button</p>
            <p className="text-sm text-muted">Lets checked-in hackers open the arcade from the participant portal.</p>
          </div>
          <AccessSwitch
            label="Profile launch button"
            checked={synced.launchEnabled}
            onChange={(launchEnabled) => setDraft({ ...synced, launchEnabled })}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold">Backup sign-in on arcade site</p>
            <p className="text-sm text-muted">Email + password form when launch codes are off.</p>
          </div>
          <AccessSwitch
            label="Arcade backup sign-in"
            checked={synced.backupSignIn}
            onChange={(backupSignIn) => setDraft({ ...synced, backupSignIn })}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="submit" className={reviewPrimaryButtonClass} disabled={saving}>
          {saving ? "Saving…" : "Save schedule"}
        </button>
        <button
          type="button"
          className={reviewSecondaryButtonClass}
          disabled={saving}
          onClick={() => setDraft(draftFromSnapshot(snapshot))}
        >
          Reset
        </button>
      </div>
    </form>

    <section className="admin-card grid gap-4" aria-labelledby="arcade-games-title">
      <h2 id="arcade-games-title" className="text-lg font-semibold">
        Games
      </h2>
      <p className="text-muted text-sm">Paused games stay visible in the lobby but refuse new wagers.</p>
      <div className="admin-table-scroll" role="region" aria-label="Arcade games" tabIndex={0}>
        <table className="admin-table">
          <caption className="sr-only">Arcade game switches</caption>
          <thead>
            <tr>
              <th scope="col">Game</th>
              <th scope="col">Status</th>
              <th scope="col">Switch</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.games.map((game) => (
              <tr key={game.key}>
                <th scope="row">{game.name}</th>
                <td>
                  <AdminStatusBadge tone={game.enabled ? "positive" : "warning"}>
                    {game.enabled ? "On" : "Paused"}
                  </AdminStatusBadge>
                </td>
                <td>
                  <AccessSwitch
                    label={`${game.name} enabled`}
                    checked={game.enabled}
                    disabled={gameBusy === game.key}
                    onChange={(enabled) => void toggleGame(game.key, enabled)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  </>
  );
}

export function ArcadePage() {
  const { sessionToken, staff } = useAdminAuth();
  if (staff?.role !== "admin" || !sessionToken) {
    return <LoadingState message="Checking access…" />;
  }
  return <ArcadeControls sessionToken={sessionToken} />;
}
