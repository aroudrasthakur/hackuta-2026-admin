import { useParams } from "react-router-dom";
import { EmptyState } from "../../components/states/EmptyState";

export function ApplicationReviewPage() {
  const { applicationId } = useParams<{ applicationId: string }>();

  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl text-night">Application review</h2>
      <p className="text-sm text-mist">
        Application ID:{" "}
        <code className="rounded bg-clay px-1.5 py-0.5 text-ink">
          {applicationId ?? "—"}
        </code>
      </p>
      <EmptyState
        title="Review workspace"
        description="Detailed applicant data and actions will appear here."
      />
    </section>
  );
}
