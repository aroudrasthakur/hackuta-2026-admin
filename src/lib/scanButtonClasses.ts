/** Large touch targets for event-day scanning; full width on phones. */
const scanButtonBase =
  "admin-btn inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-lg font-semibold no-underline shadow-sm disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";

export const scanPrimaryButtonClass = `${scanButtonBase} border border-ocean bg-ocean text-light hover:border-ink hover:bg-ink`;

export const scanSecondaryButtonClass = `${scanButtonBase} border border-ocean/30 bg-white text-night hover:border-ocean/50 hover:bg-clay`;

export const scanConfirmButtonClass = `${scanButtonBase} border border-emerald-800 bg-emerald-700 text-white hover:border-emerald-950 hover:bg-emerald-800`;
