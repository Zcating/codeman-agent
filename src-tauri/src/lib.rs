//! Crate 根。将插件、状态、调度器和 IPC 命令接入 Tauri 运行时。

mod commands;
mod db;
mod events;
mod secrets_llm;
mod settings;
mod filesystem;
mod state;
mod types;

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
                // 决策 ADR-0011: 默认 level = Info，关掉 keyring / reqwest 等
                // 外部 crate 的 DEBUG 噪音。需要全量 DEBUG 走
                // `$env:RUST_LOG = "keyring=debug,codeman_agent_lib=debug"`。
                .level(log::LevelFilter::Info)
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
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            // V0 removed per ADR-0012 T7
            commands::get_settings,
            commands::update_settings,
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
            commands::get_llm_key,
            // Metis #9
            commands::delete_provider_keys,
            // T22: dialog
            commands::pick_workspace_path,
            // T6–T10: filesystem
            commands::filesystem::read_file,
            commands::filesystem::write_file,
            commands::filesystem::edit_file,
            commands::filesystem::search_files,
            commands::filesystem::delete_file,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            // 初始化 DB pool 并为 IPC 命令管理它（T11）
            let pool = tokio::runtime::Runtime::new()
                .unwrap()
                .block_on(db::connect(&handle))?;
            app.manage(pool);

            let state = AppState::new(handle.clone());

            // 应用持久化的开机自启设置。
            apply_autostart(&handle, state.get_settings().start_at_login);

            // 构建原生菜单（文件 → 退出）。
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, Some("CmdOrCtrl+Q"))?;
            let file_menu = Menu::with_items(app, &[&quit_item])?;
            app.set_menu(file_menu)?;

            // 处理菜单事件。
            app.on_menu_event(move |app, event| {
                if event.id().as_ref() == "quit" {
                    app.exit(0);
                }
            });

            // V0 调度器已删除；billing 轮询迁移至 TS（ADR-0012）。

            app.manage(state);
            info!("codeman-agent 已启动");
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
        .expect("运行 Tauri 应用时出错");
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
        warn!("开机自启切换失败：{e}");
    } else {
        info!("autostart set to {enable}");
    }
}

#[cfg(not(desktop))]
fn apply_autostart(_app: &tauri::AppHandle, _enable: bool) {
    // 开机自启是仅桌面端的问题；自动启动插件本身在移动端是无操作的。
}
