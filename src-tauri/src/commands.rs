//! Tauri IPC commands. Each command is a thin wrapper around
//! `AppState` methods so the wiring stays centralized.

use crate::db::conversations;
use crate::db::messages;
use crate::secrets;
use crate::settings::{Settings, WidgetPosition};
use crate::state::{AppState, ProviderDescriptor};
use crate::types::{AppError, ProviderId, SnapshotEnvelope};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

#[tauri::command]
pub async fn list_providers(state: State<'_, AppState>) -> Result<Vec<ProviderDescriptor>, String> {
    Ok(state.list_providers())
}

#[tauri::command]
pub async fn get_active_provider(state: State<'_, AppState>) -> Result<ProviderId, String> {
    Ok(state.get_active())
}

#[tauri::command]
pub async fn set_active_provider(
    id: ProviderId,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.set_active(id)
}

#[tauri::command]
pub async fn force_refresh(state: State<'_, AppState>) -> Result<(), String> {
    state.wakeup.notify_one();
    Ok(())
}

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

#[tauri::command]
pub async fn set_api_key(
    provider: ProviderId,
    value: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    if value.is_empty() {
        secrets::delete_api_key(provider).map_err(|e| e.to_string())?;
    } else {
        secrets::set_api_key(provider, &value).map_err(|e| e.to_string())?;
    }
    let stored = secrets::has_api_key(provider);
    // Trigger a re-render so the settings UI updates the "key configured"
    // indicator and a key-on-file change refreshes the active snapshot.
    state.wakeup.notify_one();
    Ok(stored)
}

#[tauri::command]
pub async fn has_api_key(provider: ProviderId) -> Result<bool, String> {
    Ok(secrets::has_api_key(provider))
}

#[tauri::command]
pub async fn test_provider(
    provider: ProviderId,
    state: State<'_, AppState>,
) -> Result<SnapshotEnvelope, String> {
    state.fetch_provider(provider).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn latest_snapshot(
    provider: ProviderId,
    state: State<'_, AppState>,
) -> Result<Option<SnapshotEnvelope>, String> {
    Ok(state.latest_snapshot(provider))
}

#[tauri::command]
pub async fn get_widget_position(
    state: State<'_, AppState>,
) -> Result<Option<WidgetPosition>, String> {
    Ok(state.get_widget_position())
}

#[tauri::command]
pub async fn set_widget_position(
    x: i32,
    y: i32,
    state: State<'_, AppState>,
) -> Result<WidgetPosition, String> {
    let pos = WidgetPosition { x, y };
    state.set_widget_position(pos);
    Ok(pos)
}

#[tauri::command]
pub async fn show_settings_window(app: AppHandle) -> Result<(), String> {
    crate::tray::show_settings(&app);
    Ok(())
}

#[tauri::command]
pub async fn hide_widget_window(app: AppHandle) -> Result<(), String> {
    crate::tray::hide_widget(&app);
    Ok(())
}

#[tauri::command]
pub async fn show_widget_window(app: AppHandle) -> Result<(), String> {
    crate::tray::show_widget(&app);
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversation / Message IPC (Task 12)
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
        message: format!("bad uuid: {e}"),
    })?;
    conversations::get_conversation(pool.inner(), &uuid)
        .await?
        .ok_or_else(|| AppError::NotFound {
            message: format!("conversation {id} not found"),
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
        message: format!("bad uuid: {e}"),
    })?;
    Ok(conversations::archive_conversation(pool.inner(), &uuid).await?)
}

#[tauri::command]
pub async fn delete_conversation(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    id: String,
) -> Result<(), AppError> {
    let uuid = Uuid::parse_str(&id).map_err(|e| AppError::InvalidConfig {
        message: format!("bad uuid: {e}"),
    })?;
    Ok(conversations::hard_delete_conversation(pool.inner(), &uuid).await?)
}

#[tauri::command]
pub async fn list_messages(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    conversation_id: String,
) -> Result<Vec<messages::Message>, AppError> {
    let uuid = Uuid::parse_str(&conversation_id).map_err(|e| AppError::InvalidConfig {
        message: format!("bad uuid: {e}"),
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
        message: format!("bad uuid: {e}"),
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
// Billing Snapshot IPC (Task 13)
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_billing_providers(
    state: State<'_, AppState>,
) -> Result<Vec<ProviderDescriptor>, AppError> {
    Ok(state.list_providers())
}

#[tauri::command]
pub async fn has_billing_key(
    provider: ProviderId,
) -> Result<bool, AppError> {
    Ok(secrets::has_api_key(provider))
}

#[tauri::command]
pub async fn set_billing_key(
    provider: ProviderId,
    value: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    if value.is_empty() {
        secrets::delete_api_key(provider)
            .map_err(|e| AppError::Unauthorized { message: e.to_string() })?;
    } else {
        secrets::set_api_key(provider, &value)
            .map_err(|e| AppError::Unauthorized { message: e.to_string() })?;
    }
    state.wakeup.notify_one();
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

