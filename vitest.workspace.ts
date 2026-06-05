import { defineWorkspace } from "vitest/config";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

/** Mirrors Wrangler's [[rules]] type = "Text" for .md files in Vitest/Vite. */
function mdTextPlugin(): Plugin {
  return {
    name: "md-text",
    transform(_code, id) {
      if (id.endsWith(".md")) {
        const text = readFileSync(id, "utf-8");
        return { code: `export default ${JSON.stringify(text)};`, map: null };
      }
    },
  };
}

// Three projects:
//  - backend:    Node env, pure logic + handler (no network)
//  - frontend:   jsdom env, UI modules (no network)
//  - integration: Node env, real OpenRouter calls (opt-in, excluded from `npm test`)
export default defineWorkspace([
  {
    plugins: [mdTextPlugin()],
    test: {
      name: "backend",
      environment: "node",
      include: ["test/unit/**/*.test.ts"],
    },
  },
  {
    test: {
      name: "frontend",
      environment: "jsdom",
      include: ["test/unit/frontend/**/*.test.js"],
    },
  },
  {
    plugins: [mdTextPlugin()],
    test: {
      name: "integration",
      environment: "node",
      include: ["test/integration/**/*.test.ts"],
    },
  },
]);
