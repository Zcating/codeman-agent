//! Database layer – SQLite + FTS5.
//!
//! Schema lives in `schema.sql`; migrations live in `migrations/`.
//! Sub-modules mirror the schema tables.

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

/// Open a SQLite connection pool at `<app_data_dir>/codeman-agent.db` and
/// run migrations. Creates the app data directory if it does not exist.
pub async fn connect(app: &AppHandle) -> Result<SqlitePool, sqlx::Error> {
    let dir = app.path().app_data_dir().expect("app data dir");
    std::fs::create_dir_all(&dir).expect("create app data dir");
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
        // sqlite::memory: creates a per-connection in-memory database
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        init(&pool).await.expect("migrations should succeed");
        // After migrations, listing conversations on an empty DB should return Ok(empty vec)
        let list = super::conversations::list_conversations(&pool, false)
            .await
            .expect("list_conversations should succeed on migrated DB");
        assert!(list.is_empty(), "expected empty vec, got {list:?}");
    }

    #[tokio::test]
    async fn running_migrations_twice_is_idempotent() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        init(&pool).await.expect("first init succeeds");
        init(&pool).await.expect("second init should also succeed");
        // Verify the DB is still usable after double init
        let list = super::conversations::list_conversations(&pool, false)
            .await
            .expect("list_conversations should still work after double init");
        assert!(list.is_empty());
    }
}
