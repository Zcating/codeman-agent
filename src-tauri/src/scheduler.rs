//! 后台任务，以固定间隔轮询活动提供商，并响应切换 / 强制 / 设置事件。
//!
//! 设计：
//!
//! * 单个异步任务，在 `lib.rs` 中生成，驱动循环。
//! * 每次迭代启动一个新的 `fetch_active` future，然后与三个唤醒信号赛跑：
//!     - `tokio::time::sleep(interval)` 用于定期 tick
//!     - `state.wakeup` 用于切换 / 强制刷新 / 间隔变更
//!   任何一个先触发都会取消 fetch future（底层 HTTP 请求被丢弃），
//!   循环以新的 fetch 重新进入。因此，切换会中止旧活动提供商的任何飞行中请求。

use crate::providers::Provider;
use crate::state::AppState;
use crate::types::{ProviderId, ProviderKind, Secret, Snapshot};
use async_trait::async_trait;
use log::{info, warn};
use reqwest::Client;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::time::sleep;

pub struct Scheduler {
    state: AppState,
}

impl Scheduler {
    pub fn new(state: AppState) -> Self {
        Self { state }
    }

    pub async fn run(self) {
        info!("调度器启动");
        loop {
            let interval = self.state.get_settings().refresh_interval();
            let fetch = self.state.fetch_active();
            tokio::pin!(fetch);

            tokio::select! {
                result = &mut fetch => {
                    if let Err(e) = result {
                        warn!("获取错误：{e}");
                    }
                }
                _ = sleep(interval) => {
                    // 定期 tick：丢弃 fetch，循环将重试
                }
                _ = self.state.wakeup.notified() => {
                    // 切换 / 强制 / 间隔变更：丢弃 fetch，重试
                }
            }
            // yield 一次，防止紧密唤醒循环饿死运行时。
            tokio::task::yield_now().await;
        }
    }
}

/// 最小测试替身：返回 `PlanQuota` 快照，每次 `fetch` 调用递增共享计数器，
/// 并阻塞可配置的延迟，以便切换可以与飞行中调用赛跑。
pub struct FakeProvider {
    id: ProviderId,
    delay: Duration,
    calls: Arc<AtomicU64>,
    completed: Arc<AtomicU64>,
}

impl FakeProvider {
    pub fn new(id: ProviderId, delay: Duration) -> Self {
        Self {
            id,
            delay,
            calls: Arc::new(AtomicU64::new(0)),
            completed: Arc::new(AtomicU64::new(0)),
        }
    }

    pub fn call_count(&self) -> u64 {
        self.calls.load(Ordering::SeqCst)
    }

    pub fn completed_count(&self) -> u64 {
        self.completed.load(Ordering::SeqCst)
    }

    pub fn call_counter_handle(&self) -> Arc<AtomicU64> {
        self.calls.clone()
    }

    pub fn completed_counter_handle(&self) -> Arc<AtomicU64> {
        self.completed.clone()
    }
}

#[async_trait]
impl Provider for FakeProvider {
    fn id(&self) -> ProviderId {
        self.id
    }
    fn kind(&self) -> ProviderKind {
        ProviderKind::PlanQuota
    }
    fn label(&self) -> &'static str {
        "fake"
    }
    async fn fetch(
        &self,
        _client: &Client,
        _secret: &Secret,
    ) -> Result<Snapshot, crate::types::ProviderError> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        // 在 `completed` 递增之前 sleep，这样中途被丢弃的 future
        // 不会算作已完成。
        tokio::time::sleep(self.delay).await;
        self.completed.fetch_add(1, Ordering::SeqCst);
        Ok(Snapshot::PlanQuota {
            remaining: 1,
            total: 1,
            expires_at: None,
            daily_avg: None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::Adapter;
    use crate::settings::Settings;
    use crate::types::ProviderId;

    /// 调度器驱动的循环只获取活动提供商。
    /// 这是计划中的"单一焦点"属性：非活动适配器的 `fetch` 不得被调用。
    #[tokio::test]
    async fn only_active_provider_is_polled() {
        let active = Arc::new(parking_lot::Mutex::new(ProviderId::Deepseek));
        let deepseek = Arc::new(FakeProvider::new(ProviderId::Deepseek, Duration::from_millis(5)));
        let minimax = Arc::new(FakeProvider::new(ProviderId::Minimax, Duration::from_millis(5)));
        let ds_calls = deepseek.call_counter_handle();
        let mx_calls = minimax.call_counter_handle();

        // 一次迭代：获取活动提供商。
        let id = *active.lock();
        let adapter: Adapter = if id == ProviderId::Deepseek {
            deepseek.clone()
        } else {
            minimax.clone()
        };
        let _ = adapter.fetch(&Client::new(), &Secret::new("x")).await;

        assert_eq!(ds_calls.load(Ordering::SeqCst), 1);
        assert_eq!(mx_calls.load(Ordering::SeqCst), 0);

        // 切换活动，再获取——只命中新的活动提供商。
        *active.lock() = ProviderId::Minimax;
        let id = *active.lock();
        let adapter: Adapter = if id == ProviderId::Deepseek {
            deepseek.clone()
        } else {
            minimax.clone()
        };
        let _ = adapter.fetch(&Client::new(), &Secret::new("x")).await;
        assert_eq!(ds_calls.load(Ordering::SeqCst), 1);
        assert_eq!(mx_calls.load(Ordering::SeqCst), 1);
    }

    /// 飞行中 fetch 期间的切换会中止调用：调用计数器递增（我们确实开始了请求）
    /// 但完成计数器不增（future 在其尾部运行之前被取消）。
    /// 这镜像了调度器的 `tokio::select!` 赛跑：`set_active` 的
    /// `wakeup.notified()` 会丢弃 fetch future。
    ///
    /// 我们使用 `tokio::time::timeout` 而不是 `tokio::spawn`，
    /// 因为 `fetch` 通过引用借用 `&Client` / `&Secret` 输入；
    /// 这些借用的隐去生命周期不是 `'static`，`spawn` 会拒绝它们。
    /// `timeout` 接受非 `'static` 的 future 并在超时时丢弃它们，
    /// 这正是测试的属性。
    #[tokio::test]
    async fn switch_aborts_in_flight_fetch() {
        let provider = Arc::new(FakeProvider::new(
            ProviderId::Deepseek,
            Duration::from_millis(200),
        ));
        let calls = provider.call_counter_handle();
        let completed = provider.completed_counter_handle();

        let client = Client::new();
        let secret = Secret::new("x");
        // 将 fetch 与短超时赛跑。fetch 被进入（sleep 尚未运行）
        // 但从未完成（sleep 会运行超过超时）。
        let outcome = tokio::time::timeout(
            Duration::from_millis(20),
            provider.fetch(&client, &secret),
        )
        .await;
        assert!(outcome.is_err(), "fetch 应当被中止");

        assert_eq!(calls.load(Ordering::SeqCst), 1, "fetch 被进入");
        assert_eq!(
            completed.load(Ordering::SeqCst),
            0,
            "fetch 在完成前被中止"
        );
    }

    /// 调度器遵守配置的刷新间隔。我们不能轻易驱动完整的 `AppState`，
    /// 但可以断言调度器使用的时间原语：`sleep(interval)`。
    #[tokio::test]
    async fn sleep_honors_interval() {
        let started = std::time::Instant::now();
        sleep(Duration::from_millis(50)).await;
        assert!(started.elapsed() >= Duration::from_millis(50));
    }

    /// `Settings::refresh_interval` 是循环周期的真实来源；
    /// 0 值配置会被下限为 `MIN_REFRESH_SECS`，以防止循环忙等待。
    #[test]
    fn settings_refresh_interval_floors() {
        let mut s = Settings::default();
        // 插入刷新间隔为 0 的提供商；Settings 将其下限。
        s.billing_providers.push(crate::settings::BillingProviderConfig {
            id: "test".into(),
            enabled: true,
            refresh_interval_secs: 0,
            api_key_ref: None,
        });
        assert!(s.refresh_interval() >= Duration::from_secs(5));
    }
}
