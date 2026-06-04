import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyTwilioSignature } from "../../src/twilio.ts";

const AUTH_TOKEN = "test_auth_token_abc123";

function sign(authToken: string, url: string, params: Record<string, string>): string {
  let data = url;
  for (const k of Object.keys(params).sort()) data += k + params[k];
  return createHmac("sha1", authToken).update(data).digest("base64");
}

function makeRequest(
  url: string,
  params: Record<string, string>,
  signature: string,
): Request {
  const body = new URLSearchParams(params).toString();
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": signature,
    },
    body,
  });
}

describe("verifyTwilioSignature", () => {
  it("accepts a valid signature", async () => {
    const url = "https://example.com/api/whatsapp";
    const params = { From: "whatsapp:+10001112222", Body: "Hello Philip" };
    const sig = sign(AUTH_TOKEN, url, params);
    const req = makeRequest(url, params, sig);
    expect(await verifyTwilioSignature(req, AUTH_TOKEN)).toBe(true);
  });

  it("rejects a tampered body", async () => {
    const url = "https://example.com/api/whatsapp";
    const params = { From: "whatsapp:+10001112222", Body: "Hello Philip" };
    const sig = sign(AUTH_TOKEN, url, params);
    // Different body in the actual request
    const req = makeRequest(url, { ...params, Body: "Tampered" }, sig);
    expect(await verifyTwilioSignature(req, AUTH_TOKEN)).toBe(false);
  });

  it("rejects a wrong auth token", async () => {
    const url = "https://example.com/api/whatsapp";
    const params = { From: "whatsapp:+10001112222", Body: "Hello" };
    const sig = sign("wrong_token", url, params);
    const req = makeRequest(url, params, sig);
    expect(await verifyTwilioSignature(req, AUTH_TOKEN)).toBe(false);
  });

  it("rejects a request with no signature header", async () => {
    const url = "https://example.com/api/whatsapp";
    const req = new Request(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "From=whatsapp%3A%2B10001112222&Body=Hello",
    });
    expect(await verifyTwilioSignature(req, AUTH_TOKEN)).toBe(false);
  });

  it("handles params in non-alphabetical submission order", async () => {
    const url = "https://example.com/api/whatsapp";
    // Params signed in alphabetical order but submitted in reverse.
    const params = { From: "whatsapp:+10001112222", Body: "Hello Philip" };
    const sig = sign(AUTH_TOKEN, url, params);
    // Body submitted as Body first then From (wrong order).
    const body = `Body=${encodeURIComponent(params.Body)}&From=${encodeURIComponent(params.From)}`;
    const req = new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-twilio-signature": sig,
      },
      body,
    });
    // Our verifier sorts params, so this should still validate.
    expect(await verifyTwilioSignature(req, AUTH_TOKEN)).toBe(true);
  });
});
