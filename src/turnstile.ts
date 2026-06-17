// Cloudflare Turnstile server-side token verification.

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Result of a siteverify call:
 * - "pass":        Cloudflare confirmed the token is valid.
 * - "fail":        Cloudflare explicitly rejected the token.
 * - "unavailable": siteverify could not give a verdict on the *token* — network
 *                  error, malformed response, or a secret-side problem
 *                  (invalid-input-secret etc.). A misconfigured secret or a
 *                  Cloudflare outage must not lock real users out, so callers
 *                  should treat this as a soft pass (fail-open).
 */
export type TurnstileOutcome = "pass" | "fail" | "unavailable";

// Error codes that indicate a problem on our side (secret/config) or
// Cloudflare's side — not evidence that the client is a bot.
const NON_TOKEN_ERRORS = new Set([
  "missing-input-secret",
  "invalid-input-secret",
  "internal-error",
]);

/** Verify a Turnstile token with Cloudflare's siteverify endpoint. */
export async function verifyTurnstileToken(
  token: string,
  secret: string,
  remoteip: string | null,
): Promise<TurnstileOutcome> {
  const formData = new URLSearchParams();
  formData.set("secret", secret);
  formData.set("response", token);
  if (remoteip) formData.set("remoteip", remoteip);

  let data: { success?: boolean; "error-codes"?: string[] };
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });
    // siteverify uses 4xx for some definitive rejections, so classify by the
    // JSON body rather than the HTTP status.
    data = await res.json();
  } catch (e) {
    console.error("[philip] Turnstile siteverify request failed", e);
    return "unavailable";
  }

  if (data.success === true) return "pass";

  const errorCodes = Array.isArray(data["error-codes"]) ? data["error-codes"] : [];
  if (errorCodes.some((c) => NON_TOKEN_ERRORS.has(c))) {
    console.error("[philip] Turnstile siteverify non-token error", errorCodes);
    return "unavailable";
  }
  return data.success === false ? "fail" : "unavailable";
}
