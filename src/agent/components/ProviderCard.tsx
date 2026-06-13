//! ProviderCard — single LLM provider row in Settings → LLM tab.
//!
//! Consumes bridge functions from agent/settings/llm_providers.
//! Pure UI. No effect imports.

import { createSignal, Show } from "solid-js";
import { setApiKeyForProvider, hasApiKeyForProvider } from "../settings/llm_providers";
import type { LLMProvider } from "../../lib/types";

export function ProviderCard(props: {
  provider: LLMProvider;
  onChange: (next: LLMProvider) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = createSignal(false);
  const [apiKey, setApiKey] = createSignal("");
  const [testStatus, setTestStatus] = createSignal<"idle" | "testing" | "ok" | "fail">("idle");
  const [testMessage, setTestMessage] = createSignal("");

  const saveApiKey = async () => {
    if (!apiKey()) return;
    try {
      await setApiKeyForProvider(props.provider.id, apiKey());
      setApiKey("");
      setEditing(false);
    } catch (e) {
      console.error("[ProviderCard] setApiKey failed:", e);
    }
  };

  const testConnection = async () => {
    setTestStatus("testing");
    const hasKey = await hasApiKeyForProvider(props.provider.id);
    if (!hasKey) {
      setTestStatus("fail");
      setTestMessage("Set API key first");
      return;
    }
    // For V1, "test" = check that an API key is set. A real test would
    // make a minimal completion call to the provider.
    setTestStatus("ok");
    setTestMessage("API key configured");
  };

  return (
    <div class="provider-card">
      <div class="provider-card__header">
        <label class="provider-card__enabled">
          <input
            type="checkbox"
            checked={props.provider.enabled}
            onChange={(e) => props.onChange({ ...props.provider, enabled: e.currentTarget.checked })}
          />
          <span class="provider-card__label">{props.provider.label}</span>
        </label>
        <code class="provider-card__id">{props.provider.id}</code>
      </div>
      <Show when={props.provider.default_model !== undefined || editing()}>
        <div class="provider-card__row">
          <label>Model</label>
          <input
            type="text"
            value={props.provider.default_model ?? ""}
            placeholder="e.g. gpt-4o / claude-3-5-sonnet"
            onInput={(e) => props.onChange({ ...props.provider, default_model: e.currentTarget.value })}
          />
        </div>
      </Show>
      <Show when={props.provider.base_url !== undefined || editing()}>
        <div class="provider-card__row">
          <label>Base URL (OpenAI-compat only)</label>
          <input
            type="text"
            value={props.provider.base_url ?? ""}
            placeholder="https://api.openai.com/v1"
            onInput={(e) => props.onChange({ ...props.provider, base_url: e.currentTarget.value })}
          />
        </div>
      </Show>
      <div class="provider-card__row">
        <label>API Key</label>
        <Show
          when={editing()}
          fallback={
            <button type="button" onClick={() => setEditing(true)}>
              Set API key…
            </button>
          }
        >
          <input
            type="password"
            autocomplete="off"
            value={apiKey()}
            onInput={(e) => setApiKey(e.currentTarget.value)}
            placeholder="sk-…"
          />
          <button type="button" onClick={() => void saveApiKey()} disabled={!apiKey()}>
            Save
          </button>
          <button type="button" onClick={() => { setEditing(false); setApiKey(""); }}>
            Cancel
          </button>
        </Show>
      </div>
      <div class="provider-card__actions">
        <button type="button" onClick={() => void testConnection()}>
          Test
        </button>
        <Show when={testStatus() !== "idle"}>
          <span classList={{
            "provider-card__test-status": true,
            "provider-card__test-status--ok": testStatus() === "ok",
            "provider-card__test-status--fail": testStatus() === "fail",
            "provider-card__test-status--testing": testStatus() === "testing",
          }}>
            {testStatus() === "testing" ? "Testing…" : testMessage()}
          </span>
        </Show>
        <button type="button" class="provider-card__delete" onClick={() => props.onDelete()}>
          Delete
        </button>
      </div>
    </div>
  );
}