import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(root, "..", "hackuta-2026-register", "convex", "_generated");
const targetDir = join(root, "convex", "_generated");

if (!existsSync(sourceDir)) {
  console.warn("[convex:sync] Skipped: register convex/_generated not found at", sourceDir);
  process.exit(0);
}

mkdirSync(targetDir, { recursive: true });
for (const name of readdirSync(sourceDir)) {
  cpSync(join(sourceDir, name), join(targetDir, name), { force: true, recursive: true });
  console.log("[convex:sync] Copied", name);
}
