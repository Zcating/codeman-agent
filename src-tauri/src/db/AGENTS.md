# src-tauri/src/db/ — SQLite + FTS5 持久化

对话和消息的本地持久化层。底层是 `sqlx 0.8`（`runtime-tokio + sqlite + chrono + uuid`），全文搜索走 SQLite **FTS5** 虚表（详见 ADR-0004）。所有 SQL 走 `sqlx::query!` / `sqlx::query_as!` 宏（编译期检查）。

## 目录布局

```
db/
├── mod.rs                 # SqlitePool 初始化 + connect() + migrations 引导
├── schema.sql             # 当前 schema 快照（参考用；权威来源是 migrations/）
├── conversations.rs       # Conversation CRUD（list / get / create / archive / delete）
├── messages.rs            # Message CRUD + FTS5 全文搜索
└── migrations/
    └── 0001_initial.sql   # V1 初始 schema（conversations + messages + messages_fts）
```

## Schema 概览

```sql
-- 简化版（实际权威见 migrations/0001_initial.sql）
CREATE TABLE conversations (
    id            TEXT PRIMARY KEY,           -- UUID v4
    title         TEXT NOT NULL,
    system_prompt TEXT,                       -- NULL = 继承 settings.system_prompt.default
    created_at    INTEGER NOT NULL,           -- unix epoch ms
    updated_at    INTEGER NOT NULL,
    archived_at   INTEGER                     -- NULL = 活跃；非 NULL = 已归档
);

CREATE TABLE messages (
    id              TEXT PRIMARY KEY,         -- UUID v4
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,            -- 'user' | 'assistant' | 'tool' | 'system'
    content         TEXT NOT NULL,
    tool_calls      TEXT,                     -- JSON 序列化（SQLite 不支持 JSONB 原生）
    tool_results    TEXT,
    model           TEXT,
    input_tokens    INTEGER,
    output_tokens   INTEGER,
    created_at      INTEGER NOT NULL
);

CREATE VIRTUAL TABLE messages_fts USING fts5(
    content,                                   -- 全文索引的列
    content='messages',                        -- external content
    content_rowid='rowid'
);

-- 触发器保持 FTS 同步（insert / update / delete）
```

数据库文件位置：`<app_data_dir>/codeman-agent.db`（`mod.rs::connect`）。`app_data_dir` 在 Windows 上是 `%LocalAppData%\codeman-agent\`。

## 硬性规则

- **所有 SQL 走 `sqlx::query!` / `sqlx::query_as!` 宏。** 编译期类型检查；运行时不需要 `query` / `query_as` 的非宏版本。`DATABASE_URL` 编译期要能连上**任一**数据库（CI 设 `sqlite::memory:` 或在 `.env` 提供路径），否则编译失败。
- **Migrations 只加不删。** 任何 schema 变更加 `migrations/000N_<verb>_<name>.sql`（顺序号续编）。**永远不要**改 `migrations/0001_initial.sql`——已经上线的 schema 是历史。
- **复杂 schema 变更用新建表 + 复制 + 改名。** 不要 `ALTER TABLE ... DROP COLUMN`（SQLite 老版本不支持）。命名 `000N_rebuild_<table>.sql` 走 sqlx migrate 链。
- **JSON 字段存 `TEXT`。** SQLite 没原生 JSONB；tool_calls / tool_results 在 Rust 侧用 `serde_json` 序列化。读出来反序列化。
- **时间戳存 unix epoch ms。** 用 `chrono::Utc::now().timestamp_millis()`。**不要**存 ISO 8601 字符串（索引 / 比较慢）。
- **ID 用 UUID v4。** `uuid::Uuid::new_v4().to_string()`。**不要**自增 INTEGER。
- **错误上抛 `sqlx::Error` → `AppError::Database`。** 在 `commands.rs` 边界映射；**不要**在 `db/*.rs` 内部 `unwrap`。
- **FTS5 内容表必须保持同步。** 改 messages 增删改时同时更新 `messages_fts`（用 `0001_initial.sql` 里的 trigger，**不要**业务层手动维护）。

## 模式

- **连接池：max 5 个连接。** `SqlitePoolOptions::new().max_connections(5).connect(&url).await`。SQLite 写串行；高并发场景靠队列。
- **迁移幂等。** `sqlx::migrate!` 内部用 `_sqlx_migrations` 表追踪，**自动跳过已执行的**。测试 `running_migrations_twice_is_idempotent` 守门（`mod.rs::tests`）。
- **软删除（archive）+ 硬删除（delete）。** `conversations::archive` 设 `archived_at`；`delete` 真删（CASCADE 触发 messages 删除）。V1 UI 默认 list 排除已归档。
- **列表查询支持 `include_archived: bool`。** `list_conversations(&pool, include_archived)` —— `true` 返回全部，`false` 返回 `archived_at IS NULL`。
- **FTS5 查询走 `messages::search_messages`。** `MATCH` 操作符；查询串要做 FTS5 转义（`"*"` 加权、通配符处理），详见 `messages.rs::escape_fts_query`。
- **测试用 `sqlite::memory:`。** `SqlitePool::connect("sqlite::memory:")`——每个测试连接独立数据库。**不要**用临时文件，IO 慢且并发不安全。

## 查阅指南

| 任务 | 文件 |
|---|---|
| 新增表 | `migrations/000N_<name>.sql` + `db/<table>.rs` 模块 + `mod.rs::pub mod` |
| 新增列 | `migrations/000N_add_<col>_to_<table>.sql`（**不要**改老 migration） |
| 改列类型 | `migrations/000N_rebuild_<table>.sql`（新建表 + 复制 + DROP 旧表 + 改名） |
| 新增 FTS 字段 | 改 messages 表 + 改 FTS 虚表 + 改 trigger；同 migration 文件 |
| 调试 SQL | `cargo test -- --nocapture` 看 `sqlx` 编译错误；`sqlite3 <db_path>` 直接跑 |
| 查 schema | `db/schema.sql`（**参考用**；权威是 migrations/） |
| 新增 IPC 调 DB | `commands.rs` 加 `#[tauri::command]` → `db/<table>.rs` 加函数 → 同步 TS 端 Service |

## 反模式（明确禁止）

- 改 `migrations/0001_initial.sql`——历史不可变。
- `sqlx::query("...")`（非宏版本）——失去编译期检查。
- 内部 `unwrap()` `sqlx::Error`——上抛 `Result<_, sqlx::Error>`，commands 层映射。
- 手动同步 `messages_fts`——业务层用 trigger 自动同步。
- `pool.acquire().await?` 后忘了 `drop`——用 scope 块或显式 `drop(conn)`。
- 跨连接持有 `Transaction`——`sqlx` 的 `&mut Transaction` 绑定连接生命周期，离开 scope 自动回滚/提交。
- 把 `chrono::DateTime` 存字符串——存 epoch ms。
- 存 INTEGER 自增 ID——用 UUID v4。
- 在 `db/*.rs` 调 `tauri::AppHandle`——DB 层不知道 Tauri。

## 测试

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::SqlitePool;

    async fn test_pool() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        crate::db::init(&pool).await.unwrap();
        pool
    }
}
```

- 纯函数测试用 `sqlite::memory:`。**不要**用临时文件。
- 测试间不共享 pool——每个 `#[test]` 各自 `SqlitePool::connect("sqlite::memory:")`。
- 触发器测试：插入 → 查 FTS → 断言命中。
- CASCADE 测试：删 conversation → 查 messages → 断言空。
