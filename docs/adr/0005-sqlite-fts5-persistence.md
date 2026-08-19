# ADR 0004 — SQLite + FTS5 会话持久化

- Status: Accepted
- Date: 2026-06-13
- Scope: codeman-agent V1 存储层
- Related: ADR 0003 (Effect-TS 存储层)

## Context

V1 引入了持久化会话，支持跨用户全部历史的全文搜索。旧的 V0 除了单个活动快照外不保留任何历史。我们需要一个存储底层，支持线性消息存储、快速全文搜索、跨版本迁移，且留在 Rust 进程内（密钥永不泄漏，TS 代码不依赖第三方 DB 服务）。

## Decision

在 **SQLite** 中持久化会话和消息（SQLite 由 Rust 进程拥有），通过 Tauri IPC 命令从 TypeScript 访问。搜索使用 **SQLite FTS5**，内容从 `messages` 表镜像。Rust 使用 `sqlx`（编译时检查查询、异步友好、无额外构建步骤），附带 `schema.sql` 和编号迁移文件。

## Schema (V1, "D1" 形态)

```sql
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
```

## Considered options

- **P1（已选）— Rust 侧的 SQLite + FTS5。** 标准、快速、开箱即用的全文搜索、迁移简单、Rust 进程拥有数据。
- **P2 — per-conversation JSON 文件。** 拒绝。搜索是文件的 O(n)；迁移手动；备份按文件。毫无意义的复杂性。
- **P3 — webview 侧的 IndexedDB。** 拒绝。破坏"Rust 拥有密钥和存储"的边界；数据无法在 webview 重置后存活；对可能想查询历史的 Rust 端工具实现没有帮助。
- **P4 — Tauri Store JSON 单文件。** 拒绝。扩展性差，过不了几百条消息；全文搜索需要手写。

## Consequences

- `Cargo.toml` 添加 `sqlx`，启用 `sqlite`、`runtime-tokio`、`chrono`、`uuid` features。锁定到特定 minor 版本；sqlx 在 minor 版本间会 break。
- Tauri IPC 新增约 7–10 个命令：`list_conversations`、`get_conversation`、`create_conversation`、`append_message`、`list_messages`、`delete_conversation`、`archive_conversation`、`search_conversations`，外加 `clear_all_history`（破坏性操作，不是查询）。
- Schema 通过 `src-tauri/src/db/migrations/` 中的编号迁移文件演进。Rust 侧在启动时运行它们；V1 之后绝不原地编辑 `schema.sql`。
- V1 **不**迁移旧的 V0 `settings.json`。V1 首次启动时，V0 设置被简单忽略；用户重新开始。（产品定义见 ADR 0005。）
- 软删除：删除会话设置 `archived_at`；每日后台 job 硬删除超过 `conversations.auto_archive_after_days`（默认 30 天）的归档项。
- `max_history`（默认 1000）限制*非归档*会话总数。超出时，最老的非归档会话被自动归档；若这使归档数量超过 1500 的硬上限，则硬删除最老的已归档会话。

## References

- SQLite FTS5: https://www.sqlite.org/fts5.html
- sqlx: https://github.com/launchbadge/sqlx
