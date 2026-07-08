import { describe, it, expect } from "vitest";
import {
  DEFAULT_LUTHER_SEARCH_URL,
  probeSearch,
  resolveSearchUrl,
  searchResultsToText,
  searchScripture,
} from "../../src/search.ts";

/** A one-shot fetch mock that records the URL it was called with. */
function captureFetch(response: unknown): {
  fetchImpl: typeof fetch;
  urls: string[];
} {
  const urls: string[] = [];
  const fetchImpl = (async (url: string) => {
    urls.push(String(url));
    return response;
  }) as unknown as typeof fetch;
  return { fetchImpl, urls };
}

const okJson = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

/** A luther /search response shape. */
const lutherResponse = {
  query: "the Lord is my shepherd",
  translation: "all",
  count: 2,
  results: [
    { reference: "Psalmen 23:1", reference_en: "Psalms 23:1", text: "The Lord is my shepherd...", translation: "web", score: 0.8827 },
    { reference: "Johannes 10:11", reference_en: "John 10:11", text: "I am the good shepherd.", translation: "web", score: 0.8702 },
  ],
};

describe("resolveSearchUrl", () => {
  it("defaults to the hosted Space when unset", () => {
    expect(resolveSearchUrl(undefined)).toBe(DEFAULT_LUTHER_SEARCH_URL);
  });
  it("treats empty / off / none as disabled", () => {
    expect(resolveSearchUrl("")).toBeNull();
    expect(resolveSearchUrl("   ")).toBeNull();
    expect(resolveSearchUrl("off")).toBeNull();
    expect(resolveSearchUrl("NONE")).toBeNull();
  });
  it("uses an explicit URL and strips trailing slashes", () => {
    expect(resolveSearchUrl("https://example.com/")).toBe("https://example.com");
    expect(resolveSearchUrl("https://example.com///")).toBe("https://example.com");
  });
});

describe("searchScripture", () => {
  it("requests /search with query, translation=all, n_results and testament", async () => {
    const { fetchImpl, urls } = captureFetch(okJson(lutherResponse));
    await searchScripture("shepherd", { url: "https://x", fetchImpl, nResults: 5, testament: "OT" });
    const u = new URL(urls[0]);
    expect(u.pathname).toBe("/search");
    expect(u.searchParams.get("query")).toBe("shepherd");
    expect(u.searchParams.get("translation")).toBe("all");
    expect(u.searchParams.get("n_results")).toBe("5");
    expect(u.searchParams.get("testament")).toBe("OT");
  });

  it("maps luther results to references (reference_en), scores and snippets", async () => {
    const { fetchImpl } = captureFetch(okJson(lutherResponse));
    const out = await searchScripture("shepherd", { url: "https://x", fetchImpl });
    expect("results" in out).toBe(true);
    if (!("results" in out)) return;
    expect(out.results.map((r) => r.reference)).toEqual(["Psalms 23:1", "John 10:11"]);
    expect(out.results[0].snippet).toContain("shepherd");
    expect(out.results[0].score).toBeCloseTo(0.8827);
  });

  it("returns an error on a non-ok response", async () => {
    const { fetchImpl } = captureFetch({ ok: false, status: 500, json: async () => ({}) });
    const out = await searchScripture("x", { url: "https://x", fetchImpl });
    expect(out).toHaveProperty("error");
  });

  it("returns an error when fetch throws", async () => {
    const fetchImpl = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const out = await searchScripture("x", { url: "https://x", fetchImpl });
    expect(out).toHaveProperty("error");
  });

  it("returns an error on invalid JSON", async () => {
    const fetchImpl = (async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("bad json");
      },
    })) as unknown as typeof fetch;
    const out = await searchScripture("x", { url: "https://x", fetchImpl });
    expect(out).toHaveProperty("error");
  });
});

describe("probeSearch", () => {
  it("classifies HTTP 200 as ready", async () => {
    const { fetchImpl } = captureFetch(okJson(lutherResponse));
    const out = await probeSearch({ url: "https://x", fetchImpl });
    expect(out.status).toBe("ready");
  });

  it("classifies a gateway status (503) as warming", async () => {
    const { fetchImpl } = captureFetch({ ok: false, status: 503, json: async () => ({}) });
    const out = await probeSearch({ url: "https://x", fetchImpl });
    expect(out.status).toBe("warming");
  });

  it("classifies other error statuses (404) as error", async () => {
    const { fetchImpl } = captureFetch({ ok: false, status: 404, json: async () => ({}) });
    const out = await probeSearch({ url: "https://x", fetchImpl });
    expect(out.status).toBe("error");
  });

  it("classifies a timeout (aborted request) as warming", async () => {
    // A fetch that never resolves until its signal aborts.
    const fetchImpl = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      })) as unknown as typeof fetch;
    const out = await probeSearch({ url: "https://x", fetchImpl, timeoutMs: 20 });
    expect(out.status).toBe("warming");
  });

  it("classifies a connection failure (throw, not aborted) as error", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const out = await probeSearch({ url: "https://x", fetchImpl, timeoutMs: 2000 });
    expect(out.status).toBe("error");
  });
});

describe("searchResultsToText", () => {
  it("labels snippets as non-quotable pointers and lists references", () => {
    const text = searchResultsToText("shepherd", [
      { reference: "Psalms 23:1", score: 0.88, snippet: "The Lord is my shepherd" },
    ]);
    expect(text).toContain("Psalms 23:1");
    expect(text.toLowerCase()).toContain("get_passage");
    expect(text.toLowerCase()).toContain("do not quote");
  });

  it("notes when there are no matches", () => {
    const text = searchResultsToText("zzzz", []);
    expect(text.toLowerCase()).toContain("no match");
  });
});
