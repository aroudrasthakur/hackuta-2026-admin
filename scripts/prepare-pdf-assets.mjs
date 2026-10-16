import { cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pdfjsDirectory = dirname(require.resolve("pdfjs-dist/package.json"));
for (const directory of ["cmaps", "standard_fonts", "wasm"]) {
  const destination = new URL(`../public/pdfjs/${directory}/`, import.meta.url);
  mkdirSync(destination, { recursive: true });
  cpSync(join(pdfjsDirectory, directory), destination, { recursive: true });
}
