//! Hotkey capture. Each input captures a key chord, parses it through
//! the same DSL the Rust side understands (Ctrl/Alt/Shift/Meta + key),
//! and pushes the new value via `updateSettings` which triggers a
//! live re-registration in the backend.

import { createSignal, For } from "solid-js";
import { updateSettings } from "../../lib/tauri";
import { settings } from "../../stores/settings";
import type { Hotkeys as HotkeysT } from "../../lib/types";

interface Field {
  key: keyof HotkeysT;
  label: string;
  description: string;
}

const FIELDS: Field[] = [
  {
    key: "switch",
    label: "Switch provider",
    description: "Cycle between DeepSeek and MiniMax.",
  },
  {
    key: "toggle",
    label: "Toggle widget",
    description: "Show or hide the floating widget.",
  },
];

// Canonicalise a user-pressed chord to the DSL the Rust parser expects:
// modifier tokens are TitleCase ("Ctrl", "Alt", "Shift", "Meta"); the
// trigger key is a single ASCII letter / digit / F-key.
function normaliseChord(e: KeyboardEvent): string | null {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Meta");
  let key = e.key;
  if (key === " ") return null;
  if (key.length === 1) {
    if (!/^[a-zA-Z0-9]$/.test(key)) return null;
    key = key.toUpperCase();
  } else if (/^F([1-9]|1[0-2])$/.test(key)) {
    // F1-F12 pass through.
  } else {
    return null;
  }
  if (parts.length === 0) return null;
  parts.push(key);
  return parts.join("+");
}

export function Hotkeys() {
  const [capture, setCapture] = createSignal<keyof HotkeysT | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  const commit = async (next: HotkeysT) => {
    setError(null);
    try {
      await updateSettings({ ...settings(), hotkeys: next });
    } catch (e) {
      setError(String(e));
    }
  };

  const onKeyDown = async (e: KeyboardEvent, key: keyof HotkeysT) => {
    if (e.key === "Escape") {
      setCapture(null);
      e.preventDefault();
      return;
    }
    e.preventDefault();
    const chord = normaliseChord(e);
    if (!chord) return;
    const next: HotkeysT = { ...settings().hotkeys, [key]: chord };
    setCapture(null);
    await commit(next);
  };

  return (
    <section class="settings-section">
      <header>
        <h2>Hotkeys</h2>
        <p>Click an input, then press the chord you want to bind. Esc to cancel.</p>
      </header>
      <For each={FIELDS}>
        {(f) => (
          <div class="form-row">
            <label for={`hk-${f.key}`}>{f.label}</label>
            <input
              id={`hk-${f.key}`}
              type="text"
              readonly
              class={capture() === f.key ? "is-capturing" : ""}
              value={settings().hotkeys[f.key]}
              onFocus={() => {
                setCapture(f.key);
                setError(null);
              }}
              onBlur={() => setCapture(null)}
              onKeyDown={(e) => void onKeyDown(e, f.key)}
            />
            <p class="hint">{f.description}</p>
          </div>
        )}
      </For>
      {error() && <p class="form-status">{error()}</p>}
    </section>
  );
}
