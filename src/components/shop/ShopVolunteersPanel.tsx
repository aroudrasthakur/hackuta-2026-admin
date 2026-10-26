import { useState } from "react";
import { useMutation, useQuery } from "../../convex/reactBindings";
import { listShopVolunteersRef, setVolunteerShopAccessRef, type ShopVolunteerRow } from "../../convex/adminApi";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { reportUserFacingError } from "../../lib/userFacingError";

/** Which volunteers may scan participants and complete shop purchases. */
export function ShopVolunteersPanel({ onNotice }: { onNotice: (message: string) => void }) {
  const { sessionToken } = useAdminAuth();
  const volunteers = useQuery(listShopVolunteersRef, sessionToken ? { sessionToken } : "skip");
  const setAccess = useMutation(setVolunteerShopAccessRef);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(volunteer: ShopVolunteerRow) {
    if (!sessionToken || pending) return;
    const next = !volunteer.canRedeemShop;
    setPending(volunteer.adminId);
    setError(null);
    try {
      await setAccess({ sessionToken, volunteerAdminId: volunteer.adminId, canRedeemShop: next });
      onNotice(next ? `${volunteer.name} can now sell shop items.` : `${volunteer.name} can no longer sell shop items.`);
    } catch (caught) {
      setError(reportUserFacingError("Unable to change shop access", caught, "We couldn't change shop access. Please try again.", { source: "ShopVolunteersPanel.toggle" }));
    } finally {
      setPending(null);
    }
  }

  return (
    <aside aria-labelledby="shop-volunteers-heading" className="shop-tablet shop-volunteers">
      <div className="shop-tablet__body">
        <div>
          <h2 id="shop-volunteers-heading" className="shop-tablet__title">Shop volunteers</h2>
          <p className="shop-tablet__hint">Only volunteers switched on here can scan participants and complete purchases.</p>
        </div>
        {error ? <p role="alert" className="admin-callout admin-callout--alert">{error}</p> : null}
        {volunteers === undefined ? <p role="status" className="text-sm text-ocean">Loading volunteers…</p> : volunteers.length === 0 ? (
          <p className="text-sm text-muted">No active volunteers yet.</p>
        ) : (
          <ul className="shop-list">
            {volunteers.map((volunteer) => (
              <li key={volunteer.adminId}>
                <span className="min-w-0">
                  <strong className="block text-night">{volunteer.name}</strong>
                  <span className="block truncate text-sm text-muted">{volunteer.email}</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  className="shop-switch"
                  aria-checked={volunteer.canRedeemShop}
                  aria-label={`Shop access for ${volunteer.name}`}
                  disabled={pending === volunteer.adminId}
                  onClick={() => void toggle(volunteer)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
