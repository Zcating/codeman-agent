//! MiniMax adapter.
//!
//! The plan records the MiniMax plan-quota endpoint as TBD. The adapter
//! is wired against a configurable URL that defaults to a placeholder
//! and returns `ProviderError::EndpointNotConfigured` until a verified
//! endpoint + response schema is documented in `CONTEXT.md`.
//!
//! Expected response shape (assumed; verified at endpoint-promotion time):
//! ```json
//! {
//!   "remaining": 1200000,
//!   "total": 5000000,
//!   "expires_at": "2026-06-30T00:00:00Z",
//!   "daily_avg": 12000
//! }
//! ```

use crate::providers::Provider;
use crate::types::{ProviderError, ProviderId, ProviderKind, Secret, Snapshot};
use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;

const PLACEHOLDER_ENDPOINT: &str = "https://api.minimax.example/v1/quota";

pub struct MiniMaxAdapter {
    endpoint: String,
}

impl MiniMaxAdapter {
    pub fn new() -> Self {
        Self {
            endpoint: PLACEHOLDER_ENDPOINT.to_string(),
        }
    }

    /// Override the endpoint. Used by tests and by future code that
    /// reads a verified URL from settings.
    #[allow(dead_code)]
    pub fn with_endpoint(mut self, endpoint: impl Into<String>) -> Self {
        self.endpoint = endpoint.into();
        self
    }
}

impl Default for MiniMaxAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Provider for MiniMaxAdapter {
    fn id(&self) -> ProviderId {
        ProviderId::Minimax
    }

    fn kind(&self) -> ProviderKind {
        ProviderKind::PlanQuota
    }

    fn label(&self) -> &'static str {
        "MiniMax"
    }

    async fn fetch(
        &self,
        client: &Client,
        secret: &Secret,
    ) -> Result<Snapshot, ProviderError> {
        if secret.is_empty() {
            return Err(ProviderError::MissingKey(self.id()));
        }
        if self.endpoint == PLACEHOLDER_ENDPOINT {
            return Err(ProviderError::EndpointNotConfigured);
        }

        let resp = client
            .get(&self.endpoint)
            .bearer_auth(secret.expose())
            .send()
            .await?;
        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(ProviderError::Upstream(format!("{status}: {body}")));
        }

        let payload: MiniMaxQuota = resp
            .json()
            .await
            .map_err(|e| ProviderError::InvalidResponse(format!("json parse: {e}")))?;
        if payload.total == 0 {
            return Err(ProviderError::InvalidResponse(
                "total quota must be > 0".into(),
            ));
        }

        Ok(Snapshot::PlanQuota {
            remaining: payload.remaining,
            total: payload.total,
            expires_at: payload.expires_at,
            daily_avg: payload.daily_avg,
        })
    }
}

#[derive(Debug, Deserialize)]
struct MiniMaxQuota {
    remaining: u64,
    total: u64,
    #[serde(default)]
    expires_at: Option<chrono::DateTime<chrono::Utc>>,
    #[serde(default)]
    daily_avg: Option<u64>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use wiremock::matchers::{bearer_token, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[test]
    fn default_endpoint_is_placeholder() {
        let a = MiniMaxAdapter::new();
        assert_eq!(a.endpoint, PLACEHOLDER_ENDPOINT);
    }

    #[test]
    fn with_endpoint_overrides() {
        let a = MiniMaxAdapter::new().with_endpoint("https://example.test/quota");
        assert_eq!(a.endpoint, "https://example.test/quota");
    }

    #[tokio::test]
    async fn fetch_rejects_placeholder_endpoint() {
        let a = MiniMaxAdapter::new();
        let client = Client::new();
        let result = a.fetch(&client, &Secret::new("tok")).await;
        assert!(matches!(result, Err(ProviderError::EndpointNotConfigured)));
    }

    #[tokio::test]
    async fn fetch_rejects_empty_secret() {
        let a = MiniMaxAdapter::new();
        let client = Client::new();
        let result = a.fetch(&client, &Secret::empty()).await;
        assert!(matches!(result, Err(ProviderError::MissingKey(_))));
    }

    #[tokio::test]
    async fn parses_valid_response() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/quota"))
            .and(bearer_token("tok"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "remaining": 1_200_000_u64,
                "total": 5_000_000_u64,
                "expires_at": "2026-06-30T00:00:00Z",
                "daily_avg": 12_000_u64
            })))
            .mount(&server)
            .await;

        let adapter = MiniMaxAdapter::new()
            .with_endpoint(format!("{}{}", server.uri(), "/quota"));
        let snapshot = adapter
            .fetch(&Client::new(), &Secret::new("tok"))
            .await
            .unwrap();
        match snapshot {
            Snapshot::PlanQuota {
                remaining,
                total,
                expires_at,
                daily_avg,
            } => {
                assert_eq!(remaining, 1_200_000);
                assert_eq!(total, 5_000_000);
                assert!(expires_at.is_some());
                assert_eq!(daily_avg, Some(12_000));
            }
            _ => panic!("expected plan_quota snapshot"),
        }
    }

    #[tokio::test]
    async fn rejects_zero_total() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/quota"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "remaining": 0,
                "total": 0
            })))
            .mount(&server)
            .await;

        let adapter = MiniMaxAdapter::new()
            .with_endpoint(format!("{}{}", server.uri(), "/quota"));
        let result = adapter
            .fetch(&Client::new(), &Secret::new("tok"))
            .await;
        assert!(matches!(result, Err(ProviderError::InvalidResponse(_))));
    }

    #[tokio::test]
    async fn fetch_returns_upstream_error_on_non_2xx() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/quota"))
            .and(bearer_token("tok"))
            .respond_with(ResponseTemplate::new(403).set_body_json(json!({
                "error": "forbidden"
            })))
            .mount(&server)
            .await;

        let adapter = MiniMaxAdapter::new()
            .with_endpoint(format!("{}{}", server.uri(), "/quota"));
        let result = adapter
            .fetch(&Client::new(), &Secret::new("tok"))
            .await;
        assert!(matches!(result, Err(ProviderError::Upstream(_))));
    }

    #[tokio::test]
    async fn fetch_returns_invalid_response_on_malformed_json() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/quota"))
            .and(bearer_token("tok"))
            .respond_with(ResponseTemplate::new(200).set_body_string("not json at all"))
            .mount(&server)
            .await;

        let adapter = MiniMaxAdapter::new()
            .with_endpoint(format!("{}{}", server.uri(), "/quota"));
        let result = adapter
            .fetch(&Client::new(), &Secret::new("tok"))
            .await;
        assert!(matches!(result, Err(ProviderError::InvalidResponse(_))));
    }
}
