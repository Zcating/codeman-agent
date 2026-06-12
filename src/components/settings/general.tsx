//! General preferences: start at login, notifications toggle, refresh
//! hint. The `start_at_login` toggle is also re-applied on the Rust
//! side immediately when settings change.

import { createSignal } from "solid-js";
import { updateSettings } from "../../lib/tauri";
import { settings } from "../../stores/settings";

export function General() {
  const [startAtLogin, setStartAtLogin] = createSignal(
    settings().start_at_login,
  );
  const [notifications, setNotifications] = createSignal(
    settings().notifications_enabled,
  );
  const [status, setStatus] = createSignal<string | null>(null);

  const save = async () => {
    setStatus(null);
    try {
      await updateSettings({
        ...settings(),
        start_at_login: startAtLogin(),
        notifications_enabled: notifications(),
      });
      setStatus("saved");
    } catch (e) {
      setStatus(`failed: ${String(e)}`);
    }
  };

  return (
    <section class="settings-section">
      <header>
        <h2>General</h2>
        <p>Application-level behaviour that does not fit the other tabs.</p>
      </header>
      <div class="form-row form-row-inline">
        <label for="autostart">Start at login</label>
        <input
          id="autostart"
          type="checkbox"
          checked={startAtLogin()}
          onChange={(e) => setStartAtLogin(e.currentTarget.checked)}
        />
      </div>
      <div class="form-row form-row-inline">
        <label for="notifications">System notifications</label>
        <input
          id="notifications"
          type="checkbox"
          checked={notifications()}
          onChange={(e) => setNotifications(e.currentTarget.checked)}
        />
      </div>
      <div class="form-row form-row-inline">
        <span class="hint">Refresh interval: {settings().refresh_interval_secs}s</span>
      </div>
      <div class="form-row">
        <button type="button" class="primary" onClick={save}>
          Save
        </button>
        {status() && <span class="form-status">{status()}</span>}
      </div>
    </section>
  );
}
