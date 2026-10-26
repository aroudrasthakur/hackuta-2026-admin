/** Shared Tailwind classes for admin and review workflow buttons. */
const adminButtonBase =
  "admin-btn inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2 text-sm font-semibold no-underline transition-[background-color,border-color,color,box-shadow] duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-60";

export const reviewPrimaryButtonClass =
  `${adminButtonBase} border border-ocean bg-ocean text-light hover:border-ink hover:bg-ink`;

export const reviewSecondaryButtonClass =
  `${adminButtonBase} border border-ocean/30 bg-white text-night hover:border-ocean/50 hover:bg-clay`;

export const reviewGhostButtonClass =
  `${adminButtonBase} border-transparent bg-transparent shadow-none text-ocean hover:bg-white/80 hover:text-night`;

export const reviewSuccessButtonClass =
  `${adminButtonBase} border-emerald-800 bg-emerald-700 text-white hover:border-emerald-950 hover:bg-emerald-800`;

export const reviewDangerButtonClass =
  `${adminButtonBase} border-red-300 bg-white text-red-800 hover:border-red-400 hover:bg-red-50`;

export const reviewWaitlistButtonClass =
  `${adminButtonBase} border-amber-300 bg-white text-amber-950 hover:border-amber-400 hover:bg-amber-50`;
