-- 0005_compaction_entries.sql — ADR-0040: 压缩 entries 持久化底座。
-- 存储对话压缩操作的元数据，用于 context 压缩生命周期管理。

CREATE TABLE compaction_entries (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  model TEXT NOT NULL,
  tokens_before INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('auto','manual')),
  created_at INTEGER NOT NULL,
  first_kept_message_id TEXT NOT NULL
);

CREATE INDEX idx_compaction_entries_conv_time
  ON compaction_entries(conversation_id, created_at);
