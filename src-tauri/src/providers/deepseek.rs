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

pub struct DeepSeekAdapter;

impl DeepSeekAdapter {
    pub fn new() -> Self {
        Self
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
            .get(ENDPOINT)
            .bearer_auth(secret.expose())
            .send()
            .await?;
        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(ProviderError::Upstream(format!("{status}: {body}")));
        }

        let payload: DeepSeekBalance = resp.json().await?;
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

        let client = Client::new();
        let adapter = DeepSeekAdapter::new();
        // We override the endpoint to point at the mock via reqwest's
        // `base_url`-less client by rewriting the URL inside the adapter
        // call. The trait doesn't expose that, so for this test we drive
        // the parsing path directly.
        let raw: DeepSeekBalance = reqwest::Client::new()
            .get(format!("{}{}", server.uri(), "/user/balance"))
            .bearer_auth("sk-test")
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        let entry = pick_balance_entry(&raw.balance_infos).unwrap();
        let amount: Decimal = entry.balance.parse().unwrap();
        assert_eq!(amount, Decimal::new(8742, 2));
        assert_eq!(entry.currency, "CNY");
        assert_eq!(entry.auto_recharge, Some(true));
        let _ = (&adapter as &dyn Provider).id();
    }

    #[tokio::test]
    async fn fetch_rejects_empty_secret() {
        let adapter = DeepSeekAdapter::new();
        let client = Client::new();
        let result = adapter.fetch(&client, &Secret::empty()).await;
        assert!(matches!(result, Err(ProviderError::MissingKey(_))));
    }
}
