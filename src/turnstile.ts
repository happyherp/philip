// Cloudflare Turnstile server-side token verification.

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Verify a Turnstile token with Cloudflare's siteverify endpoint.
 * Returns true if the token is valid, false otherwise (including network errors).
 */
export async function verifyTurnstileToken(
  token: string,
  secret: string,
  remoteip: string | null,
): Promise<boolean> {
  const formData = new URLSearchParams();
  formData.set("secret", secret);
  formData.set("response", token);
  if (remoteip) formData.set("remoteip", remoteip);

  const res = await fetch(SITEVERIFY_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });

  if (!res.ok) return false;

  const data: { success: boolean } = await res.json();
  return data.success === true;
}