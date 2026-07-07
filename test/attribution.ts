// Builds OpenRouter attribution headers (HTTP-Referer / X-Title) so that
// test requests are identifiable in the OpenRouter dashboard instead of
// showing "unknown".  Detects the runtime environment automatically:
//
//   GitHub Actions  →  "Philip (github/<branch>)"
//   Grok / Claude   →  "Philip (claude-code/<branch>)"
//   Local dev       →  "Philip (dev-<hostname>/<branch>)"

import { execSync } from "node:child_process";
import { hostname } from "node:os";

export interface TestAttribution {
  referer: string;
  title: string;
}

/** Detect the current git branch. Falls back to "unknown" on failure. */
function detectBranch(): string {
  // CI provides branch info via env vars — prefer those since a shallow
  // checkout may have a detached HEAD.
  const ciBranch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME;
  if (ciBranch) return ciBranch;

  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

/**
 * Return `{ referer, title }` suitable for passing straight into `RunChatDeps`,
 * `SummarizeDeps`, or `CondenseDeps` so that test traffic is labelled in the
 * OpenRouter dashboard.
 */
export function getTestAttribution(): TestAttribution {
  const branch = detectBranch();

  if (process.env.GITHUB_ACTIONS) {
    return {
      referer: "https://github.com",
      title: `Philip (github/${branch})`,
    };
  }

  if (process.env.GROK_AGENT) {
    return {
      referer: "https://claude-code",
      title: `Philip (claude-code/${branch})`,
    };
  }

  const host = hostname();
  return {
    referer: "https://dev",
    title: `Philip (dev-${host}/${branch})`,
  };
}
