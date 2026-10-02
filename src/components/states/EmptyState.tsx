type EmptyStateProps = {
  title: string;
  description?: string;
};

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-sand bg-clay/30 px-6 py-12 text-center">
      <h2 className="font-display text-lg text-ink">{title}</h2>
      {description ? (
        <p className="mt-2 text-sm text-mist">{description}</p>
      ) : null}
    </div>
  );
}
