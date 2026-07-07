import { describe, it, expect } from "vitest";
import { consumeStream, InsufficientCreditsError, runChat } from "../../src/openrouter.ts";
import {
  DONE,
  contentEvent,
  fetchSequence,
  fileAssetFetch,
  sseResponse,
  toolEvent,
} from "../helpers.ts";

describe("consumeStream", () => {
  it("accumulates content tokens", async () => {
    const tokens: string[] = [];
    const turn = await consumeStream(
      sseResponse([contentEvent("Hello "), contentEvent("world"), DONE]).body!,
      (t) => {
        tokens.push(t);
      },
    );
    expect(tokens).toEqual(["Hello ", "world"]);
    expect(turn.content).toBe("Hello world");
    expect(turn.toolCalls).toHaveLength(0);
  });

  it("reassembles tool-call fragments split across chunks", async () => {
    const turn = await consumeStream(
      sseResponse([
        toolEvent(0, { id: "call_1", name: "get_passage", arguments: '{"refe' }),
        toolEvent(0, { arguments: 'rence":"John 8:31"}' }),
        DONE,
      ]).body!,
      () => {},
    );
    expect(turn.toolCalls).toHaveLength(1);
    expect(turn.toolCalls[0]).toMatchObject({ id: "call_1" });
    expect(turn.toolCalls[0].function).toEqual({
      name: "get_passage",
      arguments: '{"reference":"John 8:31"}',
    });
  });
});

describe("runChat tool loop", () => {
  it("executes get_passage then streams the final answer", async () => {
    const toolTurn = sseResponse([
      toolEvent(0, { id: "c1", name: "get_passage", arguments: '{"reference":"John 8:31"}' }),
      DONE,
    ]);
    const answerTurn = sseResponse([
      contentEvent("Here is "),
      contentEvent("John 8:31."),
      DONE,
    ]);
    const { fetchImpl, bodies } = fetchSequence([toolTurn, answerTurn]);

    const tokens: string[] = [];
    const final = await runChat([{ role: "user", content: "Read John 8:31" }], {
      apiKey: "test",
      model: "test/model",
      fetchImpl,
      assetFetch: fileAssetFetch(),
      onToken: (t) => {
        tokens.push(t);
      },
    });

    expect(final.text).toBe("Here is John 8:31.");
    expect(tokens.join("")).toBe("Here is John 8:31.");

    // The second request must include the tool result with the EXACT WEB text.
    const secondBody = (await bodies())[1];
    const toolMsg = secondBody.messages.find((m: any) => m.role === "tool");
    expect(toolMsg).toBeTruthy();
    // Content may be a string or a ContentBlock[] (with cache_control);
    // stringify to check either shape.
    const toolContent = JSON.stringify(toolMsg.content);
    expect(toolContent).toContain("If you remain in my word");
    // And the system prompt is always present.
    expect(secondBody.messages[0].role).toBe("system");
  });

  it("resolves multiple passages (different books and translations) in one tool call", async () => {
    const toolTurn = sseResponse([
      toolEvent(0, {
        id: "c1",
        name: "get_passage",
        arguments:
          '{"passages":[{"reference":"John 1:1","translation":"web"},' +
          '{"reference":"John 1:1","translation":"tisch"},' +
          '{"reference":"Genesis 1:1","translation":"web"}]}',
      }),
      DONE,
    ]);
    const answerTurn = sseResponse([contentEvent("Done."), DONE]);
    const { fetchImpl, bodies } = fetchSequence([toolTurn, answerTurn]);

    const usedTranslations: string[] = [];
    const requests: Array<{ reference: string; translationId: string }> = [];
    await runChat([{ role: "user", content: "Compare these" }], {
      apiKey: "test",
      model: "test/model",
      fetchImpl,
      assetFetch: fileAssetFetch(),
      onToken: () => {},
      onPassageRequest: (info) => {
        requests.push(info);
      },
      onTranslationUsed: (tid) => {
        usedTranslations.push(tid);
      },
    });

    // One progress + translation event per passage, in order.
    expect(requests).toEqual([
      { reference: "John 1:1", translationId: "web" },
      { reference: "John 1:1", translationId: "tisch" },
      { reference: "Genesis 1:1", translationId: "web" },
    ]);
    expect(usedTranslations).toEqual(["web", "tisch", "web"]);

    // A single tool message carries the text of all three passages.
    const toolMsg = (await bodies())[1].messages.find((m: any) => m.role === "tool");
    const toolContent = JSON.stringify(toolMsg.content);
    expect(toolContent).toContain("In the beginning was the Word"); // John 1:1 WEB
    expect(toolContent).toContain("λόγος"); // John 1:1 Tischendorf (Greek)
    expect(toolContent).toContain("In the beginning, God created"); // Genesis 1:1 WEB
  });

  it("reports one failed passage without dropping the rest of a batch", async () => {
    const toolTurn = sseResponse([
      toolEvent(0, {
        id: "c1",
        name: "get_passage",
        arguments: '{"passages":[{"reference":"John 1:1"},{"reference":"bogus"}]}',
      }),
      DONE,
    ]);
    const answerTurn = sseResponse([contentEvent("Done."), DONE]);
    const { fetchImpl, bodies } = fetchSequence([toolTurn, answerTurn]);

    await runChat([{ role: "user", content: "batch" }], {
      apiKey: "test",
      model: "test/model",
      fetchImpl,
      assetFetch: fileAssetFetch(),
      onToken: () => {},
    });

    const toolMsg = (await bodies())[1].messages.find((m: any) => m.role === "tool");
    const toolContent = JSON.stringify(toolMsg.content);
    expect(toolContent).toContain("In the beginning was the Word");
    expect(toolContent).toContain("error");
    expect(toolContent).toContain("bogus");
  });

  it("reports the passage being read (canonical reference + translation) before fetching", async () => {
    const toolTurn = sseResponse([
      toolEvent(0, { id: "c1", name: "get_passage", arguments: '{"reference":"john 3"}' }),
      DONE,
    ]);
    const answerTurn = sseResponse([contentEvent("Done."), DONE]);
    const { fetchImpl } = fetchSequence([toolTurn, answerTurn]);

    const requests: Array<{ reference: string; translationId: string }> = [];
    await runChat([{ role: "user", content: "Read John 3" }], {
      apiKey: "test",
      model: "test/model",
      fetchImpl,
      assetFetch: fileAssetFetch(),
      onToken: () => {},
      onPassageRequest: (info) => {
        requests.push(info);
      },
    });

    // Reference is normalized to canonical form; translation falls back to web.
    expect(requests).toEqual([{ reference: "John 3", translationId: "web" }]);
  });

  it("feeds a parse error back to the model so it can retry", async () => {
    const badTool = sseResponse([
      toolEvent(0, { id: "c1", name: "get_passage", arguments: '{"reference":"bogus"}' }),
      DONE,
    ]);
    const answer = sseResponse([contentEvent("Let me try again."), DONE]);
    const { fetchImpl, bodies } = fetchSequence([badTool, answer]);

    await runChat([{ role: "user", content: "Read bogus" }], {
      apiKey: "test",
      model: "test/model",
      fetchImpl,
      assetFetch: fileAssetFetch(),
      onToken: () => {},
    });

    const toolMsg = (await bodies())[1].messages.find((m: any) => m.role === "tool");
    const toolContent = JSON.stringify(toolMsg.content);
    expect(toolContent).toContain("error");
  });

  it("throws if the model never stops calling tools", async () => {
    const loopTool = () =>
      sseResponse([
        toolEvent(0, { id: "c", name: "get_passage", arguments: '{"reference":"John 1:1"}' }),
        DONE,
      ]);
    const { fetchImpl } = fetchSequence([loopTool(), loopTool(), loopTool()]);

    await expect(
      runChat([{ role: "user", content: "loop" }], {
        apiKey: "test",
        model: "test/model",
        fetchImpl,
        assetFetch: fileAssetFetch(),
        onToken: () => {},
        maxIterations: 3,
      }),
    ).rejects.toThrow(/iterations/);
  });

  it("throws on a non-OK OpenRouter response", async () => {
    const { fetchImpl } = fetchSequence([new Response("nope", { status: 401 })]);
    await expect(
      runChat([{ role: "user", content: "hi" }], {
        apiKey: "bad",
        model: "test/model",
        fetchImpl,
        assetFetch: fileAssetFetch(),
        onToken: () => {},
      }),
    ).rejects.toThrow(/HTTP 401/);
  });

  it("throws InsufficientCreditsError with the refill URL on HTTP 402", async () => {
    const body = JSON.stringify({
      error: {
        message:
          "This request requires more credits, or fewer max_tokens. To increase, visit " +
          "https://openrouter.ai/workspaces/default/keys/8a857238b319f49903152188cbdf0f794b7415a " +
          "and adjust the key's total limit",
        code: 402,
      },
    });
    const { fetchImpl } = fetchSequence([new Response(body, { status: 402 })]);

    const err = await runChat([{ role: "user", content: "hi" }], {
      apiKey: "bad",
      model: "test/model",
      fetchImpl,
      assetFetch: fileAssetFetch(),
      onToken: () => {},
    }).catch((e) => e);

    expect(err).toBeInstanceOf(InsufficientCreditsError);
    expect(err.refillUrl).toBe(
      "https://openrouter.ai/workspaces/default/keys/8a857238b319f49903152188cbdf0f794b7415a",
    );
  });

  it("throws InsufficientCreditsError without a refill URL when none is present", async () => {
    const { fetchImpl } = fetchSequence([new Response("{}", { status: 402 })]);

    const err = await runChat([{ role: "user", content: "hi" }], {
      apiKey: "bad",
      model: "test/model",
      fetchImpl,
      assetFetch: fileAssetFetch(),
      onToken: () => {},
    }).catch((e) => e);

    expect(err).toBeInstanceOf(InsufficientCreditsError);
    expect(err.refillUrl).toBeUndefined();
  });
});
