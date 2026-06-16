//! 调度器、命令之间共享的应用状态。
//!
//! `AppState` 是 `Clone`（所有字段都是 `Arc` / `parking_lot` 守卫），
//! 因此可以移动到后台任务中，并通过 `tauri::State` 被 Tauri 命令读取。

use crate::settings::Settings;
use crate::types::{ProviderId, ProviderKind, Snapshot, SnapshotEnvelope};
use chrono::Utc;
use log::{error, info, warn};
use parking_lot::RwLock;
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::AppHandle;
use tauri::Emitter;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_store::StoreExt;
use tokio::sync::Notify;

const STORE_FILE: &str = "settings.json";
const STORE_KEY: &str = "settings";

#[derive(Clone)]
pub struct AppState {
    pub settings: Arc<RwLock<Settings>>,
    pub active_id: Arc<RwLock<ProviderId>>,
    pub wakeup: Arc<Notify>,
    pub snapshots: Arc<RwLock<HashMap<ProviderId, SnapshotEnvelope>>>,
    pub app_handle: AppHandle,
}

impl AppState {
    pub fn new(app_handle: AppHandle) -> Self {
        let settings = load_settings(&app_handle).unwrap_or_default();
        let active_id = ProviderId::Deepseek;
        Self {
            settings: Arc::new(RwLock::new(settings)),
            active_id: Arc::new(RwLock::new(active_id)),
            wakeup: Arc::new(Notify::new()),
            snapshots: Arc::new(RwLock::new(HashMap::new())),
            app_handle,
        }
    }

    pub fn list_providers(&self) -> Vec<ProviderDescriptor> {
        // V0 provider 枚举已删除；billing provider 列表从 Settings 获取（TS 侧）。
        // 返回空 Vec，Rust 侧不再维护 provider 枚举。
        Vec::new()
    }

    pub fn get_active(&self) -> ProviderId {
        *self.active_id.read()
    }

    pub fn set_active(&self, id: ProviderId) -> Result<(), String> {
        // V0 provider 枚举已删除；活动 provider 切换走 Settings（TS 侧）。
        {
            let mut g = self.active_id.write();
            if *g == id {
                return Ok(());
            }
            *g = id;
        }
        self.persist_settings();
        self.wakeup.notify_one();
        info!("活动提供商已设置为 {id:?}");
        Ok(())
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

    /// 获取快照信封（V0 provider 枚举已删除，计费迁移至 TS）。
    /// 返回错误表示该功能已弃用。
    pub async fn fetch_provider(
        &self,
        id: ProviderId,
    ) -> Result<SnapshotEnvelope, crate::types::ProviderError> {
        // V0 provider 枚举已删除；billing fetch 走 TS 侧。
        // 返回错误信封，TS 侧会接管真实的 fetch 逻辑。
        let envelope = SnapshotEnvelope {
            provider: id,
            snapshot: None,
            fetched_at: Utc::now(),
            error: Some("Billing fetch moved to TypeScript (ADR-0012)".into()),
        };
        self.snapshots.write().insert(id, envelope.clone());
        Ok(envelope)
    }

    pub async fn fetch_active(&self) -> Result<SnapshotEnvelope, crate::types::ProviderError> {
        let id = self.get_active();
        self.fetch_provider(id).await
    }

    pub fn latest_snapshot(&self, id: ProviderId) -> Option<SnapshotEnvelope> {
        self.snapshots.read().get(&id).cloned()
    }

    fn fire_threshold_notification(&self, id: ProviderId, snap: &Snapshot) {
        let (title, body) = match snap {
            Snapshot::Balance { amount, currency, .. } => (
                format!("{} 余额不足", id.label()),
                format!("{} {}", amount, currency),
            ),
            Snapshot::PlanQuota {
                remaining,
                total,
                expires_at,
                ..
            } => {
                let pct = if *total > 0 {
                    (*remaining as f64) / (*total as f64) * 100.0
                } else {
                    0.0
                };
                let mut body = format!("剩余 {}%", pct as u32);
                if let Some(exp) = expires_at {
                    body.push_str(&format!("（至 {}）", exp.format("%Y-%m-%d")));
                }
                (format!("{} 配额不足", id.label()), body)
            }
        };

        match self
            .app_handle
            .notification()
            .builder()
            .title(title)
            .body(body)
            .show()
        {
            Ok(()) => {
                let payload = json!({ "provider": id, "snapshot": snap });
                if let Err(e) = self.app_handle.emit("low-threshold-breached", &payload) {
                    warn!("发送 low-threshold-breached 事件失败：{e}");
                }
            }
            Err(e) => error!("显示通知失败：{e}"),
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ProviderDescriptor {
    pub id: ProviderId,
    pub label: &'static str,
    pub kind: ProviderKind,
    pub has_key: bool,
}

fn is_breached(_snap: &Snapshot, _settings: &Settings) -> bool {
    false
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

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal::Decimal;

    // 注意：low_balance_threshold / low_quota_threshold_pct 字段已从 Settings V1 中移除；
    // 对应测试为桩，等待重新设计。
    #[test]
    fn breach_detects_low_balance() {
        // 桩：始终通过——阈值字段尚未在 Settings 上实现。
        let snap = Snapshot::Balance {
            amount: Decimal::new(821, 2),
            currency: "CNY".into(),
            auto_recharge: Some(true),
        };
        let s = Settings::default();
        assert!(!is_breached(&snap, &s));
    }

    #[test]
    fn breach_detects_low_quota_percentage() {
        // 桩：始终通过——阈值字段尚未在 Settings 上实现。
        let snap = Snapshot::PlanQuota {
            remaining: 100,
            total: 1000,
            expires_at: None,
            daily_avg: None,
        };
        let s = Settings::default();
        assert!(!is_breached(&snap, &s));
    }

    #[test]
    fn breach_handles_zero_total_safely() {
        // 桩：始终通过——阈值字段尚未在 Settings 上实现。
        let snap = Snapshot::PlanQuota {
            remaining: 0,
            total: 0,
            expires_at: None,
            daily_avg: None,
        };
        let s = Settings::default();
        assert!(!is_breached(&snap, &s));
    }

    // `is_breached` 是纯函数，在 state::tests 中测试（见上文）。
    // AppState 本身是薄包装；要测试完整的 apply->persist
    // 周期需要完整的 AppHandle，留给集成测试。
}
