import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { hostname } from "node:os";

// We need a fresh import for each test group because getTestAttribution reads
// env vars at call time (not at import time), so we just import once and call
// the function inside each test after setting up the env.
import { getTestAttribution } from "../attribution.ts";

/** Snapshot & restore a set of env vars around a callback. */
function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) saved[key] = process.env[key];

  // Apply
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    fn();
  } finally {
    // Restore
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("getTestAttribution", () => {
  // Save the env vars we'll manipulate so they're always restored, even if a
  // test forgets to (belt-and-suspenders alongside withEnv).
  const KEYS = ["GITHUB_ACTIONS", "GITHUB_HEAD_REF", "GITHUB_REF_NAME", "GROK_AGENT"] as const;
  const originals: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of KEYS) originals[k] = process.env[k];
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (originals[k] === undefined) delete process.env[k];
      else process.env[k] = originals[k];
    }
  });

  it("returns github attribution when GITHUB_ACTIONS is set", () => {
    withEnv(
      { GITHUB_ACTIONS: "true", GITHUB_REF_NAME: "feat/foo", GITHUB_HEAD_REF: undefined, GROK_AGENT: undefined },
      () => {
        const attr = getTestAttribution();
        expect(attr.referer).toBe("https://github.com");
        expect(attr.title).toBe("Philip (github/feat/foo)");
      },
    );
  });

  it("prefers GITHUB_HEAD_REF over GITHUB_REF_NAME (PR context)", () => {
    withEnv(
      { GITHUB_ACTIONS: "true", GITHUB_HEAD_REF: "pr-branch", GITHUB_REF_NAME: "main", GROK_AGENT: undefined },
      () => {
        const attr = getTestAttribution();
        expect(attr.title).toBe("Philip (github/pr-branch)");
      },
    );
  });

  it("returns claude-code attribution when GROK_AGENT is set", () => {
    withEnv(
      { GITHUB_ACTIONS: undefined, GROK_AGENT: "1" },
      () => {
        const attr = getTestAttribution();
        expect(attr.referer).toBe("https://claude-code");
        expect(attr.title).toMatch(/^Philip \(claude-code\/.+\)$/);
      },
    );
  });

  it("falls back to dev-<hostname> when no CI or agent env is set", () => {
    withEnv(
      { GITHUB_ACTIONS: undefined, GROK_AGENT: undefined },
      () => {
        const attr = getTestAttribution();
        const host = hostname();
        expect(attr.referer).toBe("https://dev");
        expect(attr.title).toMatch(new RegExp(`^Philip \\(dev-${host}/.+\\)$`));
      },
    );
  });

  it("always starts title with 'Philip'", () => {
    // Regardless of environment, the app name stays consistent.
    const attr = getTestAttribution();
    expect(attr.title).toMatch(/^Philip /);
  });
});
