// Build-time only: download a pinned ESM build of `marked` into the frontend
// vendor folder so the app and tests never make a runtime CDN call.
//
// Run: npm run vendor:marked

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const MARKED_VERSION = "14.1.3";
const URL = `https://cdn.jsdelivr.net/npm/marked@${MARKED_VERSION}/lib/marked.esm.js`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "frontend", "vendor");

async function main() {
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`Failed to fetch marked: HTTP ${res.status}`);
  // Drop the sourceMappingURL comment — we don't ship the .map, and its
  // absence otherwise produces noisy warnings in tooling.
  const code = (await res.text()).replace(/\n\/\/# sourceMappingURL=.*$/m, "\n");
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(join(OUT_DIR, "marked.esm.js"), code, "utf8");
  console.log(`Vendored marked@${MARKED_VERSION} (${code.length} bytes) -> ${OUT_DIR}/marked.esm.js`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
