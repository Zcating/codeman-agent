//! Message CRUD with FTS5 sync in the same transaction.
//!
//! ## FTS5 sync contract
//! Every write to `messages` must同步更新 `messages_fts` in the **same**
//! transaction so that the FTS index is always consistent with the source
//! table.  The pattern is:
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
//! Functions exposed:
//! - `append_message` – INSERT + FTS5 sync (single tx)
//! - `list_messages`  – ORDER BY created_at ASC
//! - `get_message`     – by UUID
//! - `delete_message`  – DELETE FTS5 + message in same tx
//! - `search_messages` – FTS5 MATCH query

use chrono::{DateTime, TimeZone, Utc};
use sqlx::{Row, SqlitePool};
use sqlx::sqlite::SqliteRow;
use uuid::Uuid;

/// A message row as stored in SQLite.
#[derive(Debug, Clone)]
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
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/// Build a `Message` from a sqlx `Row` (avoids repeating column names).
fn row_to_message(row: &SqliteRow) -> Result<Message, sqlx::Error> {
    let created_at_i64: i64 = row.try_get("created_at")?;
    let created_at = Utc.timestamp_opt(created_at_i64, 0).single().unwrap_or_default();
    Ok(Message {
        id: Uuid::parse_str(&row.try_get::<String, _>("id")?).expect("invalid uuid in DB"),
        conversation_id: Uuid::parse_str(&row.try_get::<String, _>("conversation_id")?)
            .expect("invalid uuid in DB"),
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
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/// Append a message and sync its content to FTS5 in the same transaction.
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

    // Sync to FTS5
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

/// List all messages for a conversation, ordered by creation time ascending.
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

/// Fetch a single message by id. Returns `Ok(None)` if not found.
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

/// Delete a message and its FTS5 entry in the same transaction.
pub async fn delete_message(pool: &SqlitePool, id: &Uuid) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;

    // Look up the rowid before deleting so we can clean up FTS5.
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

/// Full-text search across message content using FTS5 MATCH.
/// Returns an empty vec when no results are found.
pub async fn search_messages(
    pool: &SqlitePool,
    query: &str,
    limit: u32,
) -> Result<Vec<Message>, sqlx::Error> {
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
// Tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    // Returns a fresh in-memory SQLite pool with the schema applied.
    async fn fresh_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();

        // Create schema exactly as defined in schema.sql
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

        // Insert a conversation first (messages references it).
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
        // ASC order: first message should have earlier created_at
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

        // Verify it is searchable before delete
        let before = search_messages(&pool, "password", 10).await.unwrap();
        assert_eq!(before.len(), 1);

        delete_message(&pool, &msg.id).await.unwrap();

        // After delete, FTS5 search should return nothing
        let after = search_messages(&pool, "password", 10).await.unwrap();
        assert!(after.is_empty(), "deleted message should not appear in FTS5 results");
    }
}
