//! 适配器、调度器、命令和前端共用的域类型。
//!
//! 项目词汇表见 `CONTEXT.md`；此处名称刻意与该文档一致。
//!
//! V2 简化: Snapshot / SnapshotEnvelope / ProviderBilling / BillingKind /
//! ProviderId / ProviderError 已移除。计费 API key 仍由 keyring 管理,
//! 详见 secrets.rs; 但不再有前端可见的 "billing tool" 抽象。

use serde::{Deserialize, Serialize};

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
// V1.5+ Provider schema (LLM-only — billing removed V2)
// ─────────────────────────────────────────────────────────────────────────────

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

/// 统一的 Provider 记录。V2: 仅 LLM 配置,billing 子字段删除。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Provider {
    pub id: String,
    pub label: String,
    pub enabled: bool,
    /// LLM API Key，明文，单字段，Settings JSON 一部分（ADR-0015）。
    pub api_key: String,
    /// LLM 配置，必选。
    pub llm: ProviderLlm,
}

#[cfg(test)]
mod tests {
    use super::*;

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
