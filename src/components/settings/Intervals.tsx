//! Refresh interval and stale threshold inputs.

import { createSignal } from "solid-js";
import { updateSettings } from "../../lib/tauri";
import { settings } from "../../stores/settings";

const MIN_REFRESH = 5;

export function Intervals() {
  const [refresh, setRefresh] = createSignal(settings().refresh_interval_secs);
  const [stale, setStale] = createSignal(settings().stale_after_secs);

  const save = async () => {
    const next = await updateSettings({
      ...settings(),
      refresh_interval_secs: Math.max(MIN_REFRESH, Math.floor(refresh())),
      stale_after_secs: Math.max(MIN_REFRESH, Math.floor(stale())),
    });
    setRefresh(next.refresh_interval_secs);
    setStale(next.stale_after_secs);
  };

  return (
    <section class="settings-section">
      <header>
        <h2>Refresh &amp; stale</h2>
        <p>How often the active provider is polled, and after how long a snapshot is marked stale.</p>
      </header>
      <div class="form-row">
        <label for="refresh-secs">Refresh interval (s)</label>
        <input
          id="refresh-secs"
          type="number"
          min={MIN_REFRESH}
          value={refresh()}
          onInput={(e) => setRefresh(Math.max(MIN_REFRESH, Number(e.currentTarget.value) || MIN_REFRESH))}
        />
      </div>
      <div class="form-row">
        <label for="stale-secs">Stale after (s)</label>
        <input
          id="stale-secs"
          type="number"
          min={MIN_REFRESH}
          value={stale()}
          onInput={(e) => setStale(Math.max(MIN_REFRESH, Number(e.currentTarget.value) || MIN_REFRESH))}
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
