// Small HTTP helpers shared by the Cloudflare Pages Functions in functions/api/.

/** Build a JSON Response with the given status. */
export function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Parse a positive integer config value, or undefined if absent/invalid. */
export function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** The caller's IP per Cloudflare's edge header, or null when unavailable. */
export function clientIp(request: Request): string | null {
  return request.headers.get("CF-Connecting-IP");
}

export const SUPPORTED_LANGS = new Set(["en", "es", "de"]);

/**
 * Resolve a supported UI language: prefer an explicit value, then the
 * Accept-Language header, falling back to "en".
 */
export function resolveLang(
  bodyLang: string | null,
  acceptLanguage: string | null = null,
): string {
  if (bodyLang) {
    const base = bodyLang.split("-")[0].toLowerCase();
    if (SUPPORTED_LANGS.has(base)) return base;
  }
  if (acceptLanguage) {
    for (const part of acceptLanguage.split(",")) {
      const base = part.split(";")[0].trim().split("-")[0].toLowerCase();
      if (SUPPORTED_LANGS.has(base)) return base;
    }
  }
  return "en";
}
