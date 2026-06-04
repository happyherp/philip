-- Maps a WhatsApp sender (wa_id = E.164 phone number string) to a Philip conversation.
-- One persistent conversation per phone number.
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  wa_id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
