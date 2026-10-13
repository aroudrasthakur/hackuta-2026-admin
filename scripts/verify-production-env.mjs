const isVercelProduction = process.env.VERCEL_ENV === "production";
const isVercelPreview = process.env.VERCEL_ENV === "preview";
const isNodeProduction = process.env.NODE_ENV === "production";
const isModeProduction = process.env.MODE === "production";
const e2eMockEnabled = process.env.VITE_E2E_MOCK === "true";
const allowE2eMockForCi = process.env.CI === "true" && process.env.GITHUB_ACTIONS === "true";

if (
  e2eMockEnabled &&
  !allowE2eMockForCi &&
  (isVercelProduction || isVercelPreview || isNodeProduction || isModeProduction)
) {
  console.error(
    "Production build blocked: VITE_E2E_MOCK must not be true when building for production or preview deploys.",
  );
  process.exit(1);
}
