//! Workspace CRUD — 在 SqlitePool 上的运行时 sqlx 查询。
//!
//! D8-W: workspace 数据从 Settings JSON 迁移到 SQLite。

use serde::Serialize;
use sqlx::SqlitePool;
use uuid::Uuid;

/// D8-W workspace 行。
///
/// `id` 在 SQLite TEXT 中存储为 UUID 字符串。
#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
pub struct Workspace {
    pub id: String,
    pub label: String,
    pub root_path: String,
    pub created_at: i64,
}

impl Workspace {}

/// 插入新 workspace，返回完整行。
pub async fn create_workspace(
    pool: &SqlitePool,
    label: &str,
    root_path: &str,
) -> Result<Workspace, sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();

    sqlx::query_as::<_, Workspace>(
        r#"
        INSERT INTO workspaces (id, label, root_path, created_at)
        VALUES ($1, $2, $3, $4)
        RETURNING *
        "#,
    )
    .bind(&id)
    .bind(label)
    .bind(root_path)
    .bind(now)
    .fetch_one(pool)
    .await
}

/// 列出所有 workspace，按 `created_at DESC` 排序。
pub async fn list_workspaces(
    pool: &SqlitePool,
) -> Result<Vec<Workspace>, sqlx::Error> {
    sqlx::query_as::<_, Workspace>(
        "SELECT id, label, root_path, created_at FROM workspaces ORDER BY created_at DESC",
    )
    .fetch_all(pool)
    .await
}

/// 按 id 获取单个 workspace，未找到则返回 None。
pub async fn get_workspace_by_id(
    pool: &SqlitePool,
    id: &str,
) -> Result<Option<Workspace>, sqlx::Error> {
    sqlx::query_as::<_, Workspace>(
        "SELECT id, label, root_path, created_at FROM workspaces WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

/// 重命名 workspace。
pub async fn rename_workspace(
    pool: &SqlitePool,
    id: &str,
    label: &str,
) -> Result<(), sqlx::Error> {
    let result = sqlx::query("UPDATE workspaces SET label = $1 WHERE id = $2")
        .bind(label)
        .bind(id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(sqlx::Error::RowNotFound);
    }
    Ok(())
}

/// 删除 workspace，同时通过 CASCADE 删除关联的 conversations。
pub async fn delete_workspace(
    pool: &SqlitePool,
    id: &str,
) -> Result<(), sqlx::Error> {
    // 先删除关联的 conversations（CASCADE FK 会在 DB 层处理，但显式删确保行为）
    sqlx::query("DELETE FROM conversations WHERE workspace_id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM workspaces WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 构建内存池并运行迁移。
    async fn make_pool() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        crate::db::init(&pool).await.expect("迁移失败");
        pool
    }

    #[tokio::test]
    async fn create_workspace_returns_inserted_row() {
        let pool = make_pool().await;
        let created = create_workspace(&pool, "Test Workspace", "/tmp/test")
            .await
            .expect("创建成功");
        assert_eq!(created.label, "Test Workspace");
        assert_eq!(created.root_path, "/tmp/test");
        assert!(!created.id.is_empty());
    }

    #[tokio::test]
    async fn create_workspace_rejects_duplicate_root_path() {
        let pool = make_pool().await;
        create_workspace(&pool, "First", "/tmp/duplicate")
            .await
            .expect("创建第一个成功");

        let dup = create_workspace(&pool, "Second", "/tmp/duplicate").await;
        assert!(dup.is_err(), "重复 root_path 应返回错误");
    }

    #[tokio::test]
    async fn list_workspaces_orders_by_created_at_desc() {
        let pool = make_pool().await;

        let first = create_workspace(&pool, "First", "/tmp/first")
            .await
            .expect("创建第一个成功");
        // 等待 1 秒确保 timestamp 不同
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        let second = create_workspace(&pool, "Second", "/tmp/second")
            .await
            .expect("创建第二个成功");

        let list = list_workspaces(&pool).await.expect("列出成功");
        assert_eq!(list.len(), 2);
        // 最新创建的应该在最前面
        assert_eq!(list[0].id, second.id);
        assert_eq!(list[1].id, first.id);
    }

    #[tokio::test]
    async fn get_workspace_by_id_returns_none_for_unknown_id() {
        let pool = make_pool().await;
        let result = get_workspace_by_id(&pool, "unknown-id")
            .await
            .expect("查询成功");
        assert!(result.is_none(), "未知 ID 应返回 None");
    }

    #[tokio::test]
    async fn get_workspace_by_id_returns_existing_workspace() {
        let pool = make_pool().await;
        let created = create_workspace(&pool, "Test", "/tmp/test-id")
            .await
            .expect("创建成功");

        let found = get_workspace_by_id(&pool, &created.id)
            .await
            .expect("查询成功");

        assert!(found.is_some(), "已存在的 workspace 应返回 Some");
        let found = found.unwrap();
        assert_eq!(found.id, created.id);
        assert_eq!(found.label, "Test");
        assert_eq!(found.root_path, "/tmp/test-id");
    }

    #[tokio::test]
    async fn rename_workspace_updates_label() {
        let pool = make_pool().await;
        let created = create_workspace(&pool, "Original", "/tmp/rename")
            .await
            .expect("创建成功");

        rename_workspace(&pool, &created.id, "Renamed")
            .await
            .expect("重命名成功");

        let list = list_workspaces(&pool).await.expect("列出成功");
        assert_eq!(list[0].label, "Renamed");
        assert_eq!(list[0].id, created.id);
    }

    #[tokio::test]
    async fn rename_workspace_returns_error_for_unknown_id() {
        let pool = make_pool().await;
        let result = rename_workspace(&pool, "unknown-id", "New Label").await;
        assert!(result.is_err(), "未知 ID 应返回错误");
    }

    #[tokio::test]
    async fn delete_workspace_removes_row() {
        let pool = make_pool().await;
        let created = create_workspace(&pool, "To Delete", "/tmp/delete")
            .await
            .expect("创建成功");

        delete_workspace(&pool, &created.id)
            .await
            .expect("删除成功");

        let list = list_workspaces(&pool).await.expect("列出成功");
        assert!(list.is_empty(), "workspace 应被删除");
    }

    #[tokio::test]
    async fn delete_workspace_cascades_to_conversations() {
        let pool = make_pool().await;

        // 创建 workspace 和关联的 conversation
        let ws = create_workspace(&pool, "Cascade Test", "/tmp/cascade")
            .await
            .expect("创建 workspace");

        // 创建关联的 conversation
        let conv_id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp();
        sqlx::query(
            "INSERT INTO conversations (id, title, workspace_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(&conv_id)
        .bind("Test Conv")
        .bind(&ws.id)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .expect("创建 conversation");

        // 验证 conversation 存在
        let conv_before = sqlx::query("SELECT id FROM conversations WHERE id = ?")
            .bind(&conv_id)
            .fetch_optional(&pool)
            .await
            .expect("检查 conversation");
        assert!(conv_before.is_some(), "删除前 conversation 应存在");

        // 删除 workspace
        delete_workspace(&pool, &ws.id)
            .await
            .expect("删除成功");

        // 验证 conversation 已被 CASCADE 删除
        let conv_after = sqlx::query("SELECT id FROM conversations WHERE id = ?")
            .bind(&conv_id)
            .fetch_optional(&pool)
            .await
            .expect("删除后检查 conversation");
        assert!(conv_after.is_none(), "conversation 应随 workspace CASCADE 删除");
    }

    #[tokio::test]
    async fn migration_creates_workspaces_table() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        crate::db::init(&pool).await.expect("迁移成功");

        // 验证表存在
        let table_exists = sqlx::query(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='workspaces'",
        )
        .fetch_optional(&pool)
        .await
        .expect("查询表存在性");
        assert!(table_exists.is_some(), "workspaces 表应存在");

        // 验证索引存在
        let index_exists = sqlx::query(
            "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_workspaces_created_at'",
        )
        .fetch_optional(&pool)
        .await
        .expect("查询索引存在性");
        assert!(index_exists.is_some(), "idx_workspaces_created_at 索引应存在");
    }
}
