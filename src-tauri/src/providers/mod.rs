//! Provider trait + registry.
//!
//! Each billing source ships as its own adapter under `providers/`. The
//! trait is async so the scheduler can hold the trait object behind an
//! `Arc` and poll whichever provider is currently active.

pub mod deepseek;
pub mod minimax;

use crate::types::{ProviderError, ProviderId, ProviderKind, Secret, Snapshot};
use async_trait::async_trait;
use reqwest::Client;
use std::sync::Arc;

/// Boxed adapter. The scheduler keeps a registry of these indexed by
/// `ProviderId` so it can swap the active provider without rebuilding
/// HTTP clients.
pub type Adapter = Arc<dyn Provider>;

#[async_trait]
pub trait Provider: Send + Sync {
    fn id(&self) -> ProviderId;
    fn kind(&self) -> ProviderKind;
    fn label(&self) -> &'static str;

    /// Fetch the latest billing state. Implementations are responsible
    /// for auth, request shaping, and response parsing. They MUST NOT log
    /// the `secret` value.
    async fn fetch(&self, client: &Client, secret: &Secret) -> Result<Snapshot, ProviderError>;
}

/// Build the default registry. Order matters for the switcher cycle --
/// `ProviderId::next()` follows `ALL`, so this list defines that cycle.
pub fn registry() -> Vec<Adapter> {
    vec![
        Arc::new(deepseek::DeepSeekAdapter::new()) as Adapter,
        Arc::new(minimax::MiniMaxAdapter::new()) as Adapter,
    ]
}

pub fn lookup(id: ProviderId) -> Option<Adapter> {
    registry().into_iter().find(|p| p.id() == id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_contains_all_providers() {
        let adapters = registry();
        for id in ProviderId::ALL {
            assert!(adapters.iter().any(|a| a.id() == *id), "missing {id:?}");
        }
    }

    #[test]
    fn lookup_returns_expected_kind() {
        assert_eq!(
            lookup(ProviderId::Deepseek).unwrap().kind(),
            ProviderKind::Balance
        );
        assert_eq!(
            lookup(ProviderId::Minimax).unwrap().kind(),
            ProviderKind::PlanQuota
        );
    }
}
