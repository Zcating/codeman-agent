//! Settings store. Mirrors the JSON shape persisted by the Rust
//! `settings` module via `tauri-plugin-store`.

import { createSignal } from "solid-js";
import { getSettings } from "../lib/tauri";
import { type ProviderId, type Settings } from "../lib/types";

const DEFAULT_SETTINGS: Settings = {
  active_provider_id: "deepseek",
  refresh_interval_secs: 60,
  stale_after_secs: 180,
  low_balance_threshold: 10,
  low_quota_threshold_pct: 20,
  hotkeys: { switch: "Ctrl+Alt+B", toggle: "Ctrl+Alt+H" },
  start_at_login: true,
  notifications_enabled: true,
};

const [settings, setSettings] = createSignal<Settings>(DEFAULT_SETTINGS);

export { settings, setSettings };

let loaded = false;
export async function loadSettings(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const s = await getSettings();
    setSettings(s);
  } catch {
    // ignore; defaults remain
  }
}

export function patchSettings(patch: Partial<Settings>): Settings {
  const next = { ...settings(), ...patch } as Settings;
  setSettings(next);
  return next;
}

export function patchActiveProvider(id: ProviderId): Settings {
  return patchSettings({ active_provider_id: id });
}
