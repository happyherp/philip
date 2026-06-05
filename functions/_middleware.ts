// Injects the Turnstile site key from the environment into index.html at request
// time so that preview and production deployments can use different site keys
// without rebuilding the static asset.

interface Env {
  TURNSTILE_SITE_KEY?: string;
}

const PLACEHOLDER = "__TURNSTILE_SITE_KEY__";
const FALLBACK_TEST_KEY = "1x00000000000000000000AA";

export const onRequest: PagesFunction<Env> = async (context) => {
  const response = await context.next();
  if (!response.headers.get("content-type")?.includes("text/html")) {
    return response;
  }
  const siteKey = context.env.TURNSTILE_SITE_KEY ?? FALLBACK_TEST_KEY;
  const html = await response.text();
  return new Response(html.replace(PLACEHOLDER, siteKey), {
    status: response.status,
    headers: response.headers,
  });
};
