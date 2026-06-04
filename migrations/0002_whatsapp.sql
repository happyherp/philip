-- WhatsApp session tracking: maps a phone number to a persistent conversation.
-- Phone numbers arrive from Twilio as "whatsapp:+1234567890".

CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  phone_number TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE
);
