//! 数据库层 – SQLite + FTS5。
//!
//! Schema 位于 `schema.sql`；迁移位于 `migrations/`。
//! 子模块镜像 schema 表。

use sqlx::{SqlitePool, sqlite::SqlitePoolOptions};
use tauri::{AppHandle, Manager};

pub mod conversations;
pub mod messages;

pub async fn init(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::migrate!("./src/db/migrations")
        .run(pool)
        .await
        .map_err(|e| sqlx::Error::Migrate(Box::new(e)))
}

/// 在 `<app_data_dir>/codeman-agent.db` 打开 SQLite 连接池并
/// 运行迁移。如果应用数据目录不存在则创建它。
pub async fn connect(app: &AppHandle) -> Result<SqlitePool, sqlx::Error> {
    let dir = app.path().app_data_dir().expect("应用数据目录");
    std::fs::create_dir_all(&dir).expect("创建应用数据目录");
    let db_path = dir.join("codeman-agent.db");
    let url = format!("sqlite://{}?mode=rwc", db_path.display());
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&url)
        .await?;
    init(&pool).await?;
    Ok(pool)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn migrations_run_on_memory() {
        // sqlite::memory：创建每个连接的内存数据库
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        init(&pool).await.expect("迁移应当成功");
        // 迁移后，在空 DB 上列出会话应返回 Ok(空 vec)
        let list = super::conversations::list_conversations(&pool, false)
            .await
            .expect("list_conversations 应当在迁移后的 DB 上成功");
        assert!(list.is_empty(), "期望空 vec，得到 {list:?}");
    }

    #[tokio::test]
    async fn running_migrations_twice_is_idempotent() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        init(&pool).await.expect("首次初始化成功");
        init(&pool).await.expect("第二次初始化也应成功");
        // 验证双重初始化后 DB 仍可用
        let list = super::conversations::list_conversations(&pool, false)
            .await
            .expect("双重初始化后 list_conversations 应仍能工作");
        assert!(list.is_empty());
    }
}
