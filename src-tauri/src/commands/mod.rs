//! Tauri IPC 命令。每个命令都是围绕 `AppState` 方法的薄包装，
//! 以便布线保持集中。

pub mod filesystem;

use crate::db::conversations;
use crate::db::messages;
use crate::secrets_llm;
use crate::settings::Settings;
use crate::state::{AppState, ProviderDescriptor};
use crate::types::{AppError, ProviderId, SnapshotEnvelope};
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    Ok(state.get_settings())
}

#[tauri::command]
pub async fn update_settings(
    new_settings: Settings,
    state: State<'_, AppState>,
) -> Result<Settings, String> {
    let sanitized = new_settings.sanitized();
    state.apply_settings(sanitized.clone())?;
    state.persist_settings();
    Ok(sanitized)
}

// ─────────────────────────────────────────────────────────────────────────────
// 会话 / 消息 IPC（任务 12）
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_conversations(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    include_archived: bool,
) -> Result<Vec<conversations::Conversation>, AppError> {
    Ok(conversations::list_conversations(pool.inner(), include_archived).await?)
}

#[tauri::command]
pub async fn get_conversation(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    id: String,
) -> Result<conversations::Conversation, AppError> {
    let uuid = Uuid::parse_str(&id).map_err(|e| AppError::InvalidConfig {
        message: format!("UUID 格式错误：{e}"),
    })?;
    conversations::get_conversation(pool.inner(), &uuid)
        .await?
        .ok_or_else(|| AppError::NotFound {
            message: format!("会话 {id} 未找到"),
        })
}

#[tauri::command]
pub async fn create_conversation(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    title: String,
    system_prompt: Option<String>,
) -> Result<conversations::Conversation, AppError> {
    Ok(conversations::create_conversation(pool.inner(), &title, system_prompt.as_deref()).await?)
}

#[tauri::command]
pub async fn archive_conversation(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    id: String,
) -> Result<(), AppError> {
    let uuid = Uuid::parse_str(&id).map_err(|e| AppError::InvalidConfig {
        message: format!("UUID 格式错误：{e}"),
    })?;
    Ok(conversations::archive_conversation(pool.inner(), &uuid).await?)
}

#[tauri::command]
pub async fn delete_conversation(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    id: String,
) -> Result<(), AppError> {
    let uuid = Uuid::parse_str(&id).map_err(|e| AppError::InvalidConfig {
        message: format!("UUID 格式错误：{e}"),
    })?;
    Ok(conversations::hard_delete_conversation(pool.inner(), &uuid).await?)
}

#[tauri::command]
pub async fn list_messages(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    conversation_id: String,
) -> Result<Vec<messages::Message>, AppError> {
    let uuid = Uuid::parse_str(&conversation_id).map_err(|e| AppError::InvalidConfig {
        message: format!("UUID 格式错误：{e}"),
    })?;
    Ok(messages::list_messages(pool.inner(), &uuid).await?)
}

#[tauri::command]
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
    let uuid = Uuid::parse_str(&conversation_id).map_err(|e| AppError::InvalidConfig {
        message: format!("UUID 格式错误：{e}"),
    })?;
    Ok(messages::append_message(
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
    .await?)
}

#[tauri::command]
pub async fn search_messages(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    query: String,
    limit: u32,
) -> Result<Vec<messages::Message>, AppError> {
    Ok(messages::search_messages(pool.inner(), &query, limit).await?)
}

// ─────────────────────────────────────────────────────────────────────────────
// 计费快照 IPC（任务 13）
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_billing_providers(
    state: State<'_, AppState>,
) -> Result<Vec<ProviderDescriptor>, AppError> {
    Ok(state.list_providers())
}

#[tauri::command]
pub async fn has_billing_key(
    app: tauri::AppHandle,
    provider_id: String,
) -> Result<bool, AppError> {
    Ok(secrets_llm::has_billing_key(&app, &provider_id))
}

#[tauri::command]
pub async fn set_billing_key(
    app: tauri::AppHandle,
    provider_id: String,
    value: String,
) -> Result<(), AppError> {
    if value.is_empty() {
        secrets_llm::delete_billing_key(&app, &provider_id)
            .map_err(|e| AppError::Unauthorized { message: e })?;
    } else {
        secrets_llm::set_billing_key(&app, &provider_id, &value)
            .map_err(|e| AppError::Unauthorized { message: e })?;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_provider_snapshot(
    state: State<'_, AppState>,
    provider: ProviderId,
) -> Result<SnapshotEnvelope, AppError> {
    state
        .fetch_provider(provider)
        .await
        .map_err(|e| AppError::Upstream { message: e.to_string() })
}

// ─────────────────────────────────────────────────────────────────────────────
// 设置 + LLM 密钥 IPC（任务 22 / 31）
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn clear_all_history(
    pool: tauri::State<'_, sqlx::SqlitePool>,
) -> Result<(), AppError> {
    let mut tx = pool.begin().await.map_err(AppError::from)?;
    sqlx::query("DELETE FROM messages_fts")
        .execute(&mut *tx)
        .await
        .map_err(AppError::from)?;
    sqlx::query("DELETE FROM messages")
        .execute(&mut *tx)
        .await
        .map_err(AppError::from)?;
    sqlx::query("DELETE FROM conversations")
        .execute(&mut *tx)
        .await
        .map_err(AppError::from)?;
    tx.commit().await.map_err(AppError::from)?;
    Ok(())
}

#[tauri::command]
pub async fn set_llm_key(
    app: tauri::AppHandle,
    provider_id: String,
    key: String,
) -> Result<(), AppError> {
    secrets_llm::set_llm_key(&app, &provider_id, &key)
        .map_err(|e| AppError::Unauthorized { message: e })
}

#[tauri::command]
pub async fn has_llm_key(
    app: tauri::AppHandle,
    provider_id: String,
) -> Result<bool, AppError> {
    Ok(secrets_llm::has_llm_key(&app, &provider_id))
}

/// 读取指定 LLM provider 的 API 密钥。
///
/// `Secret::expose()` 是该 `Secret` 出 IPC 边界的唯一允许点。
/// 已在 `secrets_llm.rs` / `types.rs` 论证，本函数遵循同一约定。
#[tauri::command]
pub async fn get_llm_key(
    app: tauri::AppHandle,
    provider_id: String,
) -> Result<Option<String>, String> {
    let secret = secrets_llm::get_llm_key(&app, &provider_id)?;
    Ok(secret.map(|s| s.expose().to_string()))
}

// ─────────────────────────────────────────────────────────────────────────────
// delete_provider_keys IPC（Metis #9）
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn delete_provider_keys(
    provider_id: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // 删除 LLM provider 密钥（llm_providers/<id>/api_key）
    secrets_llm::delete_llm_key(&app, &provider_id)?;
    // 删除计费密钥（billing/<id>/api_key）
    secrets_llm::delete_billing_key(&app, &provider_id)?;
    Ok(())
}
