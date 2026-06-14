//! 会话 CRUD — 在 SqlitePool 上的运行时 sqlx 查询。
//!
//! 所有时间戳以 UNIX epoch 秒存储在 INTEGER 列中。
//! Rust API 中使用 chrono DateTime<Utc>。

use chrono::{DateTime, TimeZone, Utc};
use serde::Serialize;
use sqlx::SqlitePool;
use uuid::Uuid;

/// 匹配 D1 schema 的会话行。
///
/// `id` 在 SQLite TEXT 中存储为 UUID 字符串。
#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub system_prompt: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub archived_at: Option<i64>,
}

impl Conversation {
    /// 将 `id` 解析为 Uuid。
    pub fn id(&self) -> Uuid {
        Uuid::parse_str(&self.id).expect("DB 中的有效 UUID")
    }

    /// 从 UNIX epoch 秒解析 `created_at`。
    pub fn created_at_datetime(&self) -> DateTime<Utc> {
        Utc.timestamp_opt(self.created_at, 0).unwrap()
    }

    /// 从 UNIX epoch 秒解析 `updated_at`。
    pub fn updated_at_datetime(&self) -> DateTime<Utc> {
        Utc.timestamp_opt(self.updated_at, 0).unwrap()
    }

    /// 从 UNIX epoch 秒解析 `archived_at`（如果设置）。
    pub fn archived_at_datetime(&self) -> Option<DateTime<Utc>> {
        self.archived_at.map(|ts| Utc.timestamp_opt(ts, 0).unwrap())
    }

    /// 会话被软删除（归档）时返回 true。
    pub fn is_archived(&self) -> bool {
        self.archived_at.is_some()
    }
}

/// 插入新会话，返回完整行。
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
        RETURNING *
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

/// 按 id 获取单个会话，未找到则返回 None。
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

/// 列出会话，按 `updated_at DESC` 排序。
/// 传入 `include_archived = false` 以排除软删除行。
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

/// 仅更新现有会话的标题。
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

/// 软删除：将 `archived_at` 设为当前时间戳。
pub async fn archive_conversation(pool: &SqlitePool, id: &Uuid) -> Result<(), sqlx::Error> {
    let now = Utc::now().timestamp();
    sqlx::query("UPDATE conversations SET archived_at = $1 WHERE id = $2")
        .bind(now)
        .bind(id.to_string())
        .execute(pool)
        .await?;
    Ok(())
}

/// 按 id 硬删除会话。
/// 消息通过 FK 约束级联删除。
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

    /// 构建内存池并运行初始迁移。
    async fn make_pool() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        // 为测试创建 schema
        sqlx::query(include_str!("schema.sql"))
            .execute(&pool)
            .await
            .expect("schema 迁移");
        pool
    }

    #[tokio::test]
    async fn create_and_get() {
        let pool = make_pool().await;
        let created = create_conversation(&pool, "Test Title", Some("system prompt"))
            .await
            .expect("创建成功");
        assert_eq!(created.title, "Test Title");
        assert_eq!(created.system_prompt.as_deref(), Some("system prompt"));
        assert!(!created.is_archived());

        let id = created.id();
        let fetched = get_conversation(&pool, &id)
            .await
            .expect("获取成功")
            .expect("找到会话");
        assert_eq!(fetched.id, created.id);
        assert_eq!(fetched.title, "Test Title");
    }

    #[tokio::test]
    async fn list_empty_then_one() {
        let pool = make_pool().await;

        let list = list_conversations(&pool, false).await.expect("列出成功");
        assert!(list.is_empty());

        let created = create_conversation(&pool, "First", None)
            .await
            .expect("创建成功");
        let list = list_conversations(&pool, false).await.expect("列出成功");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, created.id);
    }

    #[tokio::test]
    async fn archive_excluded_by_default() {
        let pool = make_pool().await;
        let created = create_conversation(&pool, "To Archive", None)
            .await
            .expect("创建成功");

        archive_conversation(&pool, &created.id())
            .await
            .expect("归档成功");

        let all = list_conversations(&pool, true).await.expect("列出全部成功");
        assert_eq!(all.len(), 1);

        let active = list_conversations(&pool, false).await.expect("列出活跃成功");
        assert!(active.is_empty());
    }

    #[tokio::test]
    async fn update_title() {
        let pool = make_pool().await;
        let created = create_conversation(&pool, "Original Title", None)
            .await
            .expect("创建成功");
        let id = created.id();

        update_conversation_title(&pool, &id, "New Title")
            .await
            .expect("更新成功");

        let fetched = get_conversation(&pool, &id)
            .await
            .expect("获取成功")
            .expect("找到会话");
        assert_eq!(fetched.title, "New Title");
    }

    #[tokio::test]
    async fn hard_delete_cascades_to_messages() {
        let pool = make_pool().await;

        // 创建会话和消息
        let conv = create_conversation(&pool, "To Delete", None)
            .await
            .expect("创建会话");
        let conv_id = conv.id();

        // 手动插入消息以验证级联删除。
        let msg_id = Uuid::new_v4().to_string();
        let now = Utc::now().timestamp();
        sqlx::query(
            "INSERT INTO messages (id,conversation_id,role,content,created_at) VALUES (?,?,?,?,?)",
        )
        .bind(&msg_id)
        .bind(conv_id.to_string())
        .bind("user")
        .bind("hello world")
        .bind(now)
        .execute(&pool)
        .await
        .expect("插入消息");

        // 验证消息存在
        let before = sqlx::query("SELECT id FROM messages WHERE id = ?")
            .bind(&msg_id)
            .fetch_optional(&pool)
            .await
            .expect("检查消息");
        assert!(before.is_some(), "删除前消息应存在");

        // 硬删除会话
        hard_delete_conversation(&pool, &conv_id)
            .await
            .expect("硬删除成功");

        // 验证会话已删除
        let conv_after = get_conversation(&pool, &conv_id)
            .await
            .expect("删除后获取会话");
        assert!(conv_after.is_none(), "会话应被删除");

        // 验证消息已被级联删除
        let msg_after = sqlx::query("SELECT id FROM messages WHERE id = ?")
            .bind(&msg_id)
            .fetch_optional(&pool)
            .await
            .expect("删除后检查消息");
        assert!(msg_after.is_none(), "消息应随会话被级联删除");
    }
}
