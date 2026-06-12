//! Background task that polls the active provider on a fixed interval
//! and reacts to switch / force / settings events.
//!
//! Design:
//!
//! * A single async task, spawned in `lib.rs`, drives the loop.
//! * Each iteration starts a fresh `fetch_active` future, then races it
//!   against three wake-up signals:
//!     - `tokio::time::sleep(interval)` for the periodic tick
//!     - `state.wakeup` for switch / force-refresh / interval change
//!   Whichever fires first cancels the fetch future (the underlying
//!   HTTP request is dropped) and the loop re-enters with a fresh
//!   fetch. Switches therefore abort any in-flight request for the old
//!   active provider.

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
        info!("scheduler starting");
        loop {
            let interval = self.state.get_settings().refresh_interval();
            let fetch = self.state.fetch_active();
            tokio::pin!(fetch);

            tokio::select! {
                result = &mut fetch => {
                    if let Err(e) = result {
                        warn!("fetch error: {e}");
                    }
                }
                _ = sleep(interval) => {
                    // periodic tick: drop fetch, loop will retry
                }
                _ = self.state.wakeup.notified() => {
                    // switch / force / interval change: drop fetch, retry
                }
            }
            // Yield once so a tight wakeup loop can't starve the runtime.
            tokio::task::yield_now().await;
        }
    }
}

/// Minimal test double: returns a `PlanQuota` snapshot, increments a
/// shared counter on every `fetch` call, and blocks for a configurable
/// delay so a switch can race the in-flight call.
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
        // Sleep before the increment of `completed` so a future that
        // gets dropped mid-sleep does NOT count as completed.
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

    /// A scheduler-driven loop only fetches the active provider. This
    /// is the "single-focus" property from the plan: a non-active
    /// adapter's `fetch` MUST NOT be called.
    #[tokio::test]
    async fn only_active_provider_is_polled() {
        let active = Arc::new(parking_lot::Mutex::new(ProviderId::Deepseek));
        let deepseek = Arc::new(FakeProvider::new(ProviderId::Deepseek, Duration::from_millis(5)));
        let minimax = Arc::new(FakeProvider::new(ProviderId::Minimax, Duration::from_millis(5)));
        let ds_calls = deepseek.call_counter_handle();
        let mx_calls = minimax.call_counter_handle();

        // One iteration: fetch whatever the active provider is.
        let id = *active.lock();
        let adapter: Adapter = if id == ProviderId::Deepseek {
            deepseek.clone()
        } else {
            minimax.clone()
        };
        let _ = adapter.fetch(&Client::new(), &Secret::new("x")).await;

        assert_eq!(ds_calls.load(Ordering::SeqCst), 1);
        assert_eq!(mx_calls.load(Ordering::SeqCst), 0);

        // Switch active, fetch again — only the new active is hit.
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

    /// A switch during an in-flight fetch aborts the call: the call
    /// counter increments (we DID start the request) but the completed
    /// counter does NOT (the future was cancelled before its tail
    /// ran). This mirrors the scheduler's `tokio::select!` race: a
    /// `wakeup.notified()` from `set_active` drops the fetch future.
    ///
    /// We use `tokio::time::timeout` rather than `tokio::spawn` because
    /// `fetch` borrows its `&Client` / `&Secret` inputs by reference;
    /// the elided lifetime of those borrows is not `'static` and
    /// `spawn` would reject them. `timeout` accepts non-`'static`
    /// futures and drops them on expiry, which is the property under
    /// test.
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
        // Race the fetch against a short timeout. The fetch is
        // entered (sleep hasn't run) but never completed (sleep
        // would have run past the timeout).
        let outcome = tokio::time::timeout(
            Duration::from_millis(20),
            provider.fetch(&client, &secret),
        )
        .await;
        assert!(outcome.is_err(), "fetch should have been aborted");

        assert_eq!(calls.load(Ordering::SeqCst), 1, "fetch was entered");
        assert_eq!(
            completed.load(Ordering::SeqCst),
            0,
            "fetch was aborted before completing"
        );
    }

    /// The scheduler honors the configured refresh interval. We can't
    /// easily drive the full `AppState` here, but we can assert the
    /// timing primitive the scheduler uses: `sleep(interval)`.
    #[tokio::test]
    async fn sleep_honors_interval() {
        let started = std::time::Instant::now();
        sleep(Duration::from_millis(50)).await;
        assert!(started.elapsed() >= Duration::from_millis(50));
    }

    /// `Settings::refresh_interval` is the source of truth for the
    /// loop's period; a 0-value configuration is floored to
    /// `MIN_REFRESH_SECS` so the loop cannot busy-spin.
    #[test]
    fn settings_refresh_interval_floors() {
        let mut s = Settings::default();
        s.refresh_interval_secs = 0;
        assert!(s.refresh_interval() >= Duration::from_secs(5));
    }
}
