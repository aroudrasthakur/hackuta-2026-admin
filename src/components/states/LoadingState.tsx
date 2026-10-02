type LoadingStateProps = {
  message?: string;
};

export function LoadingState({ message = "Loading…" }: LoadingStateProps) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-ocean">
      <div
        className="size-8 animate-spin rounded-full border-2 border-sand border-t-ocean"
        aria-hidden
      />
      <p className="text-sm">{message}</p>
    </div>
  );
}
