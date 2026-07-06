// Build-time only: download a pinned ESM build of Preact + htm (the "standalone"
// bundle that packages preact, preact/hooks and htm into one module and binds
// `html`) into the frontend vendor folder, so the app and tests never make a
// runtime CDN call and the site keeps its zero-build deploy.
//
// The bundle exports `html`, `render`, `Component`, the hooks, and friends.
//
// Run: npm run vendor:preact

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HTM_VERSION = "3.1.1";
const URL = `https://cdn.jsdelivr.net/npm/htm@${HTM_VERSION}/preact/standalone.module.js`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "frontend", "vendor");

async function main() {
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`Failed to fetch htm/preact standalone: HTTP ${res.status}`);
  // Drop the sourceMappingURL comment — we don't ship the .map, and its
  // absence otherwise produces noisy warnings in tooling.
  const code = (await res.text()).replace(/\n?\/\/# sourceMappingURL=.*$/m, "\n");
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(join(OUT_DIR, "preact.standalone.js"), code, "utf8");
  console.log(
    `Vendored htm/preact@${HTM_VERSION} (${code.length} bytes) -> ${OUT_DIR}/preact.standalone.js`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
