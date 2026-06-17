// HMAC-signed continuation tokens.
//
// Now that the browser owns the conversation history, the server can't tell a
// genuine "first turn" from a forged one by inspecting the messages. Instead:
// once a reader passes Turnstile, the server mints a short-lived, HMAC-signed
// token and hands it back. The browser echoes it on later turns, and the server
// verifies the signature rather than trusting the history shape. This keeps the
// bot gate unforgeable without persisting any conversation state server-side.
//
// The token is signed with the Turnstile secret (already a server-only secret),
// so no additional configuration is required. It carries an expiry and the
// caller's IP, both of which are checked on verification.

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours — covers a reading session.

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export interface ContinuationOptions {
  ip?: string | null;
  ttlMs?: number;
  now?: number;
}

/** Mint a fresh, signed continuation token (rolling expiry on every call). */
export async function mintContinuationToken(
  secret: string,
  opts: ContinuationOptions = {},
): Promise<string> {
  const now = opts.now ?? Date.now();
  const payload = {
    exp: now + (opts.ttlMs ?? DEFAULT_TTL_MS),
    ip: opts.ip ?? "unknown",
  };
  const payloadB64 = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await importKey(secret);
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64)),
  );
  return `${payloadB64}.${b64urlEncode(sig)}`;
}

/**
 * Verify a continuation token: signature valid, not expired, and (if present)
 * the bound IP matches. Returns false on any problem — the caller then falls
 * back to requiring a fresh Turnstile challenge.
 */
export async function verifyContinuationToken(
  token: string,
  secret: string,
  opts: ContinuationOptions = {},
): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts;

  const key = await importKey(secret);
  let ok: boolean;
  try {
    ok = await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlDecode(sigB64) as unknown as BufferSource,
      new TextEncoder().encode(payloadB64),
    );
  } catch {
    return false;
  }
  if (!ok) return false;

  let payload: { exp?: unknown; ip?: unknown };
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64)));
  } catch {
    return false;
  }

  const now = opts.now ?? Date.now();
  if (typeof payload.exp !== "number" || payload.exp <= now) return false;
  if (payload.ip && payload.ip !== (opts.ip ?? "unknown")) return false;
  return true;
}
