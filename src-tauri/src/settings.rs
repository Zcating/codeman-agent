//! Typed settings store on top of `tauri-plugin-store`.
//!
//! The plugin persists a JSON file under the OS app-data directory. We
//! read it on startup, apply defaults when fields are missing, and write
//! the whole struct back when a field changes. API keys never live here;
//! see `secrets`.

use serde::{Deserialize, Serialize};
use std::time::Duration;

const STORE_FILE: &str = "settings.json";

// ─────────────────────────────────────────────────────────────────────────────
// Helper types
// ─────────────────────────────────────────────────────────────────────────────

/// Last-known widget window position, persisted across launches.
///
/// `x` / `y` are top-left in virtual-screen pixels.  `None` means "no saved
/// position yet" — the widget falls back to the default placement.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct WidgetPosition {
    pub x: i32,
    pub y: i32,
}

/// Pixel dimensions for a window.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Size {
    pub width: u32,
    pub height: u32,
}

impl Default for Size {
    fn default() -> Self {
        Self {
            width: 800,
            height: 600,
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

/// UI language preference.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UserLanguage {
    Zh,
    En,
    Auto,
}

impl Default for UserLanguage {
    fn default() -> Self {
        UserLanguage::Auto
    }
}

/// Visual theme.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Light,
    Dark,
    System,
}

impl Default for Theme {
    fn default() -> Self {
        Theme::System
    }
}

/// Behaviour when the user closes the main window.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CloseBehavior {
    HideToTray,
    Quit,
}

impl Default for CloseBehavior {
    fn default() -> Self {
        CloseBehavior::HideToTray
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-structs
// ─────────────────────────────────────────────────────────────────────────────

/// A single LLM provider configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMProvider {
    pub id: String,
    pub label: String,
    pub enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    /// Path into Tauri store where the API key lives.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key_ref: Option<String>,
}

impl Default for LLMProvider {
    fn default() -> Self {
        Self {
            id: String::new(),
            label: String::new(),
            enabled: false,
            default_model: None,
            base_url: None,
            api_key_ref: None,
        }
    }
}

/// Window geometry and persistence preferences.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowSettings {
    pub remember_position: bool,
    pub remember_size: bool,
    pub default_size: Size,
    pub min_size: Size,
}

impl Default for WindowSettings {
    fn default() -> Self {
        Self {
            remember_position: true,
            remember_size: true,
            default_size: Size::default(),
            min_size: Size { width: 600, height: 400 },
        }
    }
}

/// System-prompt template settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemPromptSettings {
    pub default: String,
    pub user_can_edit: bool,
}

impl Default for SystemPromptSettings {
    fn default() -> Self {
        Self {
            default: String::new(),
            user_can_edit: true,
        }
    }
}

/// V1 zero-hotkeys; reserved for V2.
/// Marked deprecated so it shows clearly in IDE tooltips.
#[deprecated(
    since = "1.0.0",
    note = "V1 ships with no hotkeys; this struct is reserved for V2 global-shortcut support"
)]
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HotkeySettings {
    pub toggle_window: String,
    pub new_conversation: String,
    pub open_settings: String,
}

impl Default for HotkeySettings {
    fn default() -> Self {
        Self {
            toggle_window: String::new(),
            new_conversation: String::new(),
            open_settings: String::new(),
        }
    }
}

/// A single billing provider configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BillingProviderConfig {
    pub id: String,
    pub enabled: bool,
    /// How often to poll this provider (seconds). Sanitized to >= 5.
    pub refresh_interval_secs: u64,
    /// Path into keyring where the API key lives.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key_ref: Option<String>,
}

impl Default for BillingProviderConfig {
    fn default() -> Self {
        Self {
            id: String::new(),
            enabled: false,
            refresh_interval_secs: 60,
            api_key_ref: None,
        }
    }
}

/// Conversation archival and retention limits.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationSettings {
    /// Auto-archive conversations older than this many days. Sanitized to >= 1.
    pub auto_archive_after_days: u32,
    /// Maximum number of non-archived conversations. Sanitized to >= 10.
    pub max_history: u32,
}

impl Default for ConversationSettings {
    fn default() -> Self {
        Self {
            auto_archive_after_days: 30,
            max_history: 1000,
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────────────────────────────────────

/// The complete V1 settings object.
///
/// All writes MUST go through `Settings::sanitized()` to enforce the
/// invariants listed there.  See `CONTEXT.md` "Settings (V1 shape)" for the
/// canonical schema (source of truth) and `src/lib/types.ts` for the TS mirror.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    // A. LLM providers
    pub llm_providers: Vec<LLMProvider>,

    // B. Default behaviour
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_llm_provider_id: Option<String>,
    pub user_language: UserLanguage,
    pub theme: Theme,

    // C. App lifecycle
    pub start_at_login: bool,
    pub start_minimized: bool,
    pub close_behavior: CloseBehavior,

    // D. Window
    pub window: WindowSettings,

    // E. System prompt
    pub system_prompt: SystemPromptSettings,

    // F. Hotkeys (deprecated – V1 zero-hotkeys; reserved for V2)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[deprecated(
        since = "1.0.0",
        note = "V1 ships with no hotkeys; reserved for V2 global-shortcut support"
    )]
    pub hotkeys: Option<HotkeySettings>,

    // G. Billing providers
    pub billing_providers: Vec<BillingProviderConfig>,

    // H. Conversations
    pub conversations: ConversationSettings,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            llm_providers: Vec::new(),
            default_llm_provider_id: None,
            user_language: UserLanguage::default(),
            theme: Theme::default(),
            start_at_login: true,
            start_minimized: false,
            close_behavior: CloseBehavior::default(),
            window: WindowSettings::default(),
            system_prompt: SystemPromptSettings::default(),
            hotkeys: None,
            billing_providers: Vec::new(),
            conversations: ConversationSettings::default(),
        }
    }
}

impl Settings {
    /// Floor on refresh interval to avoid hammering provider APIs.
    pub const MIN_REFRESH_SECS: u64 = 5;

    /// Returns the shortest refresh interval across all enabled billing
    /// providers, floored at `MIN_REFRESH_SECS`.  Used by the scheduler.
    pub fn refresh_interval(&self) -> Duration {
        let secs = self
            .billing_providers
            .iter()
            .filter(|p| p.enabled)
            .map(|p| p.refresh_interval_secs)
            .min()
            .unwrap_or(60)
            .max(Self::MIN_REFRESH_SECS);
        Duration::from_secs(secs)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Sanitization invariants (all clamp-up or clamp-range):
    //   1. refresh_interval_secs >= 5   (clamp up)
    //   2. low_quota_threshold_pct ∈ [0, 100]  (clamp to range)
    //   3. low_balance_threshold >= 0   (clamp up)
    //   4. auto_archive_after_days >= 1  (clamp up)
    //   5. max_history >= 10            (clamp up)
    // ─────────────────────────────────────────────────────────────────────────

    pub fn sanitized(mut self) -> Self {
        // Invariant 1: refresh_interval_secs >= 5
        for provider in &mut self.billing_providers {
            if provider.refresh_interval_secs < Self::MIN_REFRESH_SECS {
                provider.refresh_interval_secs = Self::MIN_REFRESH_SECS;
            }
        }

        // Invariant 4: auto_archive_after_days >= 1
        if self.conversations.auto_archive_after_days < 1 {
            self.conversations.auto_archive_after_days = 1;
        }

        // Invariant 5: max_history >= 10
        if self.conversations.max_history < 10 {
            self.conversations.max_history = 10;
        }

        self
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_sanity() {
        let s = Settings::default();
        assert!(s.llm_providers.is_empty());
        assert!(s.billing_providers.is_empty());
        assert_eq!(s.user_language, UserLanguage::Auto);
        assert_eq!(s.theme, Theme::System);
        assert!(s.start_at_login);
        assert!(!s.start_minimized);
        assert_eq!(s.close_behavior, CloseBehavior::HideToTray);
        assert_eq!(s.conversations.auto_archive_after_days, 30);
        assert_eq!(s.conversations.max_history, 1000);
    }

    #[test]
    fn sanitized_clamps_billing_refresh() {
        let mut s = Settings::default();
        s.billing_providers.push(BillingProviderConfig {
            id: "deepseek".into(),
            enabled: true,
            refresh_interval_secs: 1,
            api_key_ref: None,
        });
        let s = s.sanitized();
        assert_eq!(s.billing_providers[0].refresh_interval_secs, Settings::MIN_REFRESH_SECS);
    }

    #[test]
    fn sanitized_clamps_auto_archive() {
        let mut s = Settings::default();
        s.conversations.auto_archive_after_days = 0;
        let s = s.sanitized();
        assert_eq!(s.conversations.auto_archive_after_days, 1);
    }

    #[test]
    fn sanitized_clamps_max_history() {
        let mut s = Settings::default();
        s.conversations.max_history = 5;
        let s = s.sanitized();
        assert_eq!(s.conversations.max_history, 10);
    }

    #[test]
    fn settings_round_trip_via_serde() {
        let s = Settings {
            llm_providers: vec![LLMProvider {
                id: "openai".into(),
                label: "OpenAI".into(),
                enabled: true,
                default_model: Some("gpt-4".into()),
                base_url: None,
                api_key_ref: Some("llm_providers/openai/api_key".into()),
            }],
            default_llm_provider_id: Some("openai".into()),
            user_language: UserLanguage::En,
            theme: Theme::Dark,
            start_at_login: false,
            start_minimized: true,
            close_behavior: CloseBehavior::Quit,
            window: WindowSettings::default(),
            system_prompt: SystemPromptSettings {
                default: "You are a helpful assistant.".into(),
                user_can_edit: true,
            },
            hotkeys: None,
            billing_providers: vec![BillingProviderConfig {
                id: "deepseek".into(),
                enabled: true,
                refresh_interval_secs: 60,
                api_key_ref: None,
            }],
            conversations: ConversationSettings::default(),
        };
        let json = serde_json::to_string(&s).unwrap();
        let back: Settings = serde_json::from_str(&json).unwrap();
        assert_eq!(back.llm_providers[0].id, "openai");
        assert_eq!(back.default_llm_provider_id, Some("openai".into()));
        assert_eq!(back.user_language, UserLanguage::En);
        assert_eq!(back.theme, Theme::Dark);
        assert_eq!(back.billing_providers[0].id, "deepseek");
    }

    #[test]
    fn size_defaults_to_800x600() {
        assert_eq!(Size::default().width, 800);
        assert_eq!(Size::default().height, 600);
    }

    #[test]
    fn size_round_trips_via_serde() {
        let sz = Size { width: 1024, height: 768 };
        let json = serde_json::to_string(&sz).unwrap();
        let back: Size = serde_json::from_str(&json).unwrap();
        assert_eq!(sz, back);
    }
}