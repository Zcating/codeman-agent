//! Tauri IPC 命令。每个命令都是围绕 `AppState` 方法的薄包装，
//! 以便布线保持集中。

pub mod filesystem;

use tauri_plugin_dialog::DialogExt;

use crate::db::conversations;
use crate::db::messages;
use crate::settings::Settings;
use crate::state::AppState;
use crate::types::AppError;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    log::debug!("get_settings: 进入");
    log::info!("get_settings: 成功");
    Ok(state.get_settings())
}

#[tauri::command]
pub async fn update_settings(
    new_settings: Settings,
    state: State<'_, AppState>,
) -> Result<Settings, String> {
    log::debug!("update_settings: 进入");
    let sanitized = new_settings.sanitized();
    state.apply_settings(sanitized.clone())?;
    state.persist_settings();
    log::info!("update_settings: 成功 providers={}", sanitized.providers.len());
    Ok(sanitized)
}

// ─────────────────────────────────────────────────────────────────────────────
// 会话 / 消息 IPC（任务 12）
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command(rename_all = "camelCase")]
pub async fn list_conversations(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    include_archived: bool,
) -> Result<Vec<conversations::Conversation>, AppError> {
    log::debug!("list_conversations: 进入 include_archived={}", include_archived);
    let result = conversations::list_conversations(pool.inner(), include_archived).await
        .map_err(|e| {
            log::error!("list_conversations: 失败");
            AppError::from(e)
        })?;
    log::info!("list_conversations: 成功 count={}", result.len());
    Ok(result)
}

#[tauri::command]
pub async fn get_conversation(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    id: String,
) -> Result<conversations::Conversation, AppError> {
    log::debug!("get_conversation: 进入 id={}", id);
    let uuid = Uuid::parse_str(&id).map_err(|e| {
        log::warn!("get_conversation: 失败");
        AppError::InvalidConfig {
            message: format!("UUID 格式错误：{e}"),
        }
    })?;
    let result = conversations::get_conversation(pool.inner(), &uuid)
        .await?
        .ok_or_else(|| {
            log::warn!("get_conversation: 失败");
            AppError::NotFound {
                message: format!("会话 {id} 未找到"),
            }
        })?;
    log::info!("get_conversation: 成功");
    Ok(result)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn create_conversation(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    title: String,
    system_prompt: Option<String>,
) -> Result<conversations::Conversation, AppError> {
    log::debug!("create_conversation: 进入 title={}", title);
    let result = conversations::create_conversation(pool.inner(), &title, system_prompt.as_deref()).await
        .map_err(|e| {
            log::error!("create_conversation: 失败");
            AppError::from(e)
        })?;
    log::info!("create_conversation: 成功 id={}", result.id);
    Ok(result)
}

#[tauri::command]
pub async fn archive_conversation(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    id: String,
) -> Result<(), AppError> {
    log::debug!("archive_conversation: 进入 id={}", id);
    let uuid = Uuid::parse_str(&id).map_err(|e| {
        log::warn!("archive_conversation: 失败");
        AppError::InvalidConfig {
            message: format!("UUID 格式错误：{e}"),
        }
    })?;
    conversations::archive_conversation(pool.inner(), &uuid).await
        .map_err(|e| {
            log::error!("archive_conversation: 失败");
            AppError::from(e)
        })?;
    log::info!("archive_conversation: 成功");
    Ok(())
}

#[tauri::command]
pub async fn delete_conversation(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    id: String,
) -> Result<(), AppError> {
    log::debug!("delete_conversation: 进入 id={}", id);
    let uuid = Uuid::parse_str(&id).map_err(|e| {
        log::warn!("delete_conversation: 失败");
        AppError::InvalidConfig {
            message: format!("UUID 格式错误：{e}"),
        }
    })?;
    conversations::hard_delete_conversation(pool.inner(), &uuid).await
        .map_err(|e| {
            log::error!("delete_conversation: 失败");
            AppError::from(e)
        })?;
    log::info!("delete_conversation: 成功");
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn list_messages(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    conversation_id: String,
) -> Result<Vec<messages::Message>, AppError> {
    log::debug!("list_messages: 进入 conversation_id={}", conversation_id);
    let uuid = Uuid::parse_str(&conversation_id).map_err(|e| {
        log::warn!("list_messages: 失败");
        AppError::InvalidConfig {
            message: format!("UUID 格式错误：{e}"),
        }
    })?;
    let result = messages::list_messages(pool.inner(), &uuid).await
        .map_err(|e| {
            log::error!("list_messages: 失败");
            AppError::from(e)
        })?;
    log::info!("list_messages: 成功 count={}", result.len());
    Ok(result)
}

#[tauri::command(rename_all = "camelCase")]
#[allow(clippy::too_many_arguments)]
pub async fn append_message(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    conversation_id: String,
    role: String,
    content: String,
    tool_calls: Option<String>,
    tool_results: Option<String>,
    model: Option<String>,
    input_tokens: Option<i64>,
    output_tokens: Option<i64>,
) -> Result<messages::Message, AppError> {
    log::debug!("append_message: 进入 conversation_id={}", conversation_id);
    let uuid = Uuid::parse_str(&conversation_id).map_err(|e| {
        log::warn!("append_message: 失败");
        AppError::InvalidConfig {
            message: format!("UUID 格式错误：{e}"),
        }
    })?;
    let result = messages::append_message(
        pool.inner(),
        uuid,
        &role,
        &content,
        tool_calls.as_deref(),
        tool_results.as_deref(),
        model.as_deref(),
        input_tokens,
        output_tokens,
    )
    .await
    .map_err(|e| {
        log::error!("append_message: 失败");
        AppError::from(e)
    })?;
    log::info!("append_message: 成功 id={}", result.id);
    Ok(result)
}

#[tauri::command]
pub async fn search_messages(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    query: String,
    limit: u32,
) -> Result<Vec<messages::Message>, AppError> {
    log::debug!("search_messages: 进入 query={} limit={}", query, limit);
    let result = messages::search_messages(pool.inner(), &query, limit).await
        .map_err(|e| {
            log::error!("search_messages: 失败");
            AppError::from(e)
        })?;
    log::info!("search_messages: 成功 count={}", result.len());
    Ok(result)
}

// ─────────────────────────────────────────────────────────────────────────────
// 设置 + LLM 密钥 IPC（任务 22 / 31）
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn clear_all_history(
    pool: tauri::State<'_, sqlx::SqlitePool>,
) -> Result<(), AppError> {
    log::debug!("clear_all_history: 进入");
    let mut tx = pool.begin().await.map_err(|e| {
        log::error!("clear_all_history: 失败");
        AppError::from(e)
    })?;
    sqlx::query("DELETE FROM messages_fts")
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            log::error!("clear_all_history: 失败");
            AppError::from(e)
        })?;
    sqlx::query("DELETE FROM messages")
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            log::error!("clear_all_history: 失败");
            AppError::from(e)
        })?;
    sqlx::query("DELETE FROM conversations")
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            log::error!("clear_all_history: 失败");
            AppError::from(e)
        })?;
    tx.commit().await.map_err(|e| {
        log::error!("clear_all_history: 失败");
        AppError::from(e)
    })?;
    log::info!("clear_all_history: 成功");
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// dialog IPC（T22: pick_workspace_path）
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn pick_workspace_path(app: tauri::AppHandle) -> Result<Option<String>, AppError> {
    log::debug!("pick_workspace_path: 进入");
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Select workspace root")
        .pick_folder(move |path: Option<tauri_plugin_dialog::FilePath>| {
            let _ = tx.send(path.map(|p| p.to_string()));
        });
    let result = rx.await.map_err(|e| {
        log::error!("pick_workspace_path: 失败");
        AppError::Upstream {
            message: format!("Dialog error: {}", e),
        }
    })?;
    log::info!("pick_workspace_path: 成功");
    Ok(result)
}
