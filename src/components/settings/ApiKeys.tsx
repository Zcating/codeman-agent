//! API key section. Stores keys in Windows Credential Manager via the
//! `set_api_key` command; never reflects the value back into the UI.

import { createSignal, For } from "solid-js";
import { hasApiKey, setApiKey } from "../../lib/tauri";
import { PROVIDER_LABEL, type ProviderId } from "../../lib/types";

const PROVIDERS: ProviderId[] = ["deepseek", "minimax"];

export function ApiKeys() {
  return (
    <section class="settings-section">
      <header>
        <h2>API keys</h2>
        <p>Stored in Windows Credential Manager. Leave the field blank to keep the existing entry.</p>
      </header>
      <For each={PROVIDERS}>
        {(p) => <ApiKeyRow provider={p} />}
      </For>
    </section>
  );
}

function ApiKeyRow(props: { provider: ProviderId }) {
  const [value, setValue] = createSignal("");
  const [hasKey, setHasKey] = createSignal(false);
  const [status, setStatus] = createSignal<string | null>(null);

  hasApiKey(props.provider).then(setHasKey).catch(() => setHasKey(false));

  const onSave = async () => {
    setStatus(null);
    try {
      const stored = await setApiKey(props.provider, value());
      setHasKey(stored);
      setValue("");
      setStatus(stored ? "saved" : "cleared");
    } catch (e) {
      setStatus(`failed: ${String(e)}`);
    }
  };

  const onClear = async () => {
    setValue("");
    setStatus(null);
    try {
      const stored = await setApiKey(props.provider, "");
      setHasKey(stored);
      setStatus("cleared");
    } catch (e) {
      setStatus(`failed: ${String(e)}`);
    }
  };

  return (
    <div class="form-row">
      <label for={`key-${props.provider}`}>{PROVIDER_LABEL[props.provider]}</label>
      <div class="key-input">
        <input
          id={`key-${props.provider}`}
          type="password"
          autocomplete="off"
          spellcheck={false}
          placeholder={hasKey() ? "••• configured •••" : "paste API key"}
          value={value()}
          onInput={(e) => setValue(e.currentTarget.value)}
        />
        <button type="button" class="primary" disabled={!value()} onClick={onSave}>
          Save
        </button>
        <button type="button" disabled={!hasKey()} onClick={onClear}>
          Clear
        </button>
      </div>
      <Show status={status()} />
    </div>
  );
}

function Show(props: { status: string | null }) {
  return props.status ? <span class="form-status">{props.status}</span> : null;
}
