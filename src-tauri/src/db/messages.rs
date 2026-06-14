//! 消息 CRUD，FTS5 同步在同一事务中。
//!
//! ## FTS5 同步契约
//! 每次写入 `messages` 必须同步更新 `messages_fts`（在同一事务中），
//! 以便 FTS 索引始终与源表一致。模式如下：
//!
//! ```ignore
//! let mut tx = pool.begin().await?;
//! let row = sqlx::query("INSERT INTO messages ...") .fetch_one(&mut *tx)?;
//! let rowid: i64 = row.try_get("rowid")?;
//! sqlx::query("INSERT INTO messages_fts(rowid, content) VALUES (?, ?)")
//!     .bind(rowid)
//!     .bind(&msg.content)
//!     .execute(&mut *tx)?;
//! tx.commit().await?;
//! ```
//!
//! 暴露的函数：
//! - `append_message` – INSERT + FTS5 同步（单事务）
//! - `list_messages`  – ORDER BY created_at ASC
//! - `get_message`     – 按 UUID
//! - `delete_message`  – 在同一事务中 DELETE FTS5 + message
//! - `search_messages` – FTS5 MATCH 查询

use chrono::{DateTime, TimeZone, Utc};
use serde::Serialize;
use sqlx::{Row, SqlitePool};
use sqlx::sqlite::SqliteRow;
use uuid::Uuid;

/// 在 SQLite 中存储的消息行。
#[derive(Debug, Clone, Serialize)]
pub struct Message {
    pub id: Uuid,
    pub conversation_id: Uuid,
    pub role: String,
    pub content: String,
    pub tool_calls: Option<String>,
    pub tool_results: Option<String>,
    pub model: Option<String>,
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub created_at: DateTime<Utc>,
}

// ─────────────────────────────────────────────────────────────────────────────
// 内部辅助函数
// ─────────────────────────────────────────────────────────────────────────────

/// 从 sqlx `Row` 构建 `Message`（避免重复列名）。
fn row_to_message(row: &SqliteRow) -> Result<Message, sqlx::Error> {
    let created_at_i64: i64 = row.try_get("created_at")?;
    let created_at = Utc.timestamp_opt(created_at_i64, 0).single().unwrap_or_default();
    Ok(Message {
        id: Uuid::parse_str(&row.try_get::<String, _>("id")?).expect("DB 中无效的 UUID"),
        conversation_id: Uuid::parse_str(&row.try_get::<String, _>("conversation_id")?)
            .expect("DB 中无效的 UUID"),
        role: row.try_get("role")?,
        content: row.try_get("content")?,
        tool_calls: row.try_get("tool_calls")?,
        tool_results: row.try_get("tool_results")?,
        model: row.try_get("model")?,
        input_tokens: row.try_get("input_tokens")?,
        output_tokens: row.try_get("output_tokens")?,
        created_at,
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// 公共 API
// ─────────────────────────────────────────────────────────────────────────────

/// 追加消息并在同一事务中将其内容同步到 FTS5。
pub async fn append_message(
    pool: &SqlitePool,
    conversation_id: Uuid,
    role: &str,
    content: &str,
    tool_calls: Option<&str>,
    tool_results: Option<&str>,
    model: Option<&str>,
    input_tokens: Option<i64>,
    output_tokens: Option<i64>,
) -> Result<Message, sqlx::Error> {
    let id = Uuid::new_v4();
    let created_at = Utc::now().timestamp();

    let mut tx = pool.begin().await?;

    let row = sqlx::query(
        r#"
        INSERT INTO messages
          (id, conversation_id, role, content, tool_calls, tool_results,
           model, input_tokens, output_tokens, created_at)
        VALUES
          (?,   ?,               ?,   ?,       ?,           ?,           ?,    ?,           ?,           ?)
        RETURNING rowid
        "#,
    )
    .bind(id.to_string())
    .bind(conversation_id.to_string())
    .bind(role)
    .bind(content)
    .bind(tool_calls)
    .bind(tool_results)
    .bind(model)
    .bind(input_tokens)
    .bind(output_tokens)
    .bind(created_at)
    .fetch_one(&mut *tx)
    .await?;

    let rowid: i64 = row.try_get("rowid")?;

    // 同步到 FTS5
    sqlx::query("INSERT INTO messages_fts(rowid, content) VALUES (?, ?)")
        .bind(rowid)
        .bind(content)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(Message {
        id,
        conversation_id,
        role: role.to_string(),
        content: content.to_string(),
        tool_calls: tool_calls.map(String::from),
        tool_results: tool_results.map(String::from),
        model: model.map(String::from),
        input_tokens,
        output_tokens,
        created_at: Utc.timestamp_opt(created_at, 0).single().unwrap_or_default(),
    })
}

/// 列出会话的所有消息，按创建时间升序排列。
pub async fn list_messages(
    pool: &SqlitePool,
    conversation_id: &Uuid,
) -> Result<Vec<Message>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT id, conversation_id, role, content, tool_calls, tool_results,
               model, input_tokens, output_tokens, created_at
        FROM   messages
        WHERE  conversation_id = ?
        ORDER BY created_at ASC
        "#,
    )
    .bind(conversation_id.to_string())
    .fetch_all(pool)
    .await?;

    rows.iter().map(row_to_message).collect()
}

/// 按 id 获取单条消息。未找到时返回 `Ok(None)`。
pub async fn get_message(pool: &SqlitePool, id: &Uuid) -> Result<Option<Message>, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT id, conversation_id, role, content, tool_calls, tool_results,
               model, input_tokens, output_tokens, created_at
        FROM   messages
        WHERE  id = ?
        "#,
    )
    .bind(id.to_string())
    .fetch_optional(pool)
    .await?;

    match row {
        Some(r) => Ok(Some(row_to_message(&r)?)),
        None => Ok(None),
    }
}

/// 在同一事务中删除消息及其 FTS5 条目。
pub async fn delete_message(pool: &SqlitePool, id: &Uuid) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;

    // 删除前查找 rowid 以便清理 FTS5。
    let row = sqlx::query("SELECT rowid FROM messages WHERE id = ?")
        .bind(id.to_string())
        .fetch_optional(&mut *tx)
        .await?;

    if let Some(r) = row {
        let rowid: i64 = r.try_get("rowid")?;
        sqlx::query("DELETE FROM messages_fts WHERE rowid = ?")
            .bind(rowid)
            .execute(&mut *tx)
            .await?;
    }

    sqlx::query("DELETE FROM messages WHERE id = ?")
        .bind(id.to_string())
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(())
}

/// 使用 FTS5 MATCH 对消息内容进行全文搜索。
/// 未找到结果或查询为空时返回空 vec。
pub async fn search_messages(
    pool: &SqlitePool,
    query: &str,
    limit: u32,
) -> Result<Vec<Message>, sqlx::Error> {
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let rows = sqlx::query(
        r#"
        SELECT m.id, m.conversation_id, m.role, m.content,
               m.tool_calls, m.tool_results, m.model,
               m.input_tokens, m.output_tokens, m.created_at
        FROM   messages m
        INNER JOIN messages_fts f ON m.rowid = f.rowid
        WHERE  messages_fts MATCH ?
        ORDER BY rank
        LIMIT  ?
        "#,
    )
    .bind(query)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    rows.iter().map(row_to_message).collect()
}

// ─────────────────────────────────────────────────────────────────────────────
// 测试
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    // 返回应用了 schema 的全新内存 SQLite 池。
    async fn fresh_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();

        // 按 schema.sql 中的定义创建 schema
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS conversations (
                id              TEXT PRIMARY KEY,
                title           TEXT NOT NULL,
                system_prompt   TEXT,
                created_at      INTEGER NOT NULL,
                updated_at      INTEGER NOT NULL,
                archived_at     INTEGER
            );
            CREATE TABLE IF NOT EXISTS messages (
                id              TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                role            TEXT NOT NULL,
                content         TEXT NOT NULL,
                tool_calls      TEXT,
                tool_results    TEXT,
                model           TEXT,
                input_tokens    INTEGER,
                output_tokens   INTEGER,
                created_at      INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_messages_conv_created
                ON messages(conversation_id, created_at);
            CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts
                USING fts5(content, content='messages', content_rowid='rowid');
            "#,
        )
        .execute(&pool)
        .await
        .unwrap();

        pool
    }

    #[tokio::test]
    async fn append_and_list_round_trip() {
        let pool = fresh_pool().await;
        let conv_id = Uuid::new_v4();

        // 先插入会话（消息引用它）。
        sqlx::query("INSERT INTO conversations (id,title,created_at,updated_at) VALUES (?,?,?,?)")
            .bind(conv_id.to_string())
            .bind("test conv")
            .bind(Utc::now().timestamp())
            .bind(Utc::now().timestamp())
            .execute(&pool)
            .await
            .unwrap();

        let m1 = append_message(
            &pool, conv_id, "user", "hello world", None, None, None, None, None,
        )
        .await
        .unwrap();

        let m2 = append_message(
            &pool, conv_id, "assistant", "hi there!", None, None, None, None, None,
        )
        .await
        .unwrap();

        let msgs = list_messages(&pool, &conv_id).await.unwrap();

        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[0].id, m1.id);
        assert_eq!(msgs[0].role, "user");
        assert_eq!(msgs[1].id, m2.id);
        assert_eq!(msgs[1].role, "assistant");
        // ASC 顺序：第一条消息应有更早的 created_at
        assert!(msgs[0].created_at <= msgs[1].created_at);
    }

    #[tokio::test]
    async fn append_and_search_returns_message() {
        let pool = fresh_pool().await;
        let conv_id = Uuid::new_v4();

        sqlx::query("INSERT INTO conversations (id,title,created_at,updated_at) VALUES (?,?,?,?)")
            .bind(conv_id.to_string())
            .bind("search test")
            .bind(Utc::now().timestamp())
            .bind(Utc::now().timestamp())
            .execute(&pool)
            .await
            .unwrap();

        append_message(
            &pool, conv_id, "user", "the quick brown fox", None, None, None, None, None,
        )
        .await
        .unwrap();

        append_message(
            &pool, conv_id, "user", "jumps over the lazy dog", None, None, None, None, None,
        )
        .await
        .unwrap();

        let results = search_messages(&pool, "quick", 10).await.unwrap();

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].content, "the quick brown fox");
    }

    #[tokio::test]
    async fn append_delete_removes_from_fts() {
        let pool = fresh_pool().await;
        let conv_id = Uuid::new_v4();

        sqlx::query("INSERT INTO conversations (id,title,created_at,updated_at) VALUES (?,?,?,?)")
            .bind(conv_id.to_string())
            .bind("delete test")
            .bind(Utc::now().timestamp())
            .bind(Utc::now().timestamp())
            .execute(&pool)
            .await
            .unwrap();

        let msg = append_message(
            &pool, conv_id, "user", "secret password xyz123", None, None, None, None, None,
        )
        .await
        .unwrap();

        // 删除前验证它可被搜索
        let before = search_messages(&pool, "password", 10).await.unwrap();
        assert_eq!(before.len(), 1);

        delete_message(&pool, &msg.id).await.unwrap();

        // 删除后，FTS5 搜索应返回空
        let after = search_messages(&pool, "password", 10).await.unwrap();
        assert!(after.is_empty(), "删除的消息不应出现在 FTS5 结果中");
    }

    #[tokio::test]
    async fn search_is_case_insensitive() {
        let pool = fresh_pool().await;
        let conv_id = Uuid::new_v4();

        sqlx::query("INSERT INTO conversations (id,title,created_at,updated_at) VALUES (?,?,?,?)")
            .bind(conv_id.to_string())
            .bind("case test")
            .bind(Utc::now().timestamp())
            .bind(Utc::now().timestamp())
            .execute(&pool)
            .await
            .unwrap();

        append_message(
            &pool, conv_id, "user", "HELLO WORLD", None, None, None, None, None,
        )
        .await
        .unwrap();

        let lower = search_messages(&pool, "hello", 10).await.unwrap();
        assert_eq!(lower.len(), 1, "小写查询应匹配大写内容");

        let upper = search_messages(&pool, "HELLO", 10).await.unwrap();
        assert_eq!(upper.len(), 1, "大写查询应匹配大写内容");
    }

    #[tokio::test]
    async fn search_with_empty_query_returns_empty() {
        let pool = fresh_pool().await;
        let conv_id = Uuid::new_v4();

        sqlx::query("INSERT INTO conversations (id,title,created_at,updated_at) VALUES (?,?,?,?)")
            .bind(conv_id.to_string())
            .bind("empty query test")
            .bind(Utc::now().timestamp())
            .bind(Utc::now().timestamp())
            .execute(&pool)
            .await
            .unwrap();

        append_message(
            &pool, conv_id, "user", "some content", None, None, None, None, None,
        )
        .await
        .unwrap();

        let results = search_messages(&pool, "", 10).await.unwrap();
        assert!(results.is_empty(), "空查询应返回无结果");
    }

    #[tokio::test]
    async fn search_respects_limit() {
        let pool = fresh_pool().await;
        let conv_id = Uuid::new_v4();

        sqlx::query("INSERT INTO conversations (id,title,created_at,updated_at) VALUES (?,?,?,?)")
            .bind(conv_id.to_string())
            .bind("limit test")
            .bind(Utc::now().timestamp())
            .bind(Utc::now().timestamp())
            .execute(&pool)
            .await
            .unwrap();

        for i in 0..5 {
            append_message(
                &pool,
                conv_id,
                "user",
                &format!("message number {}", i),
                None,
                None,
                None,
                None,
                None,
            )
            .await
            .unwrap();
        }

        let results = search_messages(&pool, "message", 3).await.unwrap();
        assert_eq!(results.len(), 3, "搜索应遵守 limit");
    }
}
