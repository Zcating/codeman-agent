//! Typed wrappers around the Tauri IPC commands defined in
//! `src-tauri/src/commands.rs`. Centralized here so the rest of the
//! frontend imports `from "../lib/tauri"` and gets the right types.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  LowThresholdBreachedPayload,
  ProviderDescriptor,
  ProviderId,
  RefreshFailedPayload,
  Settings,
  SnapshotEnvelope,
  WidgetPosition,
} from "./types";

export async function listProviders(): Promise<ProviderDescriptor[]> {
  return invoke<ProviderDescriptor[]>("list_providers");
}

export async function getActiveProvider(): Promise<ProviderId> {
  return invoke<ProviderId>("get_active_provider");
}

export async function setActiveProvider(id: ProviderId): Promise<void> {
  await invoke("set_active_provider", { id });
}

export async function forceRefresh(): Promise<void> {
  await invoke("force_refresh");
}

export async function getSettings(): Promise<Settings> {
  return invoke<Settings>("get_settings");
}

export async function updateSettings(newSettings: Settings): Promise<Settings> {
  return invoke<Settings>("update_settings", { newSettings });
}

export async function setApiKey(
  provider: ProviderId,
  value: string,
): Promise<boolean> {
  return invoke<boolean>("set_api_key", { provider, value });
}

export async function hasApiKey(provider: ProviderId): Promise<boolean> {
  return invoke<boolean>("has_api_key", { provider });
}

export async function testProvider(
  provider: ProviderId,
): Promise<SnapshotEnvelope> {
  return invoke<SnapshotEnvelope>("test_provider", { provider });
}

export async function latestSnapshot(
  provider: ProviderId,
): Promise<SnapshotEnvelope | null> {
  return invoke<SnapshotEnvelope | null>("latest_snapshot", { provider });
}

export async function showSettingsWindow(): Promise<void> {
  await invoke("show_settings_window");
}

export async function hideWidgetWindow(): Promise<void> {
  await invoke("hide_widget_window");
}

export async function showWidgetWindow(): Promise<void> {
  await invoke("show_widget_window");
}

export async function getWidgetPosition(): Promise<WidgetPosition | null> {
  return invoke<WidgetPosition | null>("get_widget_position");
}

export async function setWidgetPosition(x: number, y: number): Promise<WidgetPosition> {
  return invoke<WidgetPosition>("set_widget_position", { x, y });
}

type EventMap = {
  "snapshot-updated": SnapshotEnvelope;
  "refresh-failed": RefreshFailedPayload;
  "low-threshold-breached": LowThresholdBreachedPayload;
};

export async function onEvent<K extends keyof EventMap>(
  event: K,
  cb: (payload: EventMap[K]) => void,
): Promise<UnlistenFn> {
  return listen<EventMap[K]>(event, (e) => cb(e.payload as EventMap[K]));
}
