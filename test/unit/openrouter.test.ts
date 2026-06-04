import { describe, it, expect } from "vitest";
import { consumeStream, runChat } from "../../src/openrouter.ts";
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

    expect(final).toBe("Here is John 8:31.");
    expect(tokens.join("")).toBe("Here is John 8:31.");

    // The second request must include the tool result with the EXACT WEB text.
    const secondBody = (await bodies())[1];
    const toolMsg = secondBody.messages.find((m: any) => m.role === "tool");
    expect(toolMsg).toBeTruthy();
    expect(toolMsg.content).toContain("If you remain in my word");
    // And the system prompt is always present.
    expect(secondBody.messages[0].role).toBe("system");
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
    expect(toolMsg.content).toContain("error");
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
});
