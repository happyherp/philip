// Server-side persistence for conversations using Cloudflare D1.
// The interface is small so the same ideas can be reused for WhatsApp sessions later.

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
}

export interface Conversation {
  id: string;
  createdAt: number;
  updatedAt: number;
  messages: StoredMessage[];
}

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Generate a short, URL-safe conversation id (no dashes). */
export function generateConversationId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  let id = "";
  for (const b of bytes) {
    id += ALPHABET[b % ALPHABET.length];
  }
  return id;
}

/** Create a new empty conversation and return its id. */
export async function createConversation(db: D1Database): Promise<string> {
  const id = generateConversationId();
  const now = Date.now();
  await db
    .prepare(
      "INSERT INTO conversations (id, created_at, updated_at) VALUES (?, ?, ?)",
    )
    .bind(id, now, now)
    .run();
  return id;
}

/** Append a single message and bump the conversation updated_at. */
export async function appendMessage(
  db: D1Database,
  conversationId: string,
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  const now = Date.now();
  await db.batch([
    db
      .prepare(
        "INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)",
      )
      .bind(conversationId, role, content, now),
    db
      .prepare("UPDATE conversations SET updated_at = ? WHERE id = ?")
      .bind(now, conversationId),
  ]);
}

/** Load all messages for a conversation, ordered by time. */
export async function getConversationMessages(
  db: D1Database,
  conversationId: string,
): Promise<StoredMessage[]> {
  const res = await db
    .prepare(
      "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC",
    )
    .bind(conversationId)
    .all<{ role: "user" | "assistant"; content: string }>();

  return (res.results ?? []).map((r) => ({ role: r.role, content: r.content }));
}

/** Load full conversation (metadata + messages). Returns null if not found. */
export async function getConversation(
  db: D1Database,
  conversationId: string,
): Promise<Conversation | null> {
  const conv = await db
    .prepare(
      "SELECT id, created_at as createdAt, updated_at as updatedAt FROM conversations WHERE id = ?",
    )
    .bind(conversationId)
    .first<{ id: string; createdAt: number; updatedAt: number }>();

  if (!conv) return null;

  const messages = await getConversationMessages(db, conversationId);
  return {
    id: conv.id,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    messages,
  };
}
