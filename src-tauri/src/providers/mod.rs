//! Provider trait + 注册表。
//!
//! 每个计费源作为独立适配器存在于 `providers/` 下。trait 是 async 的，
//! 以便调度器可以将 trait 对象保存在 `Arc` 后并轮询当前活动的提供商。

pub mod deepseek;
pub mod minimax;

use crate::types::{ProviderError, ProviderId, ProviderKind, Secret, Snapshot};
use async_trait::async_trait;
use reqwest::Client;
use std::sync::Arc;

/// 装箱适配器。调度器维护这些适配器的注册表，以 `ProviderId` 索引，
/// 以便在切换活动提供商时无需重建 HTTP 客户端。
pub type Adapter = Arc<dyn Provider>;

#[async_trait]
pub trait Provider: Send + Sync {
    fn id(&self) -> ProviderId;
    fn kind(&self) -> ProviderKind;
    fn label(&self) -> &'static str;

    /// 获取最新计费状态。实现负责认证、请求塑造和响应解析。
    /// 不得记录 `secret` 值。
    async fn fetch(&self, client: &Client, secret: &Secret) -> Result<Snapshot, ProviderError>;
}

/// 构建默认注册表。顺序对切换器循环很重要——
/// `ProviderId::next()` 沿 `ALL` 前进，所以此列表定义了那个循环。
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
            assert!(adapters.iter().any(|a| a.id() == *id), "缺少 {id:?}");
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
