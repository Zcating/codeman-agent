//! System tray icon + menu.
//!
//! The tray is the primary persistent entry point on Windows: the widget
//! is frameless and skipped from the taskbar, so users reach Settings
//! and Quit through the tray. Left-clicking the tray icon toggles the
//! widget's visibility.

use log::{info, warn};
use tauri::{
    image::Image,
    menu::{IsMenuItem, Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

pub const MENU_SETTINGS: &str = "settings";
pub const MENU_HIDE: &str = "hide";
pub const MENU_SHOW: &str = "show";
pub const MENU_QUIT: &str = "quit";

/// Build the tray icon and attach it to the running app. Called from
/// `lib.rs` after the windows are configured.
pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let handle = app.clone();
    let settings_item = MenuItem::with_id(app, MENU_SETTINGS, "Settings", true, None::<&str>)?;
    let hide_item = MenuItem::with_id(app, MENU_HIDE, "Hide widget", true, None::<&str>)?;
    let show_item = MenuItem::with_id(app, MENU_SHOW, "Show widget", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, MENU_QUIT, "Quit", true, None::<&str>)?;

    // Build a heterogeneous slice via an explicit coercion to the trait
    // object so the array literal type-checks regardless of which menu
    // kinds are added.
    let separator = MenuItem::with_id(app, "_sep", "", false, None::<&str>)?;
    let items: Vec<&dyn IsMenuItem<tauri::Wry>> = vec![
        &settings_item,
        &show_item,
        &hide_item,
        &separator,
        &quit_item,
    ];
    let menu = Menu::with_items(app, &items)?;

    let icon = app
        .default_window_icon()
        .cloned()
        .unwrap_or_else(|| Image::from_bytes(include_bytes!("../icons/32x32.png")).unwrap());

    TrayIconBuilder::with_id("main")
        .icon(icon)
        .tooltip("codeman-agent")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| handle_menu_event(app, event.id().as_ref()))
        .on_tray_icon_event(move |_tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_widget_visibility(&handle);
            }
        })
        .build(app)?;

    Ok(())
}

fn handle_menu_event(app: &AppHandle, id: &str) {
    match id {
        MENU_SETTINGS => show_settings(app),
        MENU_HIDE => hide_widget(app),
        MENU_SHOW => show_widget(app),
        MENU_QUIT => app.exit(0),
        _ => {}
    }
}

pub fn show_settings(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("settings") {
        if let Err(e) = win.show() {
            warn!("show settings failed: {e}");
        }
        if let Err(e) = win.set_focus() {
            warn!("focus settings failed: {e}");
        }
    } else {
        warn!("settings window not registered");
    }
}

pub fn hide_widget(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("widget") {
        if let Err(e) = win.hide() {
            warn!("hide widget failed: {e}");
        }
    }
}

pub fn show_widget(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("widget") {
        if let Err(e) = win.show() {
            warn!("show widget failed: {e}");
        }
        if let Err(e) = win.set_focus() {
            warn!("focus widget failed: {e}");
        }
    }
}

pub fn toggle_widget_visibility(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("widget") {
        let visible = win.is_visible().unwrap_or(false);
        if visible {
            hide_widget(app);
        } else {
            show_widget(app);
        }
    }
}

#[cfg(desktop)]
pub fn apply_autostart(app: &AppHandle, enable: bool) {
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
pub fn apply_autostart(_app: &AppHandle, _enable: bool) {
    // Autostart is a desktop-only concern; the autostart plugin itself
    // is no-op on mobile.
}
