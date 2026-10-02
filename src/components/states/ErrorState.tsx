type ErrorStateProps = {
  title?: string;
  message: string;
};

export function ErrorState({
  title = "Unable to continue",
  message,
}: ErrorStateProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-night p-6 text-light">
      <div className="max-w-md rounded-lg border border-ocean/40 bg-ink/40 p-6 shadow-lg">
        <h1 className="font-display text-xl text-clay">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-sand">{message}</p>
      </div>
    </div>
  );
}
