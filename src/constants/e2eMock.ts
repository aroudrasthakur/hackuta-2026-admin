/** When true, organizer auth and Convex calls use the in-memory E2E backend (CI/local Playwright only). */
export function isE2eMockEnabled(): boolean {
  return import.meta.env.VITE_E2E_MOCK === "true";
}
