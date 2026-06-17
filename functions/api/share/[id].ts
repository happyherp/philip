// GET /api/share/:id
// Returns a shared conversation snapshot so it can be opened from a link.
// Returns 404 if the snapshot does not exist or has expired.

import { getShare } from "../../../src/db.ts";
import { json } from "../../../src/http.ts";

interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { params, env } = context;
  const id = params.id as string | undefined;

  if (!id) {
    return json({ error: "Missing share id" }, 400);
  }
  if (!env.DB) {
    return json({ error: "Sharing is not available." }, 503);
  }

  const share = await getShare(env.DB, id);
  if (!share) {
    return json({ error: "This shared conversation was not found or has expired." }, 404);
  }

  return json(
    {
      id: share.id,
      createdAt: share.createdAt,
      expiresAt: share.expiresAt,
      lang: share.lang,
      messages: share.messages,
    },
    200,
  );
};
