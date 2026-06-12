//! Low-balance and low-quota threshold inputs.

import { createSignal } from "solid-js";
import { updateSettings } from "../../lib/tauri";
import { settings } from "../../stores/settings";

export function Thresholds() {
  const [balance, setBalance] = createSignal<number | null>(
    settings().low_balance_threshold,
  );
  const [quota, setQuota] = createSignal<number | null>(
    settings().low_quota_threshold_pct,
  );

  const save = async () => {
    const b = balance();
    const q = quota();
    await updateSettings({
      ...settings(),
      low_balance_threshold: b === null || Number.isNaN(b) ? null : b,
      low_quota_threshold_pct: q === null || Number.isNaN(q) ? null : Math.max(0, Math.min(100, q)),
    });
  };

  return (
    <section class="settings-section">
      <header>
        <h2>Low-threshold alerts</h2>
        <p>Fire a system notification when the active provider drops below these values.</p>
      </header>
      <div class="form-row">
        <label for="low-balance">Low balance (absolute, provider currency)</label>
        <input
          id="low-balance"
          type="number"
          min={0}
          step="0.01"
          value={balance() ?? ""}
          onInput={(e) => {
            const v = e.currentTarget.value;
            setBalance(v === "" ? null : Number(v));
          }}
        />
      </div>
      <div class="form-row">
        <label for="low-quota">Low quota (% remaining)</label>
        <input
          id="low-quota"
          type="number"
          min={0}
          max={100}
          step="0.1"
          value={quota() ?? ""}
          onInput={(e) => {
            const v = e.currentTarget.value;
            setQuota(v === "" ? null : Number(v));
          }}
        />
      </div>
      <div class="form-row">
        <button type="button" class="primary" onClick={save}>
          Save
        </button>
      </div>
    </section>
  );
}
