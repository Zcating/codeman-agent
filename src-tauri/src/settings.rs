//! 基于 `tauri-plugin-store` 的类型化设置存储。
//!
//! 插件在 OS app-data 目录下持久化一个 JSON 文件。我们在启动时读取它，
//! 字段缺失时应用默认值，字段变更时将整个结构体写回。API 密钥永不存于此；
//! 见 `secrets`。

use crate::types::{BillingKind, ModelMeta, Provider, ProviderBilling, ProviderLlm};
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

/// 单个计费提供商配置。
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
/// 所有写入必须经过 `Settings::sanitized()` 以强制执行其列出的不变量。
/// V1.5 schema：统一 `providers[]` 替代 `llm_providers[] + billing_providers[]` 双数组。
/// 规范 schema（权威来源）见 `CONTEXT.md"Settings (V1.5 shape)"`，
/// TS 镜像见 `src/lib/types.ts`。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    // ─── V1.5 新字段 ───────────────────────────────────────────────────────────
    /// 统一的 Provider 列表。V1.5+ 唯一数据源。
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub providers: Vec<Provider>,

    /// Schema 版本标记。用于检测并触发 V0/V1 → V1.5 自动迁移。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub schema_version: Option<String>,

    // ─── V1 遗留字段（迁移期间保留，V1.5 后逐渐废弃）───────────────────────────
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

    /// @deprecated V1 schema。V1.5+ 使用 `providers`。
    #[serde(default)]
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
                billing: Some(ProviderBilling {
                    kind: BillingKind::PlanQuota,
                    billing_api_key_ref: "billing/minimax/api_key".into(),
                }),
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
                default: "You are an AI assistant with access to billing tools and file system tools.\n\
\n## Billing Tools\nYou can call get_balance and get_plan_quota to check provider billing state.\n\
\n## File Tools\nYou have access to 5 file tools (read_file, write_file, edit_file, search_files, delete_file).\n\
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
    /// 决策 ADR-0011：从 5 提到 60——LLM 厂商余额变化以分钟/小时计，
    /// 60s 满足"用户切换/打开窗口后 1 分钟内看到数据"。
    pub const MIN_REFRESH_SECS: u64 = 60;

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
    //   1. refresh_interval_secs >= 60  （向上钳制，决策 ADR-0011）
    //   2. low_quota_threshold_pct ∈ [0, 100]  （范围钳制）
    //   3. low_balance_threshold >= 0   （向上钳制）
    //   4. auto_archive_after_days >= 1  （向上钳制）
    //   5. max_history >= 10            （向上钳制）
    // ─────────────────────────────────────────────────────────────────────────

    pub fn sanitized(mut self) -> Self {
        // ─── V0/V1 → V1.5 迁移 ───────────────────────────────────────────────
        // 注意：keyring → Tauri store key 迁移需要在 apply_settings() 中
        // 调用 keyring I/O，这里只做 schema 迁移。
        if self.schema_version.as_deref() != Some(SCHEMA_VERSION_V15) {
            self = migrate_to_v1_5(self);
        }

        // 不变量 1：refresh_interval_secs >= MIN_REFRESH_SECS（V1 legacy）
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
/// 检测逻辑：
/// - `schema_version == Some("1.5")` → 已迁移，no-op
/// - `llm_providers` 非空 → V0/V1 schema，触发迁移
/// - `llm_providers` 为空 → V0.5 或 V1.5 fresh install，预填 MiniMax
///
/// V1.5 迁移规则（ADR-0012）：
/// - 每个 LLM provider → 新的 Provider 记录（llm 必选）
/// - 匹配 id 的 billing provider → Provider.billing（可选）
/// - billing provider 无匹配 LLM → 跳过（V1 设计不可能出现）
/// - 迁移后 schema_version = "1.5"，旧字段清空
fn migrate_to_v1_5(mut settings: Settings) -> Settings {
    // 已是 V1.5，跳过迁移
    if settings.schema_version.as_deref() == Some(SCHEMA_VERSION_V15) {
        return settings;
    }

    // 检测 V0.5（llm_providers 为空）→ fresh install，预填 MiniMax
    if settings.llm_providers.is_empty() && settings.billing_providers.is_empty() {
        let default_settings = Settings::default();
        settings.providers = default_settings.providers;
        settings.schema_version = Some(SCHEMA_VERSION_V15.to_string());
        return settings;
    }

    // V0/V1 schema 迁移
    let billing_by_id: std::collections::HashMap<&str, &BillingProviderConfig> =
        settings.billing_providers.iter().map(|p| (p.id.as_str(), p)).collect();

    let mut new_providers: Vec<Provider> = Vec::new();

    for llm in &settings.llm_providers {
        let billing = billing_by_id.get(llm.id.as_str()).copied();

        // 构建 ProviderLlm
        let provider_llm = ProviderLlm {
            default_model: llm.default_model.clone().unwrap_or_else(|| {
                // V1 默认模型
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
            // V0 → V1.5 不迁移 models（用户需要在 Settings UI 重新刷新）
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

        // 构建 ProviderBilling（如果存在匹配的 billing provider）
        let provider_billing = billing.map(|b| ProviderBilling {
            kind: if llm.id == "deepseek" {
                BillingKind::Balance
            } else {
                BillingKind::PlanQuota
            },
            // V1.5 billing key 引用改为 Tauri store 路径
            billing_api_key_ref: b.api_key_ref.clone().unwrap_or_else(|| {
                format!("billing/{}/api_key", b.id)
            }),
        });

        new_providers.push(Provider {
            id: llm.id.clone(),
            label: llm.label.clone(),
            enabled: llm.enabled,
            api_key: String::new(),
            llm: provider_llm,
            billing: provider_billing,
        });
    }

    settings.providers = new_providers;
    settings.schema_version = Some(SCHEMA_VERSION_V15.to_string());

    // 迁移完成后清空旧字段（避免重复迁移）
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
        // V1.5 schema_version 已设置
        assert_eq!(s.schema_version, Some("1.5".to_string()));
        // MiniMax pre-fill (ADR-0011)
        assert_eq!(s.providers.len(), 1);
        assert_eq!(s.providers[0].id, "minimax");
        assert_eq!(s.providers[0].llm.api_type, "anthropic-messages");
        assert!(s.providers[0].billing.is_some());
        assert_eq!(s.providers[0].billing.as_ref().unwrap().kind, BillingKind::PlanQuota);
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
        let s = Settings::default(); // 已是 V1.5
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
        s.conversations.auto_archive_after_days = 0; // 会被钳制
        let s2 = s.sanitized();
        assert_eq!(s2.user_language, UserLanguage::Zh);
        assert_eq!(s2.theme, Theme::Dark);
        assert_eq!(s2.conversations.auto_archive_after_days, 1);
    }

    // ─── V0 settings.json → V1.5 迁移测试 ─────────────────────────────────

    #[test]
    fn migrate_v0_minimax_settings_to_v15() {
        // 构造 V0 settings fixture: llm_providers=[minimax], billing_providers=[minimax]
        let v0_settings = Settings {
            llm_providers: vec![LLMProvider {
                id: "minimax".into(),
                label: "MiniMax".into(),
                enabled: true,
                default_model: Some("MiniMax-M2.5-highspeed".into()),
                base_url: Some("https://api.minimaxi.com/anthropic".into()),
                api_key_ref: Some("llm_providers/minimax/api_key".into()),
                api_type: "anthropic-messages".into(),
            }],
            billing_providers: vec![BillingProviderConfig {
                id: "minimax".into(),
                enabled: true,
                refresh_interval_secs: 60,
                api_key_ref: Some("billing/minimax/api_key".into()),
            }],
            ..Settings::default()
        };
        // 清除默认 pre-fill，保留 V0 字段
        let mut v0 = Settings::default();
        v0.llm_providers = v0_settings.llm_providers;
        v0.billing_providers = v0_settings.billing_providers;
        v0.providers.clear();
        v0.schema_version = None;

        let migrated = v0.sanitized();

        // 验证迁移结果
        assert_eq!(migrated.schema_version, Some("1.5".to_string()));
        assert_eq!(migrated.providers.len(), 1);
        assert_eq!(migrated.providers[0].id, "minimax");
        assert!(migrated.providers[0].llm.default_model.contains("MiniMax"));
        assert!(migrated.providers[0].billing.is_some());
        assert_eq!(migrated.providers[0].billing.as_ref().unwrap().kind, BillingKind::PlanQuota);
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
        assert!(migrated.providers[0].billing.is_some());
        assert_eq!(migrated.providers[0].billing.as_ref().unwrap().kind, BillingKind::Balance);
    }

    // ─── V0.5（无 llm_providers）→ V1.5 fresh install 测试 ───────────────

    #[test]
    fn migrate_v05_empty_settings_to_v15_fresh_install() {
        // V0.5: llm_providers 和 billing_providers 都为空
        let mut v05 = Settings::default();
        v05.llm_providers.clear();
        v05.billing_providers.clear();
        v05.providers.clear();
        v05.schema_version = None;

        let migrated = v05.sanitized();

        // V0.5 treated as fresh install → pre-filled MiniMax
        assert_eq!(migrated.schema_version, Some("1.5".to_string()));
        assert_eq!(migrated.providers.len(), 1);
        assert_eq!(migrated.providers[0].id, "minimax");
        assert!(migrated.providers[0].billing.is_some());
    }

    // ─── 混合状态（仅有 llm 无 billing）迁移测试 ──────────────────────────

    #[test]
    fn migrate_llm_only_no_billing_to_v15() {
        // 仅有 LLM provider，无 billing provider（如新加的第三方 provider）
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
        assert!(migrated.providers[0].billing.is_none()); // 无 billing
    }

    // ─── 已有 V1.5 schema 跳过迁移测试 ────────────────────────────────────

    #[test]
    fn already_v15_settings_not_migrated_again() {
        let v15 = Settings::default(); // 已是 V1.5
        let original_providers = v15.providers.clone();

        let result = v15.sanitized();

        assert_eq!(result.schema_version, Some("1.5".to_string()));
        assert_eq!(result.providers, original_providers);
        // 确认不是重新创建，而是保持原样
        assert_eq!(result.providers[0].llm.models.len(), 1);
    }

    // ─── 已有测试（更新以适配 V1.5 schema）─────────────────────────────────

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
        // V1.5 settings round-trip
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
                billing: Some(ProviderBilling {
                    kind: BillingKind::Balance,
                    billing_api_key_ref: "billing/deepseek/api_key".into(),
                }),
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
        // V1 JSON 序列化（无 workspaces 字段），反序列化后 workspaces 应为空
        let v1_json = r#"{
            "providers": [],
            "schema_version": "1.5",
            "llm_providers": [],
            "billing_providers": [],
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