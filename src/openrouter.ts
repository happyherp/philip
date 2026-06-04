// OpenRouter chat with an agentic get_passage tool loop.
// Everything external (the HTTP fetch and the asset/passage lookup) is injected,
// so the whole loop is unit-testable with canned SSE streams and no network.

import { type AssetFetch, getPassage, passageToText } from "./bible.ts";
import { GET_PASSAGE_TOOL, SYSTEM_PROMPT } from "./philip.ts";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
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
}

/**
 * Run a full conversation turn: stream tokens to `onToken`, transparently
 * resolving any get_passage tool calls against the bundled bible. Returns the
 * final assistant text.
 */
export async function runChat(history: ChatMessage[], deps: RunChatDeps): Promise<string> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const maxIterations = deps.maxIterations ?? 6;

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
  ];

  let finalText = "";

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
          messages,
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

    if (turn.toolCalls.length > 0) {
      // The model wants verses. Record its tool-call turn, resolve each call,
      // and loop so it can compose the answer around verified text.
      messages.push({ role: "assistant", content: turn.content || null, tool_calls: turn.toolCalls });
      for (const call of turn.toolCalls) {
        const result = await executeToolCall(call, deps.assetFetch);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: call.function.name,
          content: result,
        });
      }
      continue;
    }

    finalText = turn.content;
    return finalText;
  }

  throw new Error(`Exceeded ${maxIterations} tool-call iterations without a final answer.`);
}

async function executeToolCall(call: ToolCall, assetFetch: AssetFetch): Promise<string> {
  if (call.function.name !== "get_passage") {
    return JSON.stringify({ error: `Unknown tool: ${call.function.name}` });
  }
  let reference = "";
  try {
    reference = (JSON.parse(call.function.arguments || "{}") as { reference?: string }).reference ?? "";
  } catch {
    return JSON.stringify({ error: "Invalid tool arguments JSON." });
  }
  const result = await getPassage(reference, assetFetch);
  return "error" in result ? JSON.stringify(result) : passageToText(result);
}

interface StreamTurn {
  content: string;
  toolCalls: ToolCall[];
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
  };
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
