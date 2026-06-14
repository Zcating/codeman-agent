CREATE TABLE conversations (
    id              TEXT PRIMARY KEY,        -- UUID
    title           TEXT NOT NULL,           -- 来自首条用户消息，≤40 字符
    system_prompt   TEXT,                    -- NULL = 使用全局默认值
    created_at      INTEGER NOT NULL,        -- unix epoch 秒
    updated_at      INTEGER NOT NULL,
    archived_at     INTEGER                  -- NULL = 活跃
);

CREATE TABLE messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,           -- 'user' | 'assistant' | 'tool' | 'system'
    content         TEXT NOT NULL,
    tool_calls      TEXT,                    -- JSON: [{name, args, id}]
    tool_results    TEXT,                    -- JSON: [{tool_call_id, result, error}]
    model           TEXT,                    -- 生成此消息的 LLM
    input_tokens    INTEGER,
    output_tokens   INTEGER,
    created_at      INTEGER NOT NULL
);

CREATE INDEX idx_messages_conv_created
    ON messages(conversation_id, created_at);

CREATE VIRTUAL TABLE messages_fts USING fts5(
    content, content='messages', content_rowid='rowid'
);