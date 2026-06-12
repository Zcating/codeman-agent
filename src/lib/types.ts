//! TypeScript mirrors of the Rust domain types.
//!
//! Field names follow the Rust `serde` representation, which is the wire
//! format the Tauri IPC commands use. The discriminated union on
//! `Snapshot.kind` is the only piece of structural typing the frontend
//! leans on.

export type ProviderId = "deepseek" | "minimax";
export type ProviderKind = "balance" | "plan_quota";

export interface ProviderDescriptor {
  id: ProviderId;
  label: string;
  kind: ProviderKind;
  hasKey: boolean;
}

export type Balance = {
  kind: "balance";
  amount: string;
  currency: string;
  auto_recharge: boolean | null;
};

export type PlanQuota = {
  kind: "plan_quota";
  remaining: number;
  total: number;
  expires_at?: string | null;
  daily_avg?: number | null;
};

export type Snapshot = Balance | PlanQuota;

export interface SnapshotEnvelope {
  provider: ProviderId;
  snapshot: Snapshot | null;
  fetched_at: string;
  error?: string | null;
}

export interface Hotkeys {
  switch: string;
  toggle: string;
}

export interface WidgetPosition {
  x: number;
  y: number;
}

export interface Settings {
  active_provider_id: ProviderId;
  refresh_interval_secs: number;
  stale_after_secs: number;
  low_balance_threshold: number | null;
  low_quota_threshold_pct: number | null;
  hotkeys: Hotkeys;
  start_at_login: boolean;
  notifications_enabled: boolean;
  widget_position?: WidgetPosition | null;
}

export interface RefreshFailedPayload {
  provider: ProviderId;
  error: string;
}

export interface LowThresholdBreachedPayload {
  provider: ProviderId;
  snapshot: Snapshot;
}

export type View = "widget" | "settings";

export const ALL_PROVIDERS: ProviderId[] = ["deepseek", "minimax"];

export function nextProvider(id: ProviderId): ProviderId {
  return id === "deepseek" ? "minimax" : "deepseek";
}
