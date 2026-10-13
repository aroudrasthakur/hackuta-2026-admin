import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteAdminAuthApiPlugin } from "./server/viteAdminAuthApiPlugin.ts";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  process.env.VITE_CONVEX_URL ??= env.VITE_CONVEX_URL;
  process.env.CONVEX_URL ??= env.CONVEX_URL ?? env.VITE_CONVEX_URL;
  process.env.VITE_E2E_MOCK ??= env.VITE_E2E_MOCK;

  return {
    plugins: [react(), tailwindcss(), viteAdminAuthApiPlugin()],
    server: { port: 5373, strictPort: true },
    preview: { port: 4374, strictPort: true },
    build: { target: "es2022" },
  };
});
