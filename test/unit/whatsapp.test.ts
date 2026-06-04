import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHmac } from "node:crypto";
import { createTestD1 } from "../helpers.ts";
import { DONE, contentEvent, fetchSequence, fileAssetFetch, sseResponse } from "../helpers.ts";
import type { D1Database } from "@cloudflare/workers-types";
import { onRequestPost } from "../../functions/api/whatsapp.ts";

const AUTH_TOKEN = "test_auth_token_whatsapp";

function sign(authToken: string, url: string, params: Record<string, string>): string {
  let data = url;
  for (const k of Object.keys(params).sort()) data += k + params[k];
  return createHmac("sha1", authToken).update(data).digest("base64");
}

function makeContext(
  url: string,
  params: Record<string, string>,
  env: Record<string, unknown>,
  signWith: string = AUTH_TOKEN,
) {
  const body = new URLSearchParams(params).toString();
  const sig = sign(signWith, url, params);
  const request = new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": sig,
    },
    body,
  });
  return {
    request,
    env,
    params: {},
    waitUntil: (_p: Promise<unknown>) => {},
    passThroughOnException: () => {},
    next: () => Promise.resolve(new Response()),
    data: {},
    pluginArgs: {},
    functionPath: "/api/whatsapp",
  } as any;
}

describe("whatsapp webhook handler", () => {
  let db: D1Database;
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    ({ db, dispose } = await createTestD1());
  });

  afterAll(async () => {
    await dispose();
  });

  it("returns 403 for an invalid Twilio signature", async () => {
    const url = "https://example.com/api/whatsapp";
    const params = { From: "whatsapp:+10001112222", Body: "Hello" };
    const ctx = makeContext(url, params, { TWILIO_AUTH_TOKEN: AUTH_TOKEN }, "wrong_token");
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(403);
  });

  it("returns empty TwiML for a blank body", async () => {
    const url = "https://example.com/api/whatsapp";
    const params = { From: "whatsapp:+10001112222", Body: "" };
    const ctx = makeContext(url, params, { TWILIO_AUTH_TOKEN: AUTH_TOKEN });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("<Response></Response>");
  });

  it("returns a TwiML message with Philip's reply", async () => {
    const { fetchImpl } = fetchSequence([
      sseResponse([contentEvent("The Lord is my shepherd."), DONE]),
    ]);

    const url = "https://example.com/api/whatsapp";
    const params = { From: "whatsapp:+19998887777", Body: "Tell me about Psalm 23" };
    const ctx = makeContext(url, params, {
      TWILIO_AUTH_TOKEN: AUTH_TOKEN,
      OPENROUTER_API_KEY: "test-key",
      DB: db,
      ASSETS: { fetch: fileAssetFetch() } as any,
      _fetchImpl: fetchImpl,
    });

    // Patch runChat's fetch via the env override (we re-export assetFetch via ASSETS mock).
    // Since the handler calls runChat directly, inject fetchImpl by monkey-patching.
    // Simpler: test that the handler calls runChat and wraps the result in TwiML.
    const { runChat } = await import("../../src/openrouter.ts");
    const originalRunChat = runChat;

    // Use vi.mock or just test what we can: call with a mocked env that injects fetchImpl.
    // We don't export runChat as overrideable from the handler, so test the output shape.
    // Re-import after overriding global fetch for this test.
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl as any;

    try {
      const res = await onRequestPost(ctx);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/xml");
      const text = await res.text();
      expect(text).toMatch(/^<\?xml/);
      expect(text).toContain("<Response>");
      expect(text).toContain("<Message>");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("escapes XML special characters in the reply", async () => {
    // Test the XML escaping by simulating a reply containing special chars.
    // We do this by verifying a known reply goes through correctly.
    const origFetch = globalThis.fetch;
    const { fetchImpl } = fetchSequence([
      sseResponse([contentEvent('Look & see: "this" isn\'t <bad>'), DONE]),
    ]);
    globalThis.fetch = fetchImpl as any;

    const url = "https://example.com/api/whatsapp";
    const params = { From: "whatsapp:+15550000001", Body: "Test special chars" };
    const ctx = makeContext(url, params, {
      TWILIO_AUTH_TOKEN: AUTH_TOKEN,
      OPENROUTER_API_KEY: "test-key",
      DB: db,
      ASSETS: { fetch: fileAssetFetch() } as any,
    });

    try {
      const res = await onRequestPost(ctx);
      const text = await res.text();
      expect(text).toContain("&amp;");
      expect(text).toContain("&lt;");
      expect(text).toContain("&gt;");
      expect(text).toContain("&quot;");
      expect(text).toContain("&apos;");
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
