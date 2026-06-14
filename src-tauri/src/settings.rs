//! 基于 `tauri-plugin-store` 的类型化设置存储。
//!
//! 插件在 OS app-data 目录下持久化一个 JSON 文件。我们在启动时读取它，
//! 字段缺失时应用默认值，字段变更时将整个结构体写回。API 密钥永不存于此；
//! 见 `secrets`。

use serde::{Deserialize, Serialize};
use std::time::Duration;

const STORE_FILE: &str = "settings.json";

// ─────────────────────────────────────────────────────────────────────────────
// 辅助类型
// ─────────────────────────────────────────────────────────────────────────────

/// 窗口的像素尺寸。
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
// 枚举
// ─────────────────────────────────────────────────────────────────────────────

/// UI 语言偏好。
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

/// 视觉主题。
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

// ─────────────────────────────────────────────────────────────────────────────
// 子结构体
// ─────────────────────────────────────────────────────────────────────────────

/// 单个 LLM 提供商配置。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMProvider {
    pub id: String,
    pub label: String,
    pub enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    /// API 密钥所在的 Tauri store 路径。
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

/// 窗口几何形状和持久化偏好。
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

/// 系统提示模板设置。
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

/// 单个计费提供商配置。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BillingProviderConfig {
    pub id: String,
    pub enabled: bool,
    /// 轮询此提供商的频率（秒）。清理后 >= 5。
    pub refresh_interval_secs: u64,
    /// API 密钥所在的 keyring 路径。
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

/// 会话归档和保留限制。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationSettings {
    /// 自动归档早于此天数的会话。清理后 >= 1。
    pub auto_archive_after_days: u32,
    /// 非归档会话的最大数量。清理后 >= 10。
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
// 设置
// ─────────────────────────────────────────────────────────────────────────────

/// 完整的 V1 设置对象。
///
/// 所有写入必须经过 `Settings::sanitized()` 以强制执行其列出的不变量。
/// 规范 schema（权威来源）见 `CONTEXT.md"Settings (V1 shape)"`，
/// TS 镜像见 `src/lib/types.ts`。
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

    // D. Window
    pub window: WindowSettings,

    // E. System prompt
    pub system_prompt: SystemPromptSettings,

    // F. Billing providers
    pub billing_providers: Vec<BillingProviderConfig>,

    // G. Conversations
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
            window: WindowSettings::default(),
            system_prompt: SystemPromptSettings::default(),
            billing_providers: Vec::new(),
            conversations: ConversationSettings::default(),
        }
    }
}

impl Settings {
    /// 刷新间隔的下限，避免疯狂请求提供商 API。
    pub const MIN_REFRESH_SECS: u64 = 5;

    /// 返回所有已启用计费提供商中的最短刷新间隔，
    /// 以 `MIN_REFRESH_SECS` 为下限。由调度器使用。
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
    // 清理不变量（全部为向上或范围钳制）：
    //   1. refresh_interval_secs >= 5   （向上钳制）
    //   2. low_quota_threshold_pct ∈ [0, 100]  （范围钳制）
    //   3. low_balance_threshold >= 0   （向上钳制）
    //   4. auto_archive_after_days >= 1  （向上钳制）
    //   5. max_history >= 10            （向上钳制）
    // ─────────────────────────────────────────────────────────────────────────

    pub fn sanitized(mut self) -> Self {
        // 不变量 1：refresh_interval_secs >= 5
        for provider in &mut self.billing_providers {
            if provider.refresh_interval_secs < Self::MIN_REFRESH_SECS {
                provider.refresh_interval_secs = Self::MIN_REFRESH_SECS;
            }
        }

        // 不变量 4：auto_archive_after_days >= 1
        if self.conversations.auto_archive_after_days < 1 {
            self.conversations.auto_archive_after_days = 1;
        }

        // 不变量 5：max_history >= 10
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
    fn sanitized_clamps_refresh_interval_secs() {
        let mut s = Settings::default();
        s.billing_providers.push(BillingProviderConfig {
            id: "deepseek".into(),
            enabled: true,
            refresh_interval_secs: 1,
            api_key_ref: None,
        });
        let s = s.sanitized();
        assert_eq!(s.billing_providers[0].refresh_interval_secs, 5);
    }

    #[test]
    fn sanitized_clamps_auto_archive_after_days() {
        let mut s = Settings::default();
        s.conversations.auto_archive_after_days = 0;
        let s = s.sanitized();
        assert_eq!(s.conversations.auto_archive_after_days, 1);
    }

    #[test]
    fn sanitized_clamps_auto_archive_after_days_boundary() {
        let mut s = Settings::default();
        s.conversations.auto_archive_after_days = 1;
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
    fn sanitized_clamps_max_history_boundary() {
        let mut s = Settings::default();
        s.conversations.max_history = 10;
        let s = s.sanitized();
        assert_eq!(s.conversations.max_history, 10);
    }

    #[test]
    fn sanitized_passes_through_valid_settings() {
        let mut s = Settings::default();
        s.billing_providers.push(BillingProviderConfig {
            id: "deepseek".into(),
            enabled: true,
            refresh_interval_secs: 60,
            api_key_ref: None,
        });
        s.conversations.auto_archive_after_days = 30;
        s.conversations.max_history = 1000;
        let s = s.sanitized();
        assert_eq!(s.billing_providers[0].refresh_interval_secs, 60);
        assert_eq!(s.conversations.auto_archive_after_days, 30);
        assert_eq!(s.conversations.max_history, 1000);
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
            window: WindowSettings::default(),
            system_prompt: SystemPromptSettings {
                default: "You are a helpful assistant.".into(),
                user_can_edit: true,
            },
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