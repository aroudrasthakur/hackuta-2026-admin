import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    // Some auth tests hash several passwords with scrypt, which is slow on CI runners.
    testTimeout: 30_000,
    projects: [
      {
        extends: true,
        test: {
          name: "admin",
          environment: "node",
          include: ["tests/unit/**/*.test.{ts,tsx}", "tests/integration/**/*.test.{ts,tsx}"],
        },
      },
      {
        // Tests copied from hackuta-2026-register for the register-locked files.
        extends: true,
        test: {
          name: "register",
          environment: "happy-dom",
          include: ["tests/register/**/*.test.ts"],
          setupFiles: ["tests/register/setup.ts"],
          env: {
            REGISTRATION_ALLOWED_ORIGINS: "https://hackuta.test",
            EMAIL_SERVICE_URL: "https://emailservice.test",
            EMAIL_SERVICE_API_KEY: "test-email-service-key",
          },
        },
      },
    ],
    coverage: {
      provider: "istanbul",
      include: ["convex/**/*.ts", "src/**/*.{ts,tsx}", "shared/**/*.ts", "server/**/*.ts", "api/**/*.ts"],
      exclude: [
        "convex/_generated/**",
        // Type-only modules and config with no runtime code.
        "convex/auth.config.ts",
        "convex/lib/dataModel.ts",
        "shared/registration/types.ts",
        "src/types/**",
        // Browser entry point; only mounts <App /> (tested) into #root.
        "src/main.tsx",
        "src/vite-env.d.ts",
        // Playwright E2E mock path (covered by tests/e2e, not Vitest).
        "src/e2e/**",
        "src/constants/e2eMock.ts",
        "src/convex/reactBindings.ts",
        "shared/admin/e2e/**",
      ],
      reporter: ["text", "text-summary", "json-summary", "html"],
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 90,
      },
    },
  },
});
