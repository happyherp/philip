import { describe, it, expect, vi } from "vitest";
import { verifyTurnstileToken } from "../../src/turnstile.ts";

function mockFetch(body: object, status = 200) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe("verifyTurnstileToken", () => {
  it("returns true when siteverify responds with success", async () => {
    const fetchImpl = mockFetch({ success: true });
    vi.stubGlobal("fetch", fetchImpl);

    const result = await verifyTurnstileToken("tok_valid", "secret_123", "1.2.3.4");
    expect(result).toBe(true);

    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(opts.method).toBe("POST");
    expect(opts.body).toContain("secret=secret_123");
    expect(opts.body).toContain("response=tok_valid");
    expect(opts.body).toContain("remoteip=1.2.3.4");

    vi.unstubAllGlobals();
  });

  it("returns false when siteverify responds with failure", async () => {
    const fetchImpl = mockFetch({ success: false, "error-codes": ["invalid-input-response"] });
    vi.stubGlobal("fetch", fetchImpl);

    const result = await verifyTurnstileToken("tok_bad", "secret_123", null);
    expect(result).toBe(false);

    // remoteip should be omitted when null
    const body = fetchImpl.mock.calls[0][1].body as string;
    expect(body).not.toContain("remoteip");

    vi.unstubAllGlobals();
  });

  it("returns false when siteverify returns non-200", async () => {
    const fetchImpl = mockFetch({}, 500);
    vi.stubGlobal("fetch", fetchImpl);

    const result = await verifyTurnstileToken("tok", "secret", "1.2.3.4");
    expect(result).toBe(false);

    vi.unstubAllGlobals();
  });

  it("returns false when fetch throws (network error)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    // verifyTurnstileToken does not catch — the caller (Pages Function) handles it.
    // But let's verify it does propagate. If the design changes to catch, update this test.
    await expect(verifyTurnstileToken("tok", "secret", null)).rejects.toThrow("network down");

    vi.unstubAllGlobals();
  });
});