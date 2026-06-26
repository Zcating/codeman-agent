//! 调度器、命令之间共享的应用状态。
//!
//! `AppState` 是 `Clone`（所有字段都是 `Arc` / `parking_lot` 守卫），
//! 因此可以移动到后台任务中，并通过 `tauri::State` 被 Tauri 命令读取。
//!
//! V2 简化: snapshots map + fetch_provider 删除 (billing tool 整体下线)。

use crate::settings::Settings;
use log::warn;
use parking_lot::RwLock;
use std::sync::Arc;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;
use tokio::sync::Notify;

const STORE_FILE: &str = "settings.json";
const STORE_KEY: &str = "settings";

#[derive(Clone)]
pub struct AppState {
    pub settings: Arc<RwLock<Settings>>,
    pub wakeup: Arc<Notify>,
    pub app_handle: AppHandle,
}

impl AppState {
    pub fn new(app_handle: AppHandle) -> Self {
        let settings = load_settings(&app_handle).unwrap_or_default();
        Self {
            settings: Arc::new(RwLock::new(settings)),
            wakeup: Arc::new(Notify::new()),
            app_handle,
        }
    }

    pub fn apply_settings(&self, new_settings: Settings) -> Result<(), String> {
        let old_interval = self.settings.read().refresh_interval().as_secs();
        *self.settings.write() = new_settings.clone();
        if new_settings.refresh_interval().as_secs() != old_interval {
            self.wakeup.notify_one();
        }
        Ok(())
    }

    pub fn get_settings(&self) -> Settings {
        self.settings.read().clone()
    }

    pub fn persist_settings(&self) {
        let value = match serde_json::to_value(self.settings.read().clone()) {
            Ok(v) => v,
            Err(e) => {
                warn!("序列化设置失败：{e}");
                return;
            }
        };
        match self.app_handle.store(STORE_FILE) {
            Ok(store) => {
                store.set(STORE_KEY, value);
                if let Err(e) = store.save() {
                    warn!("保存设置失败：{e}");
                }
            }
            Err(e) => warn!("打开设置存储失败：{e}"),
        }
    }
}

fn load_settings(app: &AppHandle) -> Option<Settings> {
    let store = app.store(STORE_FILE).ok()?;
    let v = store.get(STORE_KEY)?;
    match serde_json::from_value::<Settings>(v) {
        Ok(s) => Some(s.sanitized()),
        Err(e) => {
            warn!("设置解析失败：{e}；使用默认值");
            None
        }
    }
}
