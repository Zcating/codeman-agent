ALTER TABLE conversations ADD COLUMN workspace_id TEXT NOT NULL DEFAULT '';

CREATE INDEX idx_conversations_workspace_id ON conversations(workspace_id);
