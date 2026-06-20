//! 适配器、调度器、命令和前端共用的域类型。
//!
//! 项目词汇表见 `CONTEXT.md`；此处名称刻意与该文档一致。

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

/// 计费来源的标识符。稳定字符串，用于设置和 keyring 命名空间前缀。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProviderId {
    Deepseek,
    Minimax,
}

impl ProviderId {
    pub const ALL: &'static [ProviderId] = &[ProviderId::Deepseek, ProviderId::Minimax];

    pub fn as_str(self) -> &'static str {
        match self {
            ProviderId::Deepseek => "deepseek",
            ProviderId::Minimax => "minimax",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            ProviderId::Deepseek => "DeepSeek",
            ProviderId::Minimax => "MiniMax",
        }
    }

    pub fn next(self) -> ProviderId {
        match self {
            ProviderId::Deepseek => ProviderId::Minimax,
            ProviderId::Minimax => ProviderId::Deepseek,
        }
    }
}

impl std::fmt::Display for ProviderId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// 我们呈现的两种计费形态。保持视觉差异的原因见 `CONTEXT.md`。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderKind {
    Balance,
    PlanQuota,
}

/// 单个提供商的获取到的计费状态。变体故意不可合并：Balance 和 PlanQuota
/// 信息密度不同，小部件用不同布局渲染。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Snapshot {
    Balance {
        amount: Decimal,
        currency: String,
        auto_recharge: Option<bool>,
    },
    PlanQuota {
        remaining: u64,
        total: u64,
        #[serde(skip_serializing_if = "Option::is_none")]
        expires_at: Option<DateTime<Utc>>,
        #[serde(skip_serializing_if = "Option::is_none")]
        daily_avg: Option<u64>,
    },
}

impl Snapshot {
    pub fn kind(&self) -> ProviderKind {
        match self {
            Snapshot::Balance { .. } => ProviderKind::Balance,
            Snapshot::PlanQuota { .. } => ProviderKind::PlanQuota,
        }
    }
}

/// 获取结果的包装，包含前端需要的中继数据，无论成功与否。
/// 我们总是发出内容，这样部件可以显示过期状态而不是空白。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotEnvelope {
    pub provider: ProviderId,
    pub snapshot: Option<Snapshot>,
    pub fetched_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// 提供商无关的计费来源描述。供前端渲染提供商切换器，
/// 不与适配器内部耦合。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderDescriptor {
    pub id: ProviderId,
    pub label: &'static str,
    pub kind: ProviderKind,
    pub has_key: bool,
}

/// 适配器抛出的错误。足够通用，可包装 reqwest、serde、keyring
/// 和适配器特定的解析失败，而不泄露 API 密钥材料。
#[derive(Debug, thiserror::Error)]
pub enum ProviderError {
    #[error("缺少提供商 {0} 的 API 密钥")]
    MissingKey(ProviderId),
    #[error("HTTP 错误：{0}")]
    Http(#[from] reqwest::Error),
    #[error("响应无效：{0}")]
    InvalidResponse(String),
    #[error("上游错误：{0}")]
    Upstream(String),
    #[error("端点未配置")]
    EndpointNotConfigured,
}

/// `String` 的 newtype，表示 API 密钥。`Debug` 和 `Display` 实现
/// 故意遮挡，日志语句和错误链永不会暴露其值。
#[derive(Clone)]
pub struct Secret(String);

impl Secret {
    pub fn new(value: impl Into<String>) -> Self {
        Secret(value.into())
    }

    pub fn empty() -> Self {
        Secret(String::new())
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// Borrow the underlying value. Intended only for places that have to
    /// hand the key to an HTTP client.
    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Debug for Secret {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Secret(***)")
    }
}

impl std::fmt::Display for Secret {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "***")
    }
}

impl From<String> for Secret {
    fn from(value: String) -> Self {
        Secret(value)
    }
}

/// IPC 命令的应用级错误。类型化的 `kind` 使 TS 桥接层可以
/// 转换为类型化错误，而无需解析字符串。
#[derive(Debug, thiserror::Error, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AppError {
    #[error("未找到：{message}")]
    NotFound { message: String },
    #[error("配置无效：{message}")]
    InvalidConfig { message: String },
    #[error("未授权：{message}")]
    Unauthorized { message: String },
    #[error("上游错误：{message}")]
    Upstream { message: String },
    #[error("Sandbox violation: {path} is outside workspace {workspace_label}")]
    SandboxViolation { path: String, workspace_label: String },
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        AppError::Upstream { message: e.to_string() }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// V1.5+ Provider schema (unified llm + billing)
// ─────────────────────────────────────────────────────────────────────────────

/// 计费类型。决策 ADR-0012：V1.5+ billing 全迁 TS，不再用 Rust adapter。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BillingKind {
    Balance,
    PlanQuota,
}

/// 单个模型的元数据。供 Settings UI 渲染模型选择器。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModelMeta {
    pub id: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_window: Option<u32>,
    pub deprecated: bool,
    pub thinking: bool,
}

/// 单个提供商的计费配置。V1.5+ 存 Tauri store（V0 是 keyring）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProviderBilling {
    pub kind: BillingKind,
    /// 指向 Tauri store 的路径，如 `"billing/minimax/api_key"`。
    pub billing_api_key_ref: String,
}

/// 单个提供商的 LLM 配置。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProviderLlm {
    pub default_model: String,
    pub base_url: String,
    /// API 类型，V1.5+ 固定为 `"anthropic-messages"`（ADR-0011）。
    pub api_type: String,
    /// 指向 Tauri store 的路径，如 `"llm_providers/minimax/api_key"`。
    pub llm_api_key_ref: String,
    pub models: Vec<ModelMeta>,
    pub models_endpoint: String,
}

/// 统一的 Provider 记录。V1.5+ schema 替代 `llm_providers[] + billing_providers[]` 双数组。
/// 每条记录 `llm` 必选 + `billing` 可选（ADR-0012）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Provider {
    pub id: String,
    pub label: String,
    pub enabled: bool,
    /// LLM API Key，明文，单字段，Settings JSON 一部分（ADR-0015）。
    pub api_key: String,
    /// LLM 配置，必选。
    pub llm: ProviderLlm,
    /// 计费配置，可选（某些 provider 只有 LLM 没有 billing）。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub billing: Option<ProviderBilling>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secret_redacts_in_debug_and_display() {
        let s = Secret::new("super-secret-token");
        assert_eq!(format!("{}", s), "***");
        assert_eq!(format!("{:?}", s), "Secret(***)");
    }

    #[test]
    fn provider_id_round_trip() {
        for id in ProviderId::ALL {
            let json = serde_json::to_string(id).unwrap();
            let back: ProviderId = serde_json::from_str(&json).unwrap();
            assert_eq!(*id, back);
        }
    }

    #[test]
    fn next_provider_cycles() {
        assert_eq!(ProviderId::Deepseek.next(), ProviderId::Minimax);
        assert_eq!(ProviderId::Minimax.next(), ProviderId::Deepseek);
    }

    #[test]
    fn snapshot_balance_serializes_with_kind_tag() {
        let snap = Snapshot::Balance {
            amount: Decimal::new(8742, 2),
            currency: "CNY".into(),
            auto_recharge: Some(true),
        };
        let v: serde_json::Value = serde_json::to_value(&snap).unwrap();
        assert_eq!(v["kind"], "balance");
        assert_eq!(v["amount"], "87.42");
    }

    #[test]
    fn sandbox_violation_display() {
        let err = AppError::SandboxViolation {
            path: "/etc/passwd".into(),
            workspace_label: "default".into(),
        };
        assert_eq!(
            err.to_string(),
            "Sandbox violation: /etc/passwd is outside workspace default"
        );
    }

    #[test]
    fn sandbox_violation_distinct_discriminant() {
        let sandbox_err = AppError::SandboxViolation {
            path: "/etc/passwd".into(),
            workspace_label: "default".into(),
        };
        let not_found_err = AppError::NotFound {
            message: "test".into(),
        };
        assert_ne!(
            std::mem::discriminant(&sandbox_err),
            std::mem::discriminant(&not_found_err)
        );
    }
}
