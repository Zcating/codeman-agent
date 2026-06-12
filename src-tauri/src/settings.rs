//! Typed settings store on top of `tauri-plugin-store`.
//!
//! The plugin persists a JSON file under the OS app-data directory. We
//! read it on startup, apply defaults when fields are missing, and write
//! the whole struct back when a field changes. API keys never live here;
//! see `secrets`.

use crate::types::ProviderId;
use serde::{Deserialize, Serialize};
use std::time::Duration;

const STORE_FILE: &str = "settings.json";

/// Last-known widget window position, persisted across launches.
///
/// `x` / `y` are top-left in virtual-screen pixels (the units the OS
/// window manager uses). `None` means "no saved position yet" — the
/// widget should fall back to the default top-right placement.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct WidgetPosition {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Hotkeys {
    pub switch: String,
    pub toggle: String,
}

impl Default for Hotkeys {
    fn default() -> Self {
        Self {
            switch: "Ctrl+Alt+B".into(),
            toggle: "Ctrl+Alt+H".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub active_provider_id: ProviderId,
    pub refresh_interval_secs: u64,
    pub stale_after_secs: u64,
    pub low_balance_threshold: Option<f64>,
    pub low_quota_threshold_pct: Option<f64>,
    pub hotkeys: Hotkeys,
    pub start_at_login: bool,
    pub notifications_enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub widget_position: Option<WidgetPosition>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            active_provider_id: ProviderId::Deepseek,
            refresh_interval_secs: 60,
            stale_after_secs: 180,
            low_balance_threshold: Some(10.0),
            low_quota_threshold_pct: Some(20.0),
            hotkeys: Hotkeys::default(),
            start_at_login: true,
            notifications_enabled: true,
            widget_position: None,
        }
    }
}

impl Settings {
    /// Floor on the refresh interval to avoid hammering provider APIs.
    pub const MIN_REFRESH_SECS: u64 = 5;

    pub fn refresh_interval(&self) -> Duration {
        Duration::from_secs(self.refresh_interval_secs.max(Self::MIN_REFRESH_SECS))
    }

    pub fn stale_after(&self) -> Duration {
        Duration::from_secs(self.stale_after_secs)
    }

    pub fn sanitized(mut self) -> Self {
        if self.refresh_interval_secs < Self::MIN_REFRESH_SECS {
            self.refresh_interval_secs = Self::MIN_REFRESH_SECS;
        }
        if let Some(pct) = self.low_quota_threshold_pct {
            self.low_quota_threshold_pct = Some(pct.clamp(0.0, 100.0));
        }
        if let Some(amt) = self.low_balance_threshold {
            if amt < 0.0 {
                self.low_balance_threshold = Some(0.0);
            }
        }
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_match_plan() {
        let s = Settings::default();
        assert_eq!(s.active_provider_id, ProviderId::Deepseek);
        assert_eq!(s.refresh_interval_secs, 60);
        assert_eq!(s.stale_after_secs, 180);
        assert!(s.start_at_login);
        assert!(s.notifications_enabled);
    }

    #[test]
    fn sanitized_clamps_low_refresh() {
        let mut s = Settings::default();
        s.refresh_interval_secs = 1;
        s.low_quota_threshold_pct = Some(150.0);
        s.low_balance_threshold = Some(-5.0);
        let s = s.sanitized();
        assert_eq!(s.refresh_interval_secs, Settings::MIN_REFRESH_SECS);
        assert_eq!(s.low_quota_threshold_pct, Some(100.0));
        assert_eq!(s.low_balance_threshold, Some(0.0));
    }

    #[test]
    fn refresh_interval_floors() {
        let mut s = Settings::default();
        s.refresh_interval_secs = 1;
        assert_eq!(s.refresh_interval().as_secs(), Settings::MIN_REFRESH_SECS);
    }

    #[test]
    fn widget_position_round_trips_via_serde() {
        let pos = WidgetPosition { x: 123, y: -45 };
        let json = serde_json::to_string(&pos).unwrap();
        let back: WidgetPosition = serde_json::from_str(&json).unwrap();
        assert_eq!(pos, back);
    }

    #[test]
    fn settings_default_has_no_position() {
        assert!(Settings::default().widget_position.is_none());
    }

    #[test]
    fn settings_with_position_round_trip() {
        let s = Settings {
            widget_position: Some(WidgetPosition { x: 10, y: 20 }),
            ..Settings::default()
        };
        let json = serde_json::to_string(&s).unwrap();
        let back: Settings = serde_json::from_str(&json).unwrap();
        assert_eq!(back.widget_position, Some(WidgetPosition { x: 10, y: 20 }));
    }

    #[test]
    fn settings_legacy_json_without_position_parses_as_none() {
        // Older saved files (pre-window-position) have no
        // `widget_position` key. We must tolerate that and default to
        // `None` so a downgrade/upgrade doesn't break startup.
        let legacy = r#"{
            "active_provider_id": "deepseek",
            "refresh_interval_secs": 60,
            "stale_after_secs": 180,
            "low_balance_threshold": 10.0,
            "low_quota_threshold_pct": 20.0,
            "hotkeys": { "switch": "Ctrl+Alt+B", "toggle": "Ctrl+Alt+H" },
            "start_at_login": true,
            "notifications_enabled": true
        }"#;
        let s: Settings = serde_json::from_str(legacy).unwrap();
        assert!(s.widget_position.is_none());
    }
}
