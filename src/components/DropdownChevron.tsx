type DropdownChevronProps = {
  active?: boolean;
  className?: string;
};

export function DropdownChevron({ active = false, className = "right-3" }: DropdownChevronProps) {
  return (
    <div
      className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-night transition-transform duration-200 ${active ? "rotate-180" : ""} ${className}`}
      aria-hidden="true"
    >
      <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
        <path
          d="M4 6l4 4 4-4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
