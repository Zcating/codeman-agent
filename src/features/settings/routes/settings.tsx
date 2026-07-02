//! /settings  — 全页面设置（替换主内容；不是 modal）。
//!
//! V1.7+ (ADR-0015): 所有写操作通过 appStore.set()，debounced 500ms auto-flush；
//! footer Save 按钮调用 appStore.forceFlush()。不再有 local draft signal。
//! "app" 选项卡不再有 start_minimized / close_behavior / hotkeys
//!（这些在 V1.5 后端重构中已移除 — 见 ADR-0007）。
//! "window" 选项卡保留为占位符存根。

import { createSignal, Show, For, onMount } from "solid-js";
import { Effect } from "effect";
import { Link } from "@tanstack/solid-router";
import { ArrowLeft, Plus, Trash2 } from "lucide-solid";
import { ProviderCard } from "../components/provider-card";
import { appStore } from "../../../shared/stores/app.store";
import { settingsSaver } from "../lib/settings-saver";
import { invoke } from "../../../shared/lib/tauri";
import { logger } from "../../../shared/lib/logger";
import type { Provider } from "../../../shared/lib/types";

type Tab = "llm" | "app" | "window" | "advanced";

export function SettingsPage() {
  const [tab, setTab] = createSignal<Tab>("llm");
  const [confirmClear, setConfirmClear] = createSignal(false);

  // 挂载时确保从后端加载最新 Settings（main.tsx 已 eager refresh，此处保险再 refresh 一次）
  // 用 `runPromiseExit` 而非 `runPromise`：失败时返回 Exit.Failure 而不是 reject，
  // 避免 fire-and-forget 触发 unhandled rejection（per vitest 4.x "1 error" 计数）。
  onMount(() => {
    void Effect.runPromiseExit(appStore.refresh()).then((exit) => {
      if (exit._tag === "Failure") {
        logger.error("[SettingsPage] refresh 失败：", exit.cause);
      }
    });
  });

  // footer Save = force flush（跳过 debounce）。Await so the IPC update_settings
  // resolves before the caller continues — V2 e2e tests call get_settings
  // immediately after click(Save) and expect the new api_key to be on disk.
  const save = (): void => {
    void settingsSaver.flushNow().catch((e: unknown) => {
      logger.error("[SettingsPage] flushNow failed:", e);
    });
  };

  // ProviderCard 已直接调 appStore.set，父组件只需处理 delete
  const onProviderDelete = (id: string) => {
    const providers = appStore.state.value.providers!.filter((p) => p.id !== id);
    appStore.set({ providers });
  };

  const onProviderChange = (next: Provider) => {
    // 兜底：ProviderCard 已直接调 appStore.set，此处 idempotent 同步（防 race）
    const providers = appStore.state.value.providers!.map((p) => (p.id === next.id ? next : p));
    appStore.set({ providers });
  };

  // V1.5: Add provider 是未来工作，当前只 alert
  const onAddProvider = () => {
    // V1.5+ 只有一个默认 MiniMax provider，用户可以配置但不能添加更多
    alert("Add provider: future work (V1.5+ has 1 pre-fill MiniMax)");
  };

  const clearHistory = async () => {
    try {
      // SQLite 操作不走 Settings，走 IPC（clear_all_history 是 SQLite 操作，不是 Settings）
      await Effect.runPromise(invoke<void>("clear_all_history"));
      setConfirmClear(false);
    } catch (e) {
      logger.error("[SettingsPage] 清除失败：", e);
    }
  };

  return (
    <main class="flex flex-col h-screen w-full bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 overflow-hidden">
      <header class="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
        <Link
          to="/"
          class="text-sm text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 flex items-center gap-1"
        >
          <ArrowLeft class="h-4 w-4 inline mr-1" />
          Back
        </Link>
        <h1 class="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Settings</h1>
        <div class="w-12" />
      </header>
      <nav class="flex gap-1 p-2 border-b border-zinc-200 dark:border-zinc-700 overflow-x-auto bg-white dark:bg-zinc-800">
        <For each={["llm", "app", "window", "advanced"] as const}>
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
              {t === "llm"
                ? "LLM"
                : t === "app"
                  ? "App"
                  : t === "window"
                    ? "Window"
                    : "Advanced"}
            </button>
          )}
        </For>
      </nav>
      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        <Show when={tab() === "llm"}>
          <section>
            <h2 class="text-lg font-semibold mb-2 text-zinc-900 dark:text-zinc-100">
              LLM Providers
            </h2>
            {/* V1.5: 空状态友好提示 */}
            <Show
              when={(appStore.state.value.providers ?? []).length > 0}
              fallback={
                <div class="text-center py-12 space-y-2 border border-dashed border-zinc-300 dark:border-zinc-600 rounded-lg">
                  <p class="text-zinc-500 dark:text-zinc-400">No providers configured.</p>
                  <p class="text-zinc-400 dark:text-zinc-500 text-sm">
                    Add your first provider to get started.
                  </p>
                </div>
              }
            >
              <For each={appStore.state.value.providers ?? []}>
                {(p) => (
                  <ProviderCard
                    provider={p}
                    onUpdate={onProviderChange}
                    onDelete={() => onProviderDelete(p.id)}
                  />
                )}
              </For>
            </Show>
            <button
              type="button"
              onClick={onAddProvider}
              class="mt-2 px-3 py-1.5 text-sm bg-primary-500 text-white rounded-md hover:bg-primary-600"
            >
              <Plus class="h-4 w-4 inline mr-1" />
              Add provider
            </button>
          </section>
        </Show>
        <Show when={tab() === "app"}>
          <section>
            <h2 class="text-lg font-semibold mb-2 text-zinc-900 dark:text-zinc-100">
              App behavior
            </h2>
            <label class="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={appStore.state.value.start_at_login}
                onChange={(e) => appStore.set({ start_at_login: e.currentTarget.checked })}
                class="rounded text-primary-500 focus:ring-primary-500 w-4 h-4"
              />
              Start at login
            </label>
            <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
              The app starts in the taskbar. Click the window to bring it forward; use File → Quit
              to exit.
            </p>
          </section>
        </Show>
        <Show when={tab() === "advanced"}>
          <section>
            <h2 class="text-lg font-semibold mb-2 text-zinc-900 dark:text-zinc-100">Privacy</h2>
            <Show
              when={!confirmClear()}
              fallback={
                <div class="p-4 border border-amber-300 dark:border-amber-700 rounded-md bg-amber-50 dark:bg-amber-900/20 space-y-2">
                  <p class="text-sm text-amber-900 dark:text-amber-200">
                    Delete all conversations? This cannot be undone.
                  </p>
                  <div class="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void clearHistory()}
                      class="px-3 py-1.5 text-sm bg-red-500 text-white rounded-md hover:bg-red-600"
                    >
                      <Trash2 class="h-4 w-4 inline mr-1" />
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
                <Trash2 class="h-4 w-4 inline mr-1" />
                Clear all history…
              </button>
            </Show>
          </section>
        </Show>
        <Show when={tab() === "window"}>
          <section>
            <p class="text-sm text-zinc-500 dark:text-zinc-400 italic">
              Window settings (default size 1280×1280, min 800×800; position is remembered)
            </p>
          </section>
        </Show>
      </div>
      <footer class="flex items-center justify-end gap-2 p-4 border-t border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
        <button
          type="button"
          onClick={save}
          class="px-4 py-2 text-sm bg-primary-500 text-white rounded-md font-medium hover:bg-primary-600 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        >
          Save
        </button>
      </footer>
    </main>
  );
}
