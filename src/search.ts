// Semantic verse search via an external luther-mcp `GET /search` endpoint.
//
// Transport-agnostic and dependency-injected (the fetch impl is passed in),
// exactly like src/openrouter.ts, so the whole module is unit-testable with no
// network. Search is used ONLY to find candidate *references*; the exact verse
// text is always grounded separately via get_passage against Philip's own
// bundled JSON. luther's snippet text (NHEB/KJV/Luther) is never shown to the
// reader — it is a relevance hint for the model.

/** Hosted HuggingFace Space; the default when LUTHER_SEARCH_URL is unset. */
export const DEFAULT_LUTHER_SEARCH_URL = "https://aifreund-luther-bible.hf.space";

export type SearchStatus = "ready" | "warming" | "error";

export interface SearchHit {
  /** luther's `reference_en`, e.g. "Psalms 23:1" — parseable by get_passage. */
  reference: string;
  score: number;
  /** luther's verse text: a relevance hint only, never quoted to the reader. */
  snippet: string;
}

export interface SearchResults {
  results: SearchHit[];
}
export interface SearchError {
  error: string;
}

export interface SearchDeps {
  /** Base URL of the luther-mcp service (no trailing slash needed). */
  url: string;
  /** Injected so tests can replay canned responses; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  testament?: "OT" | "NT";
  /** How many candidate references to request (default 8). */
  nResults?: number;
  /** Abort the request after this many ms (default 8000). */
  timeoutMs?: number;
}

/**
 * Resolve the effective search URL from the raw env value.
 * - unset (undefined) → the hosted Space (feature on by default)
 * - "", "off", "none" → null (feature disabled)
 * - anything else → that URL, with trailing slashes stripped
 */
export function resolveSearchUrl(raw: string | undefined): string | null {
  if (raw === undefined) return DEFAULT_LUTHER_SEARCH_URL;
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  if (trimmed === "" || lower === "off" || lower === "none") return null;
  return trimmed.replace(/\/+$/, "");
}

/** Semantic search for candidate passage references by meaning. */
export async function searchScripture(
  query: string,
  deps: SearchDeps,
): Promise<SearchResults | SearchError> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const base = deps.url.replace(/\/+$/, "");
  const params = new URLSearchParams({
    query,
    // Always search every translation and dedupe — we only use the references,
    // so cross-lingual recall matters more than which text matched.
    translation: "all",
    n_results: String(deps.nResults ?? 8),
  });
  if (deps.testament) params.set("testament", deps.testament);
  const url = `${base}/search?${params.toString()}`;

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), deps.timeoutMs ?? 8000);
  let res: Response;
  try {
    res = await fetchImpl(url, { method: "GET", signal: abort.signal });
  } catch (e) {
    return {
      error: abort.signal.aborted
        ? "Search request timed out."
        : `Search request failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) return { error: `Search failed: HTTP ${res.status}.` };

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { error: "Search returned invalid JSON." };
  }

  const raw = Array.isArray((data as { results?: unknown })?.results)
    ? ((data as { results: unknown[] }).results as Array<Record<string, unknown>>)
    : [];
  const results: SearchHit[] = [];
  for (const r of raw) {
    const reference =
      typeof r?.reference_en === "string"
        ? r.reference_en
        : typeof r?.reference === "string"
          ? r.reference
          : null;
    if (!reference) continue;
    results.push({
      reference,
      score: typeof r?.score === "number" ? r.score : 0,
      snippet: typeof r?.text === "string" ? r.text : "",
    });
  }
  return { results };
}

export interface ProbeResult {
  status: SearchStatus;
  detail: string;
  latencyMs: number;
}

/**
 * Probe the search service to decide whether it is warm enough to enable the
 * tool. Runs one tiny real search; a hit also *warms* a sleeping Space.
 *   - 200 within the timeout → ready
 *   - gateway status (502/503/504) or a timed-out (aborted) request → warming
 *   - any other non-ok status, or a hard connection failure → error
 */
export async function probeSearch(deps: {
  url: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<ProbeResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const base = deps.url.replace(/\/+$/, "");
  const url = `${base}/search?query=peace&translation=all&n_results=1`;
  const timeoutMs = deps.timeoutMs ?? 2500;
  const started = Date.now();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { method: "GET", signal: abort.signal });
    const latencyMs = Date.now() - started;
    if (res.ok) return { status: "ready", detail: `Semantic search ready (${latencyMs} ms).`, latencyMs };
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      return { status: "warming", detail: `Service is waking up (HTTP ${res.status}).`, latencyMs };
    }
    return { status: "error", detail: `Search service error (HTTP ${res.status}).`, latencyMs };
  } catch (e) {
    const latencyMs = Date.now() - started;
    if (abort.signal.aborted) {
      return {
        status: "warming",
        detail: `No response within ${timeoutMs} ms — service is waking up.`,
        latencyMs,
      };
    }
    return {
      status: "error",
      detail: `Cannot reach search service: ${e instanceof Error ? e.message : String(e)}`,
      latencyMs,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Render search hits as the tool-result text handed back to the model. The text
 * makes explicit that snippets are pointers only — the model must call
 * get_passage on a chosen reference before quoting anything.
 */
export function searchResultsToText(query: string, results: SearchHit[]): string {
  if (results.length === 0) {
    return JSON.stringify({
      query,
      results: [],
      note: "No matches found. Try a different query, or fall back to get_passage if you already know a reference.",
    });
  }
  return JSON.stringify(
    {
      query,
      note: "Candidate references ranked by relevance. These snippets are search hints ONLY — do NOT quote them and do NOT treat them as exact text. Call get_passage on a reference to read and quote the verified text.",
      results: results.map((r) => ({
        reference: r.reference,
        score: Number(r.score.toFixed(3)),
        snippet: r.snippet,
      })),
    },
    null,
    2,
  );
}
