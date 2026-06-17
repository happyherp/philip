// Server-side persistence for *shared* conversations using Cloudflare D1.
//
// Philip no longer stores conversations automatically — the working
// conversation lives in the reader's browser (localStorage). The server only
// ever holds snapshots the user explicitly chose to share via "Share", and
// those expire. This keeps message content off the server unless the reader
// deliberately publishes a single conversation.

import { type ConversationMessage, sanitizeHistory } from "./messages.ts";

export type SharedMessage = ConversationMessage;

export interface SharedConversation {
  id: string;
  createdAt: number;
  expiresAt: number;
  lang: string;
  messages: SharedMessage[];
}

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Default lifetime of a share link: 30 days. */
export const DEFAULT_SHARE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Generate a short, URL-safe share id (no dashes). */
export function generateShareId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  let id = "";
  for (const b of bytes) {
    id += ALPHABET[b % ALPHABET.length];
  }
  return id;
}

/**
 * Store a conversation snapshot and return its share id. The snapshot is frozen
 * (a JSON blob), so continuing the conversation in the browser never mutates it.
 */
export async function createShare(
  db: D1Database,
  messages: unknown,
  lang: string,
  ttlMs: number = DEFAULT_SHARE_TTL_MS,
): Promise<{ id: string; expiresAt: number }> {
  const id = generateShareId();
  const now = Date.now();
  const expiresAt = now + ttlMs;
  const data = JSON.stringify(sanitizeHistory(messages));
  await db
    .prepare(
      "INSERT INTO shared_conversations (id, data, lang, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(id, data, lang, now, expiresAt)
    .run();
  return { id, expiresAt };
}

/** Load a shared conversation. Returns null if it does not exist or has expired. */
export async function getShare(
  db: D1Database,
  id: string,
  now: number = Date.now(),
): Promise<SharedConversation | null> {
  const row = await db
    .prepare(
      "SELECT id, data, lang, created_at as createdAt, expires_at as expiresAt FROM shared_conversations WHERE id = ?",
    )
    .bind(id)
    .first<{
      id: string;
      data: string;
      lang: string;
      createdAt: number;
      expiresAt: number;
    }>();

  if (!row) return null;
  if (row.expiresAt <= now) return null;

  let messages: SharedMessage[] = [];
  try {
    messages = sanitizeHistory(JSON.parse(row.data));
  } catch {
    messages = [];
  }

  return {
    id: row.id,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    lang: row.lang,
    messages,
  };
}
