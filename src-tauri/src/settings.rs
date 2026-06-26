//! 基于 `tauri-plugin-store` 的类型化设置存储。
//!
//! 插件在 OS app-data 目录下持久化一个 JSON 文件。我们在启动时读取它，
//! 字段缺失时应用默认值，字段变更时将整个结构体写回。API 密钥永不存于此；
//! 见 `secrets`。
//!
//! V2 简化: BillingProviderConfig + Provider.billing + 全部 billing-related
//! schema 已移除。`billing_providers: Vec<BillingProviderConfig>` 字段保留为
//! 兼容 V0 迁移输入,迁移后立即清空(不再写入 V2 settings.json)。

use crate::types::{ModelMeta, Provider, ProviderLlm};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Duration;

const SCHEMA_VERSION_V15: &str = "1.5";

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
            width: 1280,
            height: 1280,
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 枚举
// ─────────────────────────────────────────────────────────────────────────────

/// UI 语言偏好。
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UserLanguage {
    Zh,
    En,
    #[default]
    Auto,
}

/// 视觉主题。
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Light,
    Dark,
    #[default]
    System,
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
    /// API 类型（协议），V1 固定为 "anthropic-messages"。
    pub api_type: String,
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
            api_type: "anthropic-messages".into(),
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
            min_size: Size {
                width: 800,
                height: 800,
            },
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

/// 单个计费提供商配置（V0 schema, V2 仅用于迁移输入）。
///
/// V2: 不再保留,仅供 V0 → V1.5 迁移读取 `Settings.billing_providers` 字段。
/// 迁移完成后此 Vec 立即清空,不会出现在 V2 settings.json。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BillingProviderConfig {
    pub id: String,
    pub enabled: bool,
    /// 轮询此提供商的频率（秒）。清理后 >= 60（决策 ADR-0011）。
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

/// V2 工作区配置（ADR-0013）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub label: String,
    pub root_path: PathBuf,
    pub enabled: bool,
}

// ─────────────────────────────────────────────────────────────────────────────
// 设置
// ─────────────────────────────────────────────────────────────────────────────

/// 完整的 V1.5 设置对象。
///
/// V1.5 schema：统一 `providers[]` 替代 `llm_providers[] + billing_providers[]` 双数组。
/// V2: `billing_providers` 字段保留为 V0 迁移输入,迁移后立即清空。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    // ─── V1.5 新字段 ───────────────────────────────────────────────────────────
    /// 统一的 Provider 列表。V1.5+ 唯一数据源。
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub providers: Vec<Provider>,

    /// Schema 版本标记。用于检测并触发 V0/V1 → V1.5 自动迁移。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub schema_version: Option<String>,

    // ─── V1 遗留字段（迁移期间保留, V1.5 后逐渐废弃）───────────────────────────
    /// @deprecated V1 schema。V1.5+ 使用 `providers`。
    #[serde(default)]
    pub llm_providers: Vec<LLMProvider>,

    /// @deprecated V1 schema。V1.5+ 使用 `providers`。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_llm_provider_id: Option<String>,

    // ─── V1 保留字段 ─────────────────────────────────────────────────────────
    pub user_language: UserLanguage,
    pub theme: Theme,
    pub start_at_login: bool,
    pub window: WindowSettings,
    pub system_prompt: SystemPromptSettings,

    /// @deprecated V0 schema。V2 迁移输入,迁移后清空,不会写入 settings.json。
    /// 保留字段以支持从老 settings 文件读取并迁移。
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub billing_providers: Vec<BillingProviderConfig>,

    pub conversations: ConversationSettings,

    // ─── V2 新字段 ───────────────────────────────────────────────────────────
    /// V2 工作区列表。V1→V2 迁移时若无此字段则默认空 Vec（用户 opt-in）。
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub workspaces: Vec<Workspace>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            // V1.5: MiniMax pre-fill (ADR-0011)
            providers: vec![Provider {
                id: "minimax".into(),
                label: "MiniMax".into(),
                enabled: true,
                api_key: String::new(),
                llm: ProviderLlm {
                    default_model: "MiniMax-M2.5-highspeed".into(),
                    base_url: "https://api.minimaxi.com/anthropic".into(),
                    api_type: "anthropic-messages".into(),
                    llm_api_key_ref: "llm_providers/minimax/api_key".into(),
                    models: vec![ModelMeta {
                        id: "MiniMax-M2.5-highspeed".into(),
                        label: "MiniMax-M2.5-highspeed".into(),
                        context_window: Some(200_000),
                        deprecated: false,
                        thinking: false,
                    }],
                    models_endpoint: "https://api.minimaxi.com/anthropic/v1/models".into(),
                },
            }],
            schema_version: Some(SCHEMA_VERSION_V15.to_string()),
            // V1 legacy fields (empty for fresh V1.5 install)
            llm_providers: Vec::new(),
            default_llm_provider_id: None,
            user_language: UserLanguage::default(),
            theme: Theme::default(),
            start_at_login: true,
            window: WindowSettings::default(),
            system_prompt: SystemPromptSettings {
                default: "You are an AI assistant with access to file system tools.\n\
\n## File Tools\n\
You have access to 5 file tools (read_file, write_file, edit_file, search_files, delete_file).\n\
Each tool requires a workspace_id parameter — only operate within user-configured workspaces.\n\
Paths outside any workspace will return a SandboxViolation error.\n\
For edit_file, your old_text must match exactly once unless you set replace_all=true.\n\
Files are limited to 10 MB. Binary files, .exe/.dll/.sys files, and paths outside workspaces are blocked.".into(),
                user_can_edit: true,
            },
            billing_providers: Vec::new(),
            conversations: ConversationSettings::default(),
            workspaces: Vec::new(),
        }
    }
}

impl Settings {
    /// 刷新间隔的下限（秒），避免疯狂请求提供商 API。
    /// V2: billing_providers 迁移后会清空,所以 refresh_interval 实际不参与调度。
    /// 保留此方法以供 V0 迁移中钳制 billing_providers[i].refresh_interval_secs。
    pub const MIN_REFRESH_SECS: u64 = 60;

    /// 返回所有已启用计费提供商中的最短刷新间隔,
    /// 以 `MIN_REFRESH_SECS` 为下限。V2: 总是返回 MIN_REFRESH_SECS
    /// (因为 billing_providers 总是空)。
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
    //   1. refresh_interval_secs >= 60  （向上钳制，决策 ADR-0011）— V0 迁移用
    //   2. low_quota_threshold_pct ∈ [0, 100]  （范围钳制）— 删
    //   3. low_balance_threshold >= 0   （向上钳制）— 删
    //   4. auto_archive_after_days >= 1  （向上钳制）
    //   5. max_history >= 10            （向上钳制）
    // ─────────────────────────────────────────────────────────────────────────

    pub fn sanitized(mut self) -> Self {
        // ─── V0/V1 → V1.5 迁移 ───────────────────────────────────────────────
        if self.schema_version.as_deref() != Some(SCHEMA_VERSION_V15) {
            self = migrate_to_v1_5(self);
        }

        // 不变量 1：refresh_interval_secs >= MIN_REFRESH_SECS（V0 迁移期用）
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

/// V0/V1 → V1.5 schema 迁移。
///
/// V2: billing 子字段已删除。迁移时 V0 settings 的 `billing_providers` 字段
/// 仍然读取(因为它有 `#[serde(default, skip_serializing_if = "Vec::is_empty")]`
/// 反序列化支持),但 Provider 构造时不再设 `billing` 字段 — billing 业务在 V2
/// 整体下线,前端不再有 get_balance / get_plan_quota 工具。
fn migrate_to_v1_5(mut settings: Settings) -> Settings {
    // 已是 V1.5,跳过迁移
    if settings.schema_version.as_deref() == Some(SCHEMA_VERSION_V15) {
        return settings;
    }

    // 检测 V0.5（llm_providers 为空）→ fresh install,预填 MiniMax
    if settings.llm_providers.is_empty() && settings.billing_providers.is_empty() {
        let default_settings = Settings::default();
        settings.providers = default_settings.providers;
        settings.schema_version = Some(SCHEMA_VERSION_V15.to_string());
        return settings;
    }

    // V0/V1 schema 迁移。V2: 不再携带 billing 字段。
    let mut new_providers: Vec<Provider> = Vec::new();

    for llm in &settings.llm_providers {
        let provider_llm = ProviderLlm {
            default_model: llm.default_model.clone().unwrap_or_else(|| {
                if llm.id == "deepseek" {
                    "deepseek-chat".into()
                } else {
                    "MiniMax-M2.5-highspeed".into()
                }
            }),
            base_url: llm.base_url.clone().unwrap_or_else(|| {
                if llm.id == "deepseek" {
                    "https://api.deepseek.com/anthropic".into()
                } else {
                    "https://api.minimaxi.com/anthropic".into()
                }
            }),
            api_type: llm.api_type.clone(),
            llm_api_key_ref: llm.api_key_ref.clone().unwrap_or_else(|| {
                format!("llm_providers/{}/api_key", llm.id)
            }),
            models: vec![ModelMeta {
                id: llm.default_model.clone().unwrap_or_else(|| {
                    if llm.id == "deepseek" {
                        "deepseek-chat".into()
                    } else {
                        "MiniMax-M2.5-highspeed".into()
                    }
                }),
                label: llm.default_model.clone().unwrap_or_else(|| {
                    if llm.id == "deepseek" {
                        "deepseek-chat".into()
                    } else {
                        "MiniMax-M2.5-highspeed".into()
                    }
                }),
                context_window: None,
                deprecated: false,
                thinking: false,
            }],
            models_endpoint: if llm.id == "deepseek" {
                "https://api.deepseek.com/models".into()
            } else {
                "https://api.minimaxi.com/anthropic/v1/models".into()
            },
        };

        new_providers.push(Provider {
            id: llm.id.clone(),
            label: llm.label.clone(),
            enabled: llm.enabled,
            api_key: String::new(),
            llm: provider_llm,
        });
    }

    settings.providers = new_providers;
    settings.schema_version = Some(SCHEMA_VERSION_V15.to_string());

    // 迁移完成后清空旧字段(避免重复迁移)
    settings.llm_providers.clear();
    settings.billing_providers.clear();
    settings.default_llm_provider_id = None;

    settings
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ─── V1.5 默认设置测试 ───────────────────────────────────────────────────

    #[test]
    fn default_settings_sanity() {
        let s = Settings::default();
        assert_eq!(s.schema_version, Some("1.5".to_string()));
        // MiniMax pre-fill (ADR-0011)
        assert_eq!(s.providers.len(), 1);
        assert_eq!(s.providers[0].id, "minimax");
        assert_eq!(s.providers[0].llm.api_type, "anthropic-messages");
        // V1 legacy fields 已清空
        assert!(s.llm_providers.is_empty());
        assert!(s.billing_providers.is_empty());
        assert!(s.default_llm_provider_id.is_none());
        assert_eq!(s.user_language, UserLanguage::Auto);
        assert_eq!(s.theme, Theme::System);
        assert!(s.start_at_login);
        assert_eq!(s.conversations.auto_archive_after_days, 30);
        assert_eq!(s.conversations.max_history, 1000);
    }

    #[test]
    fn default_minimax_model_is_m25_highspeed() {
        let s = Settings::default();
        assert_eq!(s.providers[0].llm.default_model, "MiniMax-M2.5-highspeed");
        assert_eq!(s.providers[0].llm.models[0].id, "MiniMax-M2.5-highspeed");
        assert_eq!(s.providers[0].llm.models_endpoint, "https://api.minimaxi.com/anthropic/v1/models");
    }

    // ─── V1.5 已迁移 settings 的 sanitized() 是 no-op ─────────────────────

    #[test]
    fn sanitized_v15_is_noop() {
        let s = Settings::default();
        let s2 = s.sanitized();
        assert_eq!(s2.schema_version, Some("1.5".to_string()));
        assert_eq!(s2.providers.len(), 1);
        assert_eq!(s2.providers[0].id, "minimax");
    }

    #[test]
    fn sanitized_v15_preserves_fields() {
        let mut s = Settings::default();
        s.user_language = UserLanguage::Zh;
        s.theme = Theme::Dark;
        s.conversations.auto_archive_after_days = 0;
        let s2 = s.sanitized();
        assert_eq!(s2.user_language, UserLanguage::Zh);
        assert_eq!(s2.theme, Theme::Dark);
        assert_eq!(s2.conversations.auto_archive_after_days, 1);
    }

    // ─── V0 settings.json → V1.5 迁移测试 ─────────────────────────────────

    #[test]
    fn migrate_v0_minimax_settings_to_v15() {
        // V0 fixture: llm_providers=[minimax], billing_providers=[minimax]
        // V2 迁移后 billing 字段被忽略 + 清空。
        let mut v0 = Settings::default();
        v0.llm_providers = vec![LLMProvider {
            id: "minimax".into(),
            label: "MiniMax".into(),
            enabled: true,
            default_model: Some("MiniMax-M2.5-highspeed".into()),
            base_url: Some("https://api.minimaxi.com/anthropic".into()),
            api_key_ref: Some("llm_providers/minimax/api_key".into()),
            api_type: "anthropic-messages".into(),
        }];
        v0.billing_providers = vec![BillingProviderConfig {
            id: "minimax".into(),
            enabled: true,
            refresh_interval_secs: 60,
            api_key_ref: Some("billing/minimax/api_key".into()),
        }];
        v0.providers.clear();
        v0.schema_version = None;

        let migrated = v0.sanitized();

        assert_eq!(migrated.schema_version, Some("1.5".to_string()));
        assert_eq!(migrated.providers.len(), 1);
        assert_eq!(migrated.providers[0].id, "minimax");
        assert!(migrated.providers[0].llm.default_model.contains("MiniMax"));
        // V1 legacy fields 已清空
        assert!(migrated.llm_providers.is_empty());
        assert!(migrated.billing_providers.is_empty());
    }

    #[test]
    fn migrate_v0_deepseek_settings_to_v15() {
        let mut v0 = Settings::default();
        v0.llm_providers = vec![LLMProvider {
            id: "deepseek".into(),
            label: "DeepSeek".into(),
            enabled: true,
            default_model: Some("deepseek-chat".into()),
            base_url: Some("https://api.deepseek.com/anthropic".into()),
            api_key_ref: Some("llm_providers/deepseek/api_key".into()),
            api_type: "anthropic-messages".into(),
        }];
        v0.billing_providers = vec![BillingProviderConfig {
            id: "deepseek".into(),
            enabled: true,
            refresh_interval_secs: 60,
            api_key_ref: Some("billing/deepseek/api_key".into()),
        }];
        v0.providers.clear();
        v0.schema_version = None;

        let migrated = v0.sanitized();

        assert_eq!(migrated.schema_version, Some("1.5".to_string()));
        assert_eq!(migrated.providers.len(), 1);
        assert_eq!(migrated.providers[0].id, "deepseek");
        assert_eq!(migrated.providers[0].llm.default_model, "deepseek-chat");
    }

    // ─── V0.5（无 llm_providers）→ V1.5 fresh install 测试 ───────────────

    #[test]
    fn migrate_v05_empty_settings_to_v15_fresh_install() {
        let mut v05 = Settings::default();
        v05.llm_providers.clear();
        v05.billing_providers.clear();
        v05.providers.clear();
        v05.schema_version = None;

        let migrated = v05.sanitized();

        assert_eq!(migrated.schema_version, Some("1.5".to_string()));
        assert_eq!(migrated.providers.len(), 1);
        assert_eq!(migrated.providers[0].id, "minimax");
    }

    // ─── 混合状态（仅有 llm 无 billing）迁移测试 ──────────────────────────

    #[test]
    fn migrate_llm_only_no_billing_to_v15() {
        let mut v0 = Settings::default();
        v0.llm_providers = vec![LLMProvider {
            id: "openrouter".into(),
            label: "OpenRouter".into(),
            enabled: true,
            default_model: Some("gpt-4o".into()),
            base_url: Some("https://openrouter.ai/anthropic".into()),
            api_key_ref: Some("llm_providers/openrouter/api_key".into()),
            api_type: "anthropic-messages".into(),
        }];
        v0.billing_providers.clear();
        v0.providers.clear();
        v0.schema_version = None;

        let migrated = v0.sanitized();

        assert_eq!(migrated.schema_version, Some("1.5".to_string()));
        assert_eq!(migrated.providers.len(), 1);
        assert_eq!(migrated.providers[0].id, "openrouter");
    }

    // ─── 已有 V1.5 schema 跳过迁移测试 ────────────────────────────────────

    #[test]
    fn already_v15_settings_not_migrated_again() {
        let v15 = Settings::default();
        let original_providers = v15.providers.clone();

        let result = v15.sanitized();

        assert_eq!(result.schema_version, Some("1.5".to_string()));
        assert_eq!(result.providers, original_providers);
        assert_eq!(result.providers[0].llm.models.len(), 1);
    }

    // ─── 已有测试 ────────────────────────────────────────────────────────

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
    fn settings_round_trip_via_serde() {
        let s = Settings {
            providers: vec![Provider {
                id: "deepseek".into(),
                label: "DeepSeek".into(),
                enabled: true,
                api_key: String::new(),
                llm: ProviderLlm {
                    default_model: "deepseek-chat".into(),
                    base_url: "https://api.deepseek.com/anthropic".into(),
                    api_type: "anthropic-messages".into(),
                    llm_api_key_ref: "llm_providers/deepseek/api_key".into(),
                    models: vec![ModelMeta {
                        id: "deepseek-chat".into(),
                        label: "DeepSeek Chat".into(),
                        context_window: Some(64000),
                        deprecated: false,
                        thinking: false,
                    }],
                    models_endpoint: "https://api.deepseek.com/models".into(),
                },
            }],
            schema_version: Some("1.5".to_string()),
            llm_providers: Vec::new(),
            default_llm_provider_id: None,
            user_language: UserLanguage::En,
            theme: Theme::Dark,
            start_at_login: false,
            window: WindowSettings::default(),
            system_prompt: SystemPromptSettings {
                default: "You are a helpful assistant.".into(),
                user_can_edit: true,
            },
            billing_providers: Vec::new(),
            conversations: ConversationSettings::default(),
            workspaces: Vec::new(),
        };
        let json = serde_json::to_string(&s).unwrap();
        let back: Settings = serde_json::from_str(&json).unwrap();
        assert_eq!(back.providers[0].id, "deepseek");
        assert_eq!(back.providers[0].llm.default_model, "deepseek-chat");
        assert_eq!(back.schema_version, Some("1.5".to_string()));
        assert_eq!(back.user_language, UserLanguage::En);
        assert_eq!(back.theme, Theme::Dark);
    }

    #[test]
    fn size_defaults_to_1280x1280() {
        assert_eq!(Size::default().width, 1280);
        assert_eq!(Size::default().height, 1280);
    }

    #[test]
    fn size_round_trips_via_serde() {
        let sz = Size { width: 1024, height: 768 };
        let json = serde_json::to_string(&sz).unwrap();
        let back: Size = serde_json::from_str(&json).unwrap();
        assert_eq!(sz, back);
    }

    // ─── V2 工作区迁移测试 ────────────────────────────────────────────────

    #[test]
    fn v1_to_v2_workspace_default() {
        let v1_json = r#"{
            "providers": [],
            "schema_version": "1.5",
            "llm_providers": [],
            "user_language": "auto",
            "theme": "system",
            "start_at_login": true,
            "window": {
                "remember_position": true,
                "remember_size": true,
                "default_size": {"width": 1280, "height": 1280},
                "min_size": {"width": 800, "height": 800}
            },
            "system_prompt": {"default": "", "user_can_edit": true},
            "conversations": {"auto_archive_after_days": 30, "max_history": 1000}
        }"#;
        let loaded: Settings = serde_json::from_str(v1_json).unwrap();
        let sanitized = loaded.sanitized();
        assert!(
            sanitized.workspaces.is_empty(),
            "V1 settings should have empty workspaces, got {:?}",
            sanitized.workspaces
        );
    }

    #[test]
    fn workspace_preserved_through_sanitization() {
        let settings_with_workspace = Settings {
            workspaces: vec![Workspace {
                id: "w1".into(),
                label: "test workspace".into(),
                root_path: PathBuf::from(r"C:\test"),
                enabled: true,
            }],
            ..Settings::default()
        };
        let sanitized = settings_with_workspace.sanitized();
        assert_eq!(sanitized.workspaces.len(), 1);
        assert_eq!(sanitized.workspaces[0].id, "w1");
        assert_eq!(sanitized.workspaces[0].label, "test workspace");
        assert_eq!(sanitized.workspaces[0].root_path, PathBuf::from(r"C:\test"));
        assert!(sanitized.workspaces[0].enabled);
    }
}
