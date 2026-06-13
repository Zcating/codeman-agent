//! DeepSeek adapter.
//!
//! `GET https://api.deepseek.com/user/balance` with a bearer token.
//! The upstream response lists one entry per currency; we aggregate to
//! a single `Balance` snapshot using the first non-empty entry (and
//! pick CNY by default if present, since the widget displays CNY).
//!
//! Response shape (per public docs):
//! ```json
//! {
//!   "is_available": true,
//!   "balance_infos": [
//!     { "currency": "CNY", "balance": "87.42", "auto_recharge": true }
//!   ]
//! }
//! ```

use crate::providers::Provider;
use crate::types::{ProviderError, ProviderId, ProviderKind, Secret, Snapshot};
use async_trait::async_trait;
use reqwest::Client;
use rust_decimal::Decimal;
use serde::Deserialize;

const ENDPOINT: &str = "https://api.deepseek.com/user/balance";

pub struct DeepSeekAdapter {
    endpoint: String,
}

impl DeepSeekAdapter {
    pub fn new() -> Self {
        Self {
            endpoint: ENDPOINT.to_string(),
        }
    }

    #[cfg(test)]
    pub fn with_endpoint(mut self, endpoint: impl Into<String>) -> Self {
        self.endpoint = endpoint.into();
        self
    }

    fn endpoint(&self) -> &str {
        &self.endpoint
    }
}

impl Default for DeepSeekAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Provider for DeepSeekAdapter {
    fn id(&self) -> ProviderId {
        ProviderId::Deepseek
    }

    fn kind(&self) -> ProviderKind {
        ProviderKind::Balance
    }

    fn label(&self) -> &'static str {
        "DeepSeek"
    }

    async fn fetch(
        &self,
        client: &Client,
        secret: &Secret,
    ) -> Result<Snapshot, ProviderError> {
        if secret.is_empty() {
            return Err(ProviderError::MissingKey(self.id()));
        }

        let resp = client
            .get(self.endpoint())
            .bearer_auth(secret.expose())
            .send()
            .await?;
        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(ProviderError::Upstream(format!("{status}: {body}")));
        }

        let payload: DeepSeekBalance = resp
            .json()
            .await
            .map_err(|e| ProviderError::InvalidResponse(format!("json parse: {e}")))?;
        let entry = pick_balance_entry(&payload.balance_infos).ok_or_else(|| {
            ProviderError::InvalidResponse("no balance_infos entries".into())
        })?;

        let amount = entry
            .balance
            .parse::<Decimal>()
            .map_err(|e| ProviderError::InvalidResponse(format!("balance parse: {e}")))?;

        Ok(Snapshot::Balance {
            amount,
            currency: entry.currency.clone(),
            auto_recharge: entry.auto_recharge,
        })
    }
}

#[derive(Debug, Deserialize)]
struct DeepSeekBalance {
    #[serde(default)]
    #[allow(dead_code)]
    is_available: Option<bool>,
    balance_infos: Vec<DeepSeekBalanceInfo>,
}

#[derive(Debug, Deserialize)]
struct DeepSeekBalanceInfo {
    currency: String,
    balance: String,
    #[serde(default)]
    auto_recharge: Option<bool>,
}

/// Pick the entry to render. Prefer CNY (the widget's default currency);
/// otherwise fall back to the first entry.
fn pick_balance_entry(entries: &[DeepSeekBalanceInfo]) -> Option<&DeepSeekBalanceInfo> {
    entries
        .iter()
        .find(|e| e.currency.eq_ignore_ascii_case("CNY"))
        .or_else(|| entries.first())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Secret;
    use serde_json::json;
    use wiremock::matchers::{bearer_token, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[test]
    fn prefers_cny_when_present() {
        let entries = vec![
            DeepSeekBalanceInfo {
                currency: "USD".into(),
                balance: "1.00".into(),
                auto_recharge: Some(false),
            },
            DeepSeekBalanceInfo {
                currency: "CNY".into(),
                balance: "87.42".into(),
                auto_recharge: Some(true),
            },
        ];
        let picked = pick_balance_entry(&entries).unwrap();
        assert_eq!(picked.currency, "CNY");
    }

    #[test]
    fn falls_back_to_first_entry() {
        let entries = vec![DeepSeekBalanceInfo {
            currency: "USD".into(),
            balance: "5.00".into(),
            auto_recharge: None,
        }];
        let picked = pick_balance_entry(&entries).unwrap();
        assert_eq!(picked.currency, "USD");
    }

    #[tokio::test]
    async fn parses_canonical_response() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/user/balance"))
            .and(bearer_token("sk-test"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "is_available": true,
                "balance_infos": [
                    {"currency": "CNY", "balance": "87.42", "auto_recharge": true}
                ]
            })))
            .mount(&server)
            .await;

        let adapter = DeepSeekAdapter::new()
            .with_endpoint(format!("{}{}", server.uri(), "/user/balance"));
        let snapshot = adapter
            .fetch(&Client::new(), &Secret::new("sk-test"))
            .await
            .unwrap();
        match snapshot {
            Snapshot::Balance {
                amount,
                currency,
                auto_recharge,
            } => {
                assert_eq!(amount, Decimal::new(8742, 2));
                assert_eq!(currency, "CNY");
                assert_eq!(auto_recharge, Some(true));
            }
            _ => panic!("expected balance snapshot"),
        }
    }

    #[tokio::test]
    async fn fetch_returns_upstream_error_on_non_2xx() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/user/balance"))
            .and(bearer_token("sk-test"))
            .respond_with(ResponseTemplate::new(401).set_body_json(json!({
                "error": "unauthorized"
            })))
            .mount(&server)
            .await;

        let adapter = DeepSeekAdapter::new()
            .with_endpoint(format!("{}{}", server.uri(), "/user/balance"));
        let result = adapter
            .fetch(&Client::new(), &Secret::new("sk-test"))
            .await;
        assert!(matches!(result, Err(ProviderError::Upstream(_))));
    }

    #[tokio::test]
    async fn fetch_returns_invalid_response_on_malformed_json() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/user/balance"))
            .and(bearer_token("sk-test"))
            .respond_with(ResponseTemplate::new(200).set_body_string("not json"))
            .mount(&server)
            .await;

        let adapter = DeepSeekAdapter::new()
            .with_endpoint(format!("{}{}", server.uri(), "/user/balance"));
        let result = adapter
            .fetch(&Client::new(), &Secret::new("sk-test"))
            .await;
        assert!(matches!(result, Err(ProviderError::InvalidResponse(_))));
    }

    #[tokio::test]
    async fn fetch_rejects_empty_secret() {
        let adapter = DeepSeekAdapter::new();
        let client = Client::new();
        let result = adapter.fetch(&client, &Secret::empty()).await;
        assert!(matches!(result, Err(ProviderError::MissingKey(_))));
    }
}
