//! Crate root. Wires plugins, state, scheduler, tray, hotkeys, and
//! IPC commands into the Tauri runtime.

mod commands;
mod db;
mod events;
mod hotkeys;
mod providers;
mod scheduler;
mod secrets;
mod secrets_llm;
mod settings;
mod state;
mod tray;
mod types;

use crate::scheduler::Scheduler;
use crate::state::AppState;
use log::{info, warn};
use tauri::Manager;
use tauri_plugin_autostart::MacosLauncher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
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
            commands::get_widget_position,
            commands::set_widget_position,
            commands::show_settings_window,
            commands::hide_widget_window,
            commands::show_widget_window,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let state = AppState::new(handle.clone());

            // Apply the persisted start-at-login setting.
            tray::apply_autostart(&handle, state.get_settings().start_at_login);

            // Install the tray icon + menu.
            if let Err(e) = tray::install(&handle) {
                warn!("tray install failed: {e}");
            }

            // Launch-time: hide widget window if start_minimized
            if state.get_settings().start_minimized {
                if let Some(w) = app.get_webview_window("widget") {
                    let _ = w.hide();
                }
            }

            // Register hotkeys from the current settings.
            register_hotkeys(&handle, &state);

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
                if window.label() == "settings" {
                    // Hide the settings window instead of exiting the app
                    // so the widget keeps running.
                    api.prevent_close();
                    let _ = window.hide();
                } else if window.label() == "widget" {
                    // Widget close behavior: hide_to_tray vs quit
                    let app = window.app_handle();
                    let state = app.state::<AppState>();
                    let settings = state.get_settings();
                    match settings.close_behavior {
                        crate::settings::CloseBehavior::HideToTray => {
                            api.prevent_close();
                            let _ = window.hide();
                        }
                        crate::settings::CloseBehavior::Quit => {
                            // Allow close - do not prevent. App will exit.
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn register_hotkeys(handle: &tauri::AppHandle, _state: &AppState) {
    if let Err(e) = hotkeys::unregister_all(handle) {
        warn!("unregister hotkeys failed: {e}");
    }
}

/// Public entry point so `state.apply_settings` can re-bind hotkeys
/// when the user rebinds a chord without restarting the app. Pulled out
/// as a free function so the same code path runs on cold start and on
/// `update_settings`.
pub fn rebind_hotkeys(handle: &tauri::AppHandle, state: &AppState) {
    register_hotkeys(handle, state);
}
