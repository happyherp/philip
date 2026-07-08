import { describe, it, expect } from "vitest";
import { SEARCH_SCRIPTURE_TOOL, buildSystemPrompt } from "../../src/philip.ts";

describe("buildSystemPrompt", () => {
  it("keeps single-tool wording when search is disabled", () => {
    const p = buildSystemPrompt("en", false);
    expect(p).toContain("You have one tool: get_passage.");
    expect(p).not.toContain("search_scripture");
    // Placeholder must always be substituted.
    expect(p).not.toContain("SEARCH_TOOLS_INTRO");
  });

  it("describes the two-tool flow when search is enabled", () => {
    const p = buildSystemPrompt("en", true);
    expect(p).toContain("search_scripture");
    expect(p).toContain("get_passage");
    expect(p).not.toContain("SEARCH_TOOLS_INTRO");
  });

  it("defaults to search disabled", () => {
    expect(buildSystemPrompt("en")).toContain("You have one tool: get_passage.");
  });
});

describe("SEARCH_SCRIPTURE_TOOL", () => {
  it("is a function tool named search_scripture with a required query", () => {
    expect(SEARCH_SCRIPTURE_TOOL.function.name).toBe("search_scripture");
    expect(SEARCH_SCRIPTURE_TOOL.function.parameters.required).toContain("query");
  });
});
