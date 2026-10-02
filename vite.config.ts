import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5373, strictPort: true },
  preview: { port: 4374, strictPort: true },
  build: { target: "es2022" },
});
