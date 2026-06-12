//! Tauri IPC commands. Each command is a thin wrapper around
//! `AppState` methods so the wiring stays centralized.

use crate::secrets;
use crate::settings::{Settings, WidgetPosition};
use crate::state::{AppState, ProviderDescriptor};
use crate::types::{ProviderId, SnapshotEnvelope};
use tauri::{AppHandle, Manager, State};

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

