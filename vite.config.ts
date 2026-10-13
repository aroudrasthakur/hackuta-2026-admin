import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteAdminAuthApiPlugin } from "./server/viteAdminAuthApiPlugin.ts";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  process.env.VITE_CONVEX_URL ??= env.VITE_CONVEX_URL;
  process.env.CONVEX_URL ??= env.CONVEX_URL ?? env.VITE_CONVEX_URL;
  process.env.VITE_E2E_MOCK ??= env.VITE_E2E_MOCK;

  const convexUrl =
    process.env.VITE_CONVEX_URL?.trim() ||
    process.env.CONVEX_URL?.trim() ||
    env.VITE_CONVEX_URL?.trim() ||
    env.CONVEX_URL?.trim();
  const devAuthEnabled =
    mode === "development" && env.VITE_DEV_AUTH_BYPASS === "true";
  const devAuthEmail =
    process.env.ADMIN_DEV_AUTH_EMAIL?.trim() ||
    env.ADMIN_DEV_AUTH_EMAIL?.trim();
  const devAuthPassword =
    process.env.ADMIN_DEV_AUTH_PASSWORD ||
    env.ADMIN_DEV_AUTH_PASSWORD;

  return {
    plugins: [
      react(),
      tailwindcss(),
      viteAdminAuthApiPlugin({
        ...(convexUrl ? { convexUrl } : {}),
        devAuth: {
          enabled: devAuthEnabled,
          ...(devAuthEmail ? { email: devAuthEmail } : {}),
          ...(devAuthPassword ? { password: devAuthPassword } : {}),
        },
      }),
    ],
    server: { port: 5373, strictPort: true },
    preview: { port: 4374, strictPort: true },
    build: { target: "es2022" },
  };
});
