//! SettingsModal — tabbed settings dialog.

import { createSignal, Show, For } from "solid-js";
import { Effect } from "effect";
import { ProviderCard } from "./provider-card";
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
    <div class="fixed inset-0 z-40 flex items-center justify-center" role="dialog" aria-modal="true">
      <div class="fixed inset-0 bg-black/50 z-40" onClick={() => props.onClose()} />
      <div class="relative z-50 bg-white dark:bg-zinc-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden mx-4">
        <header class="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-700">
          <h2 class="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Settings</h2>
          <button
            type="button"
            onClick={() => props.onClose()}
            aria-label="Close"
            class="text-2xl text-zinc-500 hover:text-zinc-900 dark:hover:text-white w-8 h-8 flex items-center justify-center rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700"
          >
            ×
          </button>
        </header>
        <nav class="flex gap-1 p-2 border-b border-zinc-200 dark:border-zinc-700 overflow-x-auto">
          <For each={["llm", "app", "window", "billing", "advanced"] as const}>
            {(t) => (
              <button
                type="button"
                class={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                  tab() === t
                    ? "bg-primary-500 text-white hover:bg-primary-600"
                    : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                }`}
                onClick={() => setTab(t)}
              >
                {t === "llm" ? "LLM" : t === "app" ? "App" : t === "window" ? "Window" : t === "billing" ? "Billing" : "Advanced"}
              </button>
            )}
          </For>
        </nav>
        <div class="flex-1 overflow-y-auto p-4 space-y-4">
          <Show when={tab() === "llm" && draft()}>
            <section>
              <h3 class="text-lg font-semibold mb-2 text-zinc-900 dark:text-zinc-100">LLM Providers</h3>
              <For each={draft()!.llm_providers}>
                {(p) => (
                  <ProviderCard
                    provider={p}
                    onChange={onProviderChange}
                    onDelete={() => onProviderDelete(p.id)}
                  />
                )}
              </For>
              <button
                type="button"
                onClick={onAddProvider}
                class="mt-2 px-3 py-1.5 text-sm bg-primary-500 text-white rounded-md hover:bg-primary-600"
              >
                + Add provider
              </button>
            </section>
          </Show>
          <Show when={tab() === "app" && draft()}>
            <section>
              <h3 class="text-lg font-semibold mb-2 text-zinc-900 dark:text-zinc-100">App behavior</h3>
              <label class="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 mb-2">
                <input
                  type="checkbox"
                  checked={draft()!.start_at_login}
                  onChange={(e) => setDraft({ ...draft()!, start_at_login: e.currentTarget.checked })}
                  class="rounded text-primary-500 focus:ring-primary-500 w-4 h-4"
                />
                Start at login
              </label>
              <label class="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 mb-2">
                <input
                  type="checkbox"
                  checked={draft()!.start_minimized}
                  onChange={(e) => setDraft({ ...draft()!, start_minimized: e.currentTarget.checked })}
                  class="rounded text-primary-500 focus:ring-primary-500 w-4 h-4"
                />
                Start minimized (open to tray)
              </label>
              <label class="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <span>Close behavior:</span>
                <select
                  value={draft()!.close_behavior}
                  onChange={(e) => setDraft({ ...draft()!, close_behavior: e.currentTarget.value as "hide_to_tray" | "quit" })}
                  class="flex-1 p-2 border border-zinc-300 dark:border-zinc-600 rounded-md bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 focus:outline-none"
                >
                  <option value="hide_to_tray">Hide to tray</option>
                  <option value="quit">Quit app</option>
                </select>
              </label>
            </section>
          </Show>
          <Show when={tab() === "advanced"}>
            <section>
              <h3 class="text-lg font-semibold mb-2 text-zinc-900 dark:text-zinc-100">Privacy</h3>
              <Show
                when={!confirmClear()}
                fallback={
                  <div class="p-4 border border-amber-300 dark:border-amber-700 rounded-md bg-amber-50 dark:bg-amber-900/20 space-y-2">
                    <p class="text-sm text-amber-900 dark:text-amber-200">Delete all conversations? This cannot be undone.</p>
                    <div class="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void clearHistory()}
                        class="px-3 py-1.5 text-sm bg-red-500 text-white rounded-md hover:bg-red-600"
                      >
                        Yes, delete all
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClear(false)}
                        class="px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-600 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                }
              >
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  class="px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-600 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700"
                >
                  Clear all history…
                </button>
              </Show>
            </section>
          </Show>
          <Show when={tab() === "window" || tab() === "billing"}>
            <section>
              <p class="text-sm text-zinc-500 dark:text-zinc-400 italic">
                {tab() === "window" ? "Window settings (default size 800×600, min 600×400)" : "Billing providers — see ProviderCard for LLM; billing tools via tools/billing."}
              </p>
            </section>
          </Show>
        </div>
        <footer class="flex items-center justify-end gap-2 p-4 border-t border-zinc-200 dark:border-zinc-700">
          <button
            type="button"
            onClick={() => props.onClose()}
            class="px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-md"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => void save()}
            class="px-4 py-2 text-sm bg-primary-500 text-white rounded-md font-medium hover:bg-primary-600 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}
