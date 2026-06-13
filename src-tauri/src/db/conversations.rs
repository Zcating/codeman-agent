//! Conversations CRUD — runtime sqlx queries on SqlitePool.
//!
//! All timestamps are stored as UNIX epoch seconds in INTEGER columns.
//! chrono DateTime<Utc> is used in the Rust API.

use chrono::{DateTime, TimeZone, Utc};
use sqlx::SqlitePool;
use uuid::Uuid;

/// A conversation row matching the D1 schema.
///
/// `id` is stored as a UUID string in SQLite TEXT.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub system_prompt: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub archived_at: Option<i64>,
}

impl Conversation {
    /// Parse `id` as a Uuid.
    pub fn id(&self) -> Uuid {
        Uuid::parse_str(&self.id).expect("valid uuid in DB")
    }

    /// Parse `created_at` from UNIX epoch seconds.
    pub fn created_at_datetime(&self) -> DateTime<Utc> {
        Utc.timestamp_opt(self.created_at, 0).unwrap()
    }

    /// Parse `updated_at` from UNIX epoch seconds.
    pub fn updated_at_datetime(&self) -> DateTime<Utc> {
        Utc.timestamp_opt(self.updated_at, 0).unwrap()
    }

    /// Parse `archived_at` from UNIX epoch seconds, if set.
    pub fn archived_at_datetime(&self) -> Option<DateTime<Utc>> {
        self.archived_at.map(|ts| Utc.timestamp_opt(ts, 0).unwrap())
    }

    /// Returns true when the conversation is soft-deleted (archived).
    pub fn is_archived(&self) -> bool {
        self.archived_at.is_some()
    }
}

/// Insert a new conversation, returning the full row.
pub async fn create_conversation(
    pool: &SqlitePool,
    title: &str,
    system_prompt: Option<&str>,
) -> Result<Conversation, sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    sqlx::query_as::<_, Conversation>(
        r#"
        INSERT INTO conversations (id, title, system_prompt, created_at, updated_at, archived_at)
        VALUES ($1, $2, $3, $4, $5, NULL)
        "#,
    )
    .bind(&id)
    .bind(title)
    .bind(system_prompt)
    .bind(now)
    .bind(now)
    .fetch_one(pool)
    .await
}

/// Fetch a single conversation by id, or None if not found.
pub async fn get_conversation(
    pool: &SqlitePool,
    id: &Uuid,
) -> Result<Option<Conversation>, sqlx::Error> {
    sqlx::query_as::<_, Conversation>(
        "SELECT id, title, system_prompt, created_at, updated_at, archived_at FROM conversations WHERE id = $1",
    )
    .bind(id.to_string())
    .fetch_optional(pool)
    .await
}

/// List conversations ordered by `updated_at DESC`.
/// Pass `include_archived = false` to exclude soft-deleted rows.
pub async fn list_conversations(
    pool: &SqlitePool,
    include_archived: bool,
) -> Result<Vec<Conversation>, sqlx::Error> {
    if include_archived {
        sqlx::query_as::<_, Conversation>(
            "SELECT id, title, system_prompt, created_at, updated_at, archived_at FROM conversations ORDER BY updated_at DESC",
        )
        .fetch_all(pool)
        .await
    } else {
        sqlx::query_as::<_, Conversation>(
            "SELECT id, title, system_prompt, created_at, updated_at, archived_at FROM conversations WHERE archived_at IS NULL ORDER BY updated_at DESC",
        )
        .fetch_all(pool)
        .await
    }
}

/// Update only the title of an existing conversation.
pub async fn update_conversation_title(
    pool: &SqlitePool,
    id: &Uuid,
    title: &str,
) -> Result<(), sqlx::Error> {
    let now = Utc::now().timestamp();
    sqlx::query(
        "UPDATE conversations SET title = $1, updated_at = $2 WHERE id = $3",
    )
    .bind(title)
    .bind(now)
    .bind(id.to_string())
    .execute(pool)
    .await?;
    Ok(())
}

/// Soft-delete: set `archived_at` to the current timestamp.
pub async fn archive_conversation(pool: &SqlitePool, id: &Uuid) -> Result<(), sqlx::Error> {
    let now = Utc::now().timestamp();
    sqlx::query("UPDATE conversations SET archived_at = $1 WHERE id = $2")
        .bind(now)
        .bind(id.to_string())
        .execute(pool)
        .await?;
    Ok(())
}

/// Hard-delete a conversation by id.
/// Messages are cascade-deleted via the FK constraint.
pub async fn hard_delete_conversation(pool: &SqlitePool, id: &Uuid) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM conversations WHERE id = $1")
        .bind(id.to_string())
        .execute(pool)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build an in-memory pool and run the initial migration.
    async fn make_pool() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        // Create the schema for tests
        sqlx::query(include_str!("schema.sql"))
            .execute(&pool)
            .await
            .expect("schema migration");
        pool
    }

    #[tokio::test]
    async fn create_and_get() {
        let pool = make_pool().await;
        let created = create_conversation(&pool, "Test Title", Some("system prompt"))
            .await
            .expect("create succeeds");
        assert_eq!(created.title, "Test Title");
        assert_eq!(created.system_prompt.as_deref(), Some("system prompt"));
        assert!(!created.is_archived());

        let id = created.id();
        let fetched = get_conversation(&pool, &id)
            .await
            .expect("get succeeds")
            .expect("conversation found");
        assert_eq!(fetched.id, created.id);
        assert_eq!(fetched.title, "Test Title");
    }

    #[tokio::test]
    async fn list_empty_then_one() {
        let pool = make_pool().await;

        let list = list_conversations(&pool, false).await.expect("list succeeds");
        assert!(list.is_empty());

        let created = create_conversation(&pool, "First", None)
            .await
            .expect("create succeeds");
        let list = list_conversations(&pool, false).await.expect("list succeeds");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, created.id);
    }

    #[tokio::test]
    async fn archive_excluded_by_default() {
        let pool = make_pool().await;
        let created = create_conversation(&pool, "To Archive", None)
            .await
            .expect("create succeeds");

        archive_conversation(&pool, &created.id())
            .await
            .expect("archive succeeds");

        let all = list_conversations(&pool, true).await.expect("list all succeeds");
        assert_eq!(all.len(), 1);

        let active = list_conversations(&pool, false).await.expect("list active succeeds");
        assert!(active.is_empty());
    }
}
