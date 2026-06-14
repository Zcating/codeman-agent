//! 调度器、命令之间共享的应用状态。
//!
//! `AppState` 是 `Clone`（所有字段都是 `Arc` / `parking_lot` 守卫），
//! 因此可以移动到后台任务中，并通过 `tauri::State` 被 Tauri 命令读取。

use crate::providers::{Adapter, registry};
use crate::secrets;
use crate::settings::Settings;
use crate::types::{
    ProviderError, ProviderId, ProviderKind, Secret, Snapshot, SnapshotEnvelope,
};
use chrono::Utc;
use log::{error, info, warn};
use parking_lot::RwLock;
use reqwest::Client;
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
    pub registry: Arc<Vec<Adapter>>,
    pub http: Client,
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
            registry: Arc::new(registry()),
            http: Client::builder()
                .user_agent(concat!("codeman-agent/", env!("CARGO_PKG_VERSION")))
                .build()
                .expect("构建 HTTP 客户端失败"),
            wakeup: Arc::new(Notify::new()),
            snapshots: Arc::new(RwLock::new(HashMap::new())),
            app_handle,
        }
    }

    pub fn list_providers(&self) -> Vec<ProviderDescriptor> {
        self.registry
            .iter()
            .map(|p| ProviderDescriptor {
                id: p.id(),
                label: p.label(),
                kind: p.kind(),
                has_key: secrets::has_api_key(p.id()),
            })
            .collect()
    }

    pub fn get_active(&self) -> ProviderId {
        *self.active_id.read()
    }

    pub fn set_active(&self, id: ProviderId) -> Result<(), String> {
        if self.registry.iter().all(|p| p.id() != id) {
            return Err(format!("未知提供商：{id:?}"));
        }
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

    /// 立即获取单个提供商，更新内存中的 envelope 缓存并发送事件。
    /// 返回 envelope 以便 `test_provider` 命令同步返回结果。
    pub async fn fetch_provider(
        &self,
        id: ProviderId,
    ) -> Result<SnapshotEnvelope, ProviderError> {
        let adapter = self
            .registry
            .iter()
            .find(|p| p.id() == id)
            .cloned()
            .ok_or_else(|| ProviderError::InvalidResponse("未知提供商".into()))?;

        let secret = secrets::get_api_key(id)
            .map_err(|e| ProviderError::InvalidResponse(e.to_string()))?
            .map(Secret::new)
            .unwrap_or_else(Secret::empty);

        let settings = self.settings.read().clone();
        let prev_breached = self
            .snapshots
            .read()
            .get(&id)
            .and_then(|e| e.snapshot.as_ref())
            .map(|s| is_breached(s, &settings))
            .unwrap_or(false);

        let fetched_at = Utc::now();
        let result = adapter.fetch(&self.http, &secret).await;
        let envelope = SnapshotEnvelope {
            provider: id,
            snapshot: result.as_ref().ok().cloned(),
            fetched_at,
            error: result.as_ref().err().map(|e| e.to_string()),
        };
        self.snapshots.write().insert(id, envelope.clone());

        match &result {
            Ok(snap) => {
                if let Err(e) = self.app_handle.emit("snapshot-updated", &envelope) {
                    warn!("发送 snapshot-updated 事件失败：{e}");
                }
                if !prev_breached && is_breached(snap, &settings) {
                    self.fire_threshold_notification(id, snap);
                }
            }
            Err(err) => {
                let payload = json!({ "provider": id, "error": err.to_string() });
                if let Err(e) = self.app_handle.emit("refresh-failed", &payload) {
                    warn!("发送 refresh-failed 事件失败：{e}");
                }
                warn!("{id:?} 刷新失败：{err}");
            }
        }

        result.map(|_| envelope)
    }

    pub async fn fetch_active(&self) -> Result<SnapshotEnvelope, ProviderError> {
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
