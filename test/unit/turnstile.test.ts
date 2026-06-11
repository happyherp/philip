import { describe, it, expect, vi } from "vitest";
import { verifyTurnstileToken } from "../../src/turnstile.ts";

function mockFetch(body: object, status = 200) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe("verifyTurnstileToken", () => {
  it("returns 'pass' when siteverify responds with success", async () => {
    const fetchImpl = mockFetch({ success: true });
    vi.stubGlobal("fetch", fetchImpl);

    const result = await verifyTurnstileToken("tok_valid", "secret_123", "1.2.3.4");
    expect(result).toBe("pass");

    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(opts.method).toBe("POST");
    expect(opts.body).toContain("secret=secret_123");
    expect(opts.body).toContain("response=tok_valid");
    expect(opts.body).toContain("remoteip=1.2.3.4");

    vi.unstubAllGlobals();
  });

  it("returns 'fail' when siteverify rejects the token", async () => {
    const fetchImpl = mockFetch({ success: false, "error-codes": ["invalid-input-response"] });
    vi.stubGlobal("fetch", fetchImpl);

    const result = await verifyTurnstileToken("tok_bad", "secret_123", null);
    expect(result).toBe("fail");

    // remoteip should be omitted when null
    const body = fetchImpl.mock.calls[0][1].body as string;
    expect(body).not.toContain("remoteip");

    vi.unstubAllGlobals();
  });

  it("returns 'fail' on token rejection even with a non-200 status", async () => {
    // siteverify uses 4xx for some definitive rejections.
    const fetchImpl = mockFetch(
      { success: false, "error-codes": ["timeout-or-duplicate"] },
      400,
    );
    vi.stubGlobal("fetch", fetchImpl);

    const result = await verifyTurnstileToken("tok_reused", "secret", null);
    expect(result).toBe("fail");

    vi.unstubAllGlobals();
  });

  it("returns 'unavailable' on secret-side errors (misconfiguration must fail open)", async () => {
    const fetchImpl = mockFetch(
      { success: false, "error-codes": ["invalid-input-secret"] },
      400,
    );
    vi.stubGlobal("fetch", fetchImpl);

    const result = await verifyTurnstileToken("tok", "bad_secret", null);
    expect(result).toBe("unavailable");

    vi.unstubAllGlobals();
  });

  it("returns 'unavailable' when fetch throws (network error)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    // Network problems must not block users — the caller fails open.
    const result = await verifyTurnstileToken("tok", "secret", null);
    expect(result).toBe("unavailable");

    vi.unstubAllGlobals();
  });

  it("returns 'unavailable' when siteverify returns malformed JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not json", { status: 200 })),
    );

    const result = await verifyTurnstileToken("tok", "secret", null);
    expect(result).toBe("unavailable");

    vi.unstubAllGlobals();
  });
});
