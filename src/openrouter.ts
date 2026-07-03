// OpenRouter chat with an agentic get_passage tool loop.
// Everything external (the HTTP fetch and the asset/passage lookup) is injected,
// so the whole loop is unit-testable with canned SSE streams and no network.

import {
  type AssetFetch,
  type PassageRequest,
  formatReference,
  getPassage,
  parseReference,
  passageToText,
} from "./bible.ts";
import { GET_PASSAGE_TOOL, SYSTEM_PROMPT } from "./philip.ts";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const CACHE_BREAKPOINT = { type: "ephemeral" as const };

/**
 * Apply a cache_control breakpoint to the last user/tool message so
 * the entire conversation prefix up to that point is cached.
 */
function withCacheBreakpoints(msgs: ChatMessage[]): ChatMessage[] {
  const out = msgs.map((m) => ({ ...m }));
  // Find the last user or tool message and add a cache breakpoint.
  for (let i = out.length - 1; i >= 0; i--) {
    const m = out[i];
    if (m.role === "user" || m.role === "tool") {
      if (typeof m.content === "string" && m.content.length > 0) {
        out[i] = {
          ...m,
          content: [{ type: "text", text: m.content, cache_control: CACHE_BREAKPOINT }],
        };
      }
      break;
    }
  }
  return out;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/** A content block with optional cache_control for prompt caching. */
export interface ContentBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentBlock[] | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

/** Token-usage stats returned from OpenRouter (final SSE chunk). */
export interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
}

export interface RunChatDeps {
  apiKey: string;
  model: string;
  /** Injected so tests can replay canned responses; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Reads bundled bible JSON; injected for the same reason. */
  assetFetch: AssetFetch;
  /** Called with each streamed text token of the final answer. */
  onToken: (text: string) => void | Promise<void>;
  /** Safety cap on tool-call rounds. */
  maxIterations?: number;
  /** Optional OpenRouter attribution headers. */
  referer?: string;
  title?: string;
  /** Override the system prompt (for language-specific variants). */
  systemPrompt?: string;
  /** Default translation id when the model doesn't specify one (e.g. "web", "rv1909", "luther1545"). */
  translationId?: string;
  /** Called each time the model uses a translation (via get_passage), so the caller can update UI language. */
  onTranslationUsed?: (translationId: string) => void | Promise<void>;
  /**
   * Called when the model requests a passage, *before* it is fetched, so the UI
   * can show progress (e.g. "Reading John 3 in WEB") instead of an empty wait.
   */
  onPassageRequest?: (info: { reference: string; translationId: string }) => void | Promise<void>;
}

export interface RunChatResult {
  text: string;
  usage: ChatUsage;
}

/**
 * Run a full conversation turn: stream tokens to `onToken`, transparently
 * resolving any get_passage tool calls against the bundled bible. Returns the
 * final assistant text and token-usage stats (including cache metrics).
 */
export async function runChat(history: ChatMessage[], deps: RunChatDeps): Promise<RunChatResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const maxIterations = deps.maxIterations ?? 20;

  // Build the message array with cache_control breakpoints on the system
  // prompt and the last user/tool message — this tells the provider to cache
  // the entire prefix up to each breakpoint (max 4 breakpoints allowed).
  const systemContent: ContentBlock[] = [
    {
      type: "text",
      text: deps.systemPrompt ?? SYSTEM_PROMPT,
      cache_control: { type: "ephemeral" },
    },
  ];
  const messages: ChatMessage[] = [
    { role: "system", content: systemContent },
    ...history,
  ];

  let finalText = "";
  const aggregateUsage: ChatUsage = {};

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${deps.apiKey}`,
      "Content-Type": "application/json",
    };
    if (deps.referer) headers["HTTP-Referer"] = deps.referer;
    if (deps.title) headers["X-Title"] = deps.title;

    const abort = new AbortController();
    // Abort if OpenRouter doesn't respond within 30s — prevents silent hangs.
    const timer = setTimeout(() => abort.abort(new Error("OpenRouter request timed out after 30s")), 30_000);
    let res: Response;
    try {
      res = await fetchImpl(OPENROUTER_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: deps.model,
          messages: withCacheBreakpoints(messages),
          tools: [GET_PASSAGE_TOOL],
          tool_choice: "auto",
          stream: true,
        }),
        signal: abort.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok || !res.body) {
      const detail = res.body ? await safeText(res) : "";
      throw new Error(`OpenRouter request failed: HTTP ${res.status} ${detail}`.trim());
    }

    const turn = await consumeStream(res.body, deps.onToken);
    // Merge usage from each streaming round (tool-call rounds report usage
    // too, but we only surface the aggregate for the final answer turn).
    if (turn.usage) Object.assign(aggregateUsage, turn.usage);

    if (turn.toolCalls.length > 0) {
      // The model wants verses. Record its tool-call turn, resolve each call,
      // and loop so it can compose the answer around verified text.
      messages.push({ role: "assistant", content: turn.content || null, tool_calls: turn.toolCalls });
      for (const call of turn.toolCalls) {
        if (deps.onPassageRequest) {
          for (const info of describePassageCalls(call, deps.translationId ?? "web")) {
            await deps.onPassageRequest(info);
          }
        }
        const { text, translationsUsed } = await executeToolCall(call, deps.assetFetch, deps.translationId ?? "web");
        if (deps.onTranslationUsed) {
          for (const translationId of translationsUsed) await deps.onTranslationUsed(translationId);
        }
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: call.function.name,
          content: text,
        });
      }
      continue;
    }

    finalText = turn.content;
    return { text: finalText, usage: aggregateUsage };
  }

  throw new Error(`Exceeded ${maxIterations} tool-call iterations without a final answer.`);
}

/**
 * Normalize a get_passage tool call's arguments into a list of passage
 * requests. Accepts the batched shape `{ passages: [{reference, translation}] }`
 * and the single-passage shape `{ reference, translation }` (back-compat).
 * Returns null when the JSON can't be parsed at all.
 */
function parsePassageRequests(argumentsJson: string): PassageRequest[] | null {
  let args: {
    passages?: Array<{ reference?: unknown; translation?: unknown }>;
    reference?: unknown;
    translation?: unknown;
  };
  try {
    args = JSON.parse(argumentsJson || "{}");
  } catch {
    return null;
  }
  const raw = Array.isArray(args.passages) ? args.passages : [args];
  const requests: PassageRequest[] = [];
  for (const p of raw) {
    if (!p || typeof p.reference !== "string") continue;
    requests.push({
      reference: p.reference,
      translation: typeof p.translation === "string" ? p.translation : undefined,
    });
  }
  return requests;
}

/**
 * Inspect a streamed tool call and, for each parseable passage in it, return a
 * canonical reference + translation id for a progress message. Returns an empty
 * list for anything we can't describe yet (the model will get an error result
 * and self-correct, so there's nothing useful to show).
 */
function describePassageCalls(
  call: ToolCall,
  defaultTranslationId: string,
): Array<{ reference: string; translationId: string }> {
  if (call.function.name !== "get_passage") return [];
  const requests = parsePassageRequests(call.function.arguments);
  if (!requests) return [];
  return requests.map((req) => {
    const parsed = parseReference(req.reference);
    return {
      reference: parsed ? formatReference(parsed) : req.reference,
      translationId: req.translation || defaultTranslationId,
    };
  });
}

interface ToolCallResult {
  text: string;
  /** The translation ids that were actually used, one per resolved passage. */
  translationsUsed: string[];
}

async function executeToolCall(
  call: ToolCall,
  assetFetch: AssetFetch,
  defaultTranslationId = "web",
): Promise<ToolCallResult> {
  if (call.function.name !== "get_passage") {
    return { text: JSON.stringify({ error: `Unknown tool: ${call.function.name}` }), translationsUsed: [] };
  }
  const requests = parsePassageRequests(call.function.arguments);
  if (!requests) {
    return { text: JSON.stringify({ error: "Invalid tool arguments JSON." }), translationsUsed: [] };
  }
  if (requests.length === 0) {
    return {
      text: JSON.stringify({ error: "No passages requested. Provide at least one reference." }),
      translationsUsed: [],
    };
  }

  const blocks: string[] = [];
  const translationsUsed: string[] = [];
  for (const req of requests) {
    const translationId = req.translation || defaultTranslationId;
    const result = await getPassage(req.reference, assetFetch, translationId);
    if ("error" in result) {
      // Keep the reference alongside the error so the model knows which of a
      // batch of requests failed.
      blocks.push(JSON.stringify({ reference: req.reference, ...result }));
    } else {
      blocks.push(passageToText(result));
      translationsUsed.push(translationId);
    }
  }
  return { text: blocks.join("\n\n———\n\n"), translationsUsed };
}

interface StreamTurn {
  content: string;
  toolCalls: ToolCall[];
  usage?: ChatUsage;
}

/**
 * Parse an OpenRouter SSE stream. Emits content tokens via `onToken` and
 * accumulates any streamed tool-call fragments (which arrive split by index).
 */
export async function consumeStream(
  body: ReadableStream<Uint8Array>,
  onToken: (text: string) => void | Promise<void>,
): Promise<StreamTurn> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const toolAcc: Map<number, ToolCall> = new Map();
  let content = "";
  let buffer = "";
  let usage: ChatUsage | undefined;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;

      let parsed: any;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue; // OpenRouter sends ": OPENROUTER PROCESSING" keep-alives etc.
      }
      // OpenRouter reports usage in the final chunk. Capture cache stats
      // so callers can verify prompt caching is active.
      const u = parsed?.usage;
      if (u) {
        const details = u.prompt_tokens_details;
        usage = {
          prompt_tokens: u.prompt_tokens,
          completion_tokens: u.completion_tokens,
          total_tokens: u.total_tokens,
          cache_read_tokens: details?.cached_tokens ?? u.cache_read_tokens ?? 0,
          cache_write_tokens: details?.cache_write_tokens ?? u.cache_write_tokens ?? 0,
        };
      }

      const delta = parsed?.choices?.[0]?.delta;
      if (!delta) continue;

      if (typeof delta.content === "string" && delta.content.length > 0) {
        content += delta.content;
        await onToken(delta.content);
      }
      if (Array.isArray(delta.tool_calls)) {
        for (const frag of delta.tool_calls) {
          const idx = frag.index ?? 0;
          const acc = toolAcc.get(idx) ?? {
            id: "",
            type: "function" as const,
            function: { name: "", arguments: "" },
          };
          if (frag.id) acc.id = frag.id;
          if (frag.function?.name) acc.function.name = frag.function.name;
          if (frag.function?.arguments) acc.function.arguments += frag.function.arguments;
          toolAcc.set(idx, acc);
        }
      }
    }
  }

  return {
    content,
    toolCalls: [...toolAcc.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c),
    usage,
  };
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
