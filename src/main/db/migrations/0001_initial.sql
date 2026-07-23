CREATE TABLE conversations (
    id              TEXT PRIMARY KEY,        -- uuid
    title           TEXT NOT NULL,           -- auto from first user msg, ≤40 chars
    system_prompt   TEXT,                    -- NULL = use global default
    created_at      INTEGER NOT NULL,        -- unix epoch seconds
    updated_at      INTEGER NOT NULL,
    archived_at     INTEGER                  -- NULL = active
);

CREATE TABLE messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,           -- 'user' | 'assistant' | 'tool' | 'system'
    content         TEXT NOT NULL,
    tool_calls      TEXT,                    -- JSON: [{name, args, id}]
    tool_results    TEXT,                    -- JSON: [{tool_call_id, result, error}]
    model           TEXT,                    -- which LLM produced this
    input_tokens    INTEGER,
    output_tokens   INTEGER,
    created_at      INTEGER NOT NULL
);

CREATE INDEX idx_messages_conv_created
    ON messages(conversation_id, created_at);

CREATE VIRTUAL TABLE messages_fts USING fts5(
    content, content='messages', content_rowid='rowid'
);