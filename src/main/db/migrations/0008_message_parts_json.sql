ALTER TABLE messages ADD COLUMN parts_json TEXT;
CREATE INDEX IF NOT EXISTS idx_messages_has_parts ON messages(conversation_id) WHERE parts_json IS NOT NULL;
