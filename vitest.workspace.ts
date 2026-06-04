import { defineWorkspace } from "vitest/config";

// Three projects:
//  - backend:    Node env, pure logic + handler (no network)
//  - frontend:   jsdom env, UI modules (no network)
//  - integration: Node env, real OpenRouter calls (opt-in, excluded from `npm test`)
export default defineWorkspace([
  {
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
    test: {
      name: "integration",
      environment: "node",
      include: ["test/integration/**/*.test.ts"],
    },
  },
]);
