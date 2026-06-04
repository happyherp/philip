// Twilio webhook signature verification using Web Crypto (HMAC-SHA1).
// https://www.twilio.com/docs/usage/webhooks/webhooks-security

interface VerifiableRequest {
  url: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

/**
 * Verify the X-Twilio-Signature header on an inbound webhook POST.
 * The request body must not have been consumed yet; pass a clone if needed.
 */
export async function verifyTwilioSignature(
  request: VerifiableRequest,
  authToken: string,
): Promise<boolean> {
  const signature = request.headers.get("X-Twilio-Signature");
  if (!signature) return false;

  let data = request.url;

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const body = await request.text();
    const params = [...new URLSearchParams(body).entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    );
    for (const [k, v] of params) data += k + v;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  // HMAC-SHA1 is 20 bytes — safe to spread into fromCharCode.
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));

  return constantTimeEqual(signature, expected);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
