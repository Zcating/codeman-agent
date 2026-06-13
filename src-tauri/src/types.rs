//! Domain types shared by adapters, scheduler, commands, and the frontend.
//!
//! See `CONTEXT.md` for the project vocabulary; the names here intentionally
//! mirror that document.

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

/// Identifies a billing source. Stable string used in settings and as a
/// keyring namespace prefix.
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

/// The two billing shapes we surface. See `CONTEXT.md` for the rationale
/// for keeping these visually distinct on the widget.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderKind {
    Balance,
    PlanQuota,
}

/// A fetched billing state for a single provider. The variants are
/// intentionally not collapsible: Balance and PlanQuota have different
/// information density and the widget renders them with different layouts.
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

/// Result of a fetch wrapped with metadata the frontend wants regardless
/// of success. We always emit something so the widget can show a stale
/// state instead of going blank.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotEnvelope {
    pub provider: ProviderId,
    pub snapshot: Option<Snapshot>,
    pub fetched_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// A provider-agnostic description of a billing source. Used by the
/// frontend to render the provider switcher without coupling to adapter
/// internals.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderDescriptor {
    pub id: ProviderId,
    pub label: &'static str,
    pub kind: ProviderKind,
    pub has_key: bool,
}

/// Errors surfaced from adapters. Generic enough to wrap reqwest, serde,
/// keyring, and adapter-specific parsing failures without leaking API
/// key material.
#[derive(Debug, thiserror::Error)]
pub enum ProviderError {
    #[error("missing api key for provider {0}")]
    MissingKey(ProviderId),
    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("invalid response: {0}")]
    InvalidResponse(String),
    #[error("upstream error: {0}")]
    Upstream(String),
    #[error("endpoint not configured")]
    EndpointNotConfigured,
}

/// Newtype around `String` representing an API key. The `Debug` and
/// `Display` impls are deliberately redacted so log statements and
/// error chains never reveal the value.
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

/// Application-level errors for IPC commands. Typed `kind` enables
/// the TS bridge to translate to typed errors without parsing strings.
#[derive(Debug, thiserror::Error, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AppError {
    #[error("not found: {message}")]
    NotFound { message: String },
    #[error("invalid config: {message}")]
    InvalidConfig { message: String },
    #[error("unauthorized: {message}")]
    Unauthorized { message: String },
    #[error("upstream error: {message}")]
    Upstream { message: String },
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        AppError::Upstream { message: e.to_string() }
    }
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
}
