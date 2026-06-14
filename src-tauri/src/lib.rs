//! Crate root. Wires plugins, state, scheduler, and
//! IPC commands into the Tauri runtime.

mod commands;
mod db;
mod events;
mod providers;
mod scheduler;
mod secrets;
mod secrets_llm;
mod settings;
mod state;
mod types;

use crate::scheduler::Scheduler;
use crate::state::AppState;
use log::{info, warn};
use tauri::menu::{Menu, MenuItem};
use tauri::Manager;
use tauri_plugin_autostart::MacosLauncher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_log::Builder::new()
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Stdout,
                ))
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("codeman-agent".to_string()),
                    },
                ))
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Webview,
                ))
                .build(),
        )
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            // V0 / pre-existing
            commands::list_providers,
            commands::get_active_provider,
            commands::set_active_provider,
            commands::force_refresh,
            commands::get_settings,
            commands::update_settings,
            commands::set_api_key,
            commands::has_api_key,
            commands::test_provider,
            commands::latest_snapshot,
            // T12: conversations
            commands::list_conversations,
            commands::get_conversation,
            commands::create_conversation,
            commands::archive_conversation,
            commands::delete_conversation,
            // T12: messages
            commands::list_messages,
            commands::append_message,
            commands::search_messages,
            // T13: billing
            commands::get_provider_snapshot,
            commands::list_billing_providers,
            commands::has_billing_key,
            commands::set_billing_key,
            // T22: settings + secrets_llm
            commands::clear_all_history,
            commands::set_llm_key,
            commands::has_llm_key,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            // Initialize DB pool and manage it for IPC commands (T11)
            let pool = tokio::runtime::Runtime::new()
                .unwrap()
                .block_on(db::connect(&handle))?;
            app.manage(pool);

            let state = AppState::new(handle.clone());

            // Apply the persisted start-at-login setting.
            apply_autostart(&handle, state.get_settings().start_at_login);

            // Build the native menu (File → Quit).
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, Some("CmdOrCtrl+Q"))?;
            let file_menu = Menu::with_items(app, &[&quit_item])?;
            app.set_menu(file_menu)?;

            // Handle menu events.
            app.on_menu_event(move |app, event| {
                if event.id().as_ref() == "quit" {
                    app.exit(0);
                }
            });

            // Spawn the scheduler loop.
            let scheduler_state = state.clone();
            tauri::async_runtime::spawn(async move {
                Scheduler::new(scheduler_state).run().await;
            });

            app.manage(state);
            info!("codeman-agent started");
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.minimize();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(desktop)]
fn apply_autostart(app: &tauri::AppHandle, enable: bool) {
    use tauri_plugin_autostart::ManagerExt;
    let manager = app.autolaunch();
    let result = if enable {
        manager.enable()
    } else {
        manager.disable()
    };
    if let Err(e) = result {
        warn!("autostart toggle failed: {e}");
    } else {
        info!("autostart set to {enable}");
    }
}

#[cfg(not(desktop))]
fn apply_autostart(_app: &tauri::AppHandle, _enable: bool) {
    // Autostart is a desktop-only concern; the autostart plugin itself
    // is no-op on mobile.
}
