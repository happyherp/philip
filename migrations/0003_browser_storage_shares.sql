-- Conversations now live in the reader's browser (localStorage), not the
-- server. Drop the auto-capture tables and replace them with a table that
-- holds only conversations the user *explicitly* chose to share, which expire.

DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS conversations;

CREATE TABLE IF NOT EXISTS shared_conversations (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,            -- JSON array of { role, content }
  lang TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shared_expires ON shared_conversations (expires_at);
