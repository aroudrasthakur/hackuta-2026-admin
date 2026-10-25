import { AdminAccountControls } from "../components/AdminAccountControls";
import { StormPageFrame } from "../components/StormPageFrame";
import { useAdminAuth } from "../hooks/useAdminAuth";

/** Safe landing for volunteer sessions, separate from application review. */
export function VolunteerHomePage() {
  const { staff } = useAdminAuth();
  return (
    <StormPageFrame>
      <main id="admin-content" className="mx-auto max-w-2xl space-y-6 px-6 py-12">
        <AdminAccountControls />
        <h1 className="text-3xl font-semibold">Volunteer access</h1>
        <p>Follow your event lead’s instructions for your assigned duties.</p>
        <dl className="space-y-3">
          <div><dt>Participant check-in</dt><dd>{staff?.canCheckIn === true ? "Enabled" : "Not assigned"}</dd></div>
          <div><dt>Food distribution</dt><dd>{staff?.canFoodCheckIn === true ? "Enabled" : "Not assigned"}</dd></div>
        </dl>
      </main>
    </StormPageFrame>
  );
}
