import { defineConfig, devices } from "@playwright/test";

const useProductionBuild = process.env.PLAYWRIGHT_USE_BUILD === "true";
const defaultPort = useProductionBuild ? 4374 : 5373;
const port = Number(process.env.PLAYWRIGHT_PORT ?? defaultPort);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: process.env.CI
    ? [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
    : [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    env: {
      VITE_E2E_MOCK: "true",
      VITE_CONVEX_URL: "https://e2e-mock.invalid.convex.cloud",
    },
    command: useProductionBuild
      ? `node ./node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${port}`
      : `npm run dev -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
  },
});
