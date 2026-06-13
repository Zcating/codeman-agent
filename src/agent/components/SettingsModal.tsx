//! SettingsModal — tabbed settings dialog.

import { createSignal, Show, For } from "solid-js";
import { Effect } from "effect";
import { ProviderCard } from "./ProviderCard";
import { SettingsService, SettingsServiceLive } from "../../lib/tauri";
import type { LLMProvider, Settings } from "../../lib/types";

type Tab = "llm" | "app" | "window" | "billing" | "advanced";

export function SettingsModal(props: { onClose: () => void }) {
  const [tab, setTab] = createSignal<Tab>("llm");
  const [draft, setDraft] = createSignal<Settings | null>(null);
  const [confirmClear, setConfirmClear] = createSignal(false);

  // Load settings + providers on mount.
  const init = async () => {
    try {
      const program = Effect.gen(function* () {
        const svc = yield* SettingsService;
        return yield* svc.getSettings();
      }).pipe(Effect.provide(SettingsServiceLive));
      const s = await Effect.runPromise(program);
      setDraft(s);
    } catch (e) {
      console.error("[SettingsModal] load failed:", e);
    }
  };
  void init();

  const save = async () => {
    const d = draft();
    if (!d) return;
    try {
      const program = Effect.gen(function* () {
        const svc = yield* SettingsService;
        yield* svc.updateSettings(d);
      }).pipe(Effect.provide(SettingsServiceLive));
      await Effect.runPromise(program);
      props.onClose();
    } catch (e) {
      console.error("[SettingsModal] save failed:", e);
    }
  };

  const onProviderChange = (next: LLMProvider) => {
    const d = draft();
    if (!d) return;
    const next_providers = d.llm_providers.map((p) => (p.id === next.id ? next : p));
    setDraft({ ...d, llm_providers: next_providers });
  };

  const onProviderDelete = (id: string) => {
    const d = draft();
    if (!d) return;
    const next_providers = d.llm_providers.filter((p) => p.id !== id);
    setDraft({ ...d, llm_providers: next_providers });
  };

  const onAddProvider = () => {
    const d = draft();
    if (!d) return;
    const newProvider: LLMProvider = {
      id: `custom-${Date.now()}`,
      label: `Custom ${d.llm_providers.length + 1}`,
      enabled: true,
      api_key_ref: `llm_providers/custom-${Date.now()}/api_key`,
    };
    setDraft({ ...d, llm_providers: [...d.llm_providers, newProvider] });
  };

  const clearHistory = async () => {
    try {
      const program = Effect.gen(function* () {
        const svc = yield* SettingsService;
        yield* svc.clearAllHistory();
      }).pipe(Effect.provide(SettingsServiceLive));
      await Effect.runPromise(program);
      setConfirmClear(false);
      props.onClose();
    } catch (e) {
      console.error("[SettingsModal] clear failed:", e);
    }
  };

  return (
    <div class="settings-modal" role="dialog" aria-modal="true">
      <div class="settings-modal__backdrop" onClick={() => props.onClose()} />
      <div class="settings-modal__content">
        <header class="settings-modal__header">
          <h2>Settings</h2>
          <button type="button" onClick={() => props.onClose()} aria-label="Close">
            ×
          </button>
        </header>
        <nav class="settings-modal__tabs">
          <For each={["llm", "app", "window", "billing", "advanced"] as const}>
            {(t) => (
              <button
                type="button"
                classList={{ "settings-modal__tab": true, "settings-modal__tab--active": tab() === t }}
                onClick={() => setTab(t)}
              >
                {t === "llm" ? "LLM" : t === "app" ? "App" : t === "window" ? "Window" : t === "billing" ? "Billing" : "Advanced"}
              </button>
            )}
          </For>
        </nav>
        <div class="settings-modal__body">
          <Show when={tab() === "llm" && draft()}>
            <section>
              <h3>LLM Providers</h3>
              <For each={draft()!.llm_providers}>
                {(p) => (
                  <ProviderCard
                    provider={p}
                    onChange={onProviderChange}
                    onDelete={() => onProviderDelete(p.id)}
                  />
                )}
              </For>
              <button type="button" onClick={onAddProvider}>
                + Add provider
              </button>
            </section>
          </Show>
          <Show when={tab() === "app" && draft()}>
            <section>
              <h3>App behavior</h3>
              <label>
                <input
                  type="checkbox"
                  checked={draft()!.start_at_login}
                  onChange={(e) => setDraft({ ...draft()!, start_at_login: e.currentTarget.checked })}
                />
                Start at login
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={draft()!.start_minimized}
                  onChange={(e) => setDraft({ ...draft()!, start_minimized: e.currentTarget.checked })}
                />
                Start minimized (open to tray)
              </label>
              <label>
                Close behavior:
                <select
                  value={draft()!.close_behavior}
                  onChange={(e) => setDraft({ ...draft()!, close_behavior: e.currentTarget.value as "hide_to_tray" | "quit" })}
                >
                  <option value="hide_to_tray">Hide to tray</option>
                  <option value="quit">Quit app</option>
                </select>
              </label>
            </section>
          </Show>
          <Show when={tab() === "advanced"}>
            <section>
              <h3>Privacy</h3>
              <Show
                when={!confirmClear()}
                fallback={
                  <div class="settings-modal__confirm">
                    <p>Delete all conversations? This cannot be undone.</p>
                    <button type="button" onClick={() => void clearHistory()}>
                      Yes, delete all
                    </button>
                    <button type="button" onClick={() => setConfirmClear(false)}>
                      Cancel
                    </button>
                  </div>
                }
              >
                <button type="button" onClick={() => setConfirmClear(true)}>
                  Clear all history…
                </button>
              </Show>
            </section>
          </Show>
          <Show when={tab() === "window" || tab() === "billing"}>
            <section>
              <p class="settings-modal__placeholder">
                {tab() === "window" ? "Window settings (default size 800×600, min 600×400)" : "Billing providers — see ProviderCard for LLM; billing tools via tools/billing."}
              </p>
            </section>
          </Show>
        </div>
        <footer class="settings-modal__footer">
          <button type="button" onClick={() => props.onClose()}>
            Close
          </button>
          <button type="button" class="settings-modal__save" onClick={() => void save()}>
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}