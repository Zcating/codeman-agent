//! /settings  — 全页面设置（替换主内容；不是 modal）。
//!
//! V1.5: 使用统一 providers[] (Provider 类型)，不再使用 V1 llm_providers[]。
//! "app" 选项卡不再有 start_minimized / close_behavior / hotkeys
//!（这些在 V1.5 后端重构中已移除 — 见 ADR-0007）。
//! "window" 和 "billing" 选项卡保留为占位符存根。

import { createSignal, Show, For } from "solid-js";
import { Link } from "@tanstack/solid-router";
import { ArrowLeft, Plus, Trash2 } from "lucide-solid";
import { ProviderCard } from "../components/provider-card";
import { WorkspaceCard } from "../components/workspace-card";
import {
  getSettingsBridge,
  updateSettingsBridge,
  clearAllHistoryBridge,
  getWorkspacesBridge,
  addWorkspaceBridge,
  updateWorkspaceBridge,
  removeWorkspaceBridge,
} from "../../../shared/lib/tauri";
import type { Provider, Settings, Workspace } from "../../../shared/lib/types";

type Tab = "llm" | "app" | "window" | "billing" | "advanced";

export function SettingsPage() {
  const [tab, setTab] = createSignal<Tab>("llm");
  const [draft, setDraft] = createSignal<Settings | null>(null);
  const [confirmClear, setConfirmClear] = createSignal(false);
  const [workspaces, setWorkspaces] = createSignal<Workspace[]>([]);

  // 挂载时加载设置 + providers。
  void (async () => {
    try {
      const s = await getSettingsBridge();
      setDraft(s);
    } catch (e) {
      console.error("[SettingsPage] 加载失败：", e);
    }
  })();

  // 挂载时加载 workspaces。
  void (async () => {
    try {
      const ws = await getWorkspacesBridge();
      setWorkspaces(ws);
    } catch (e) {
      console.error("[SettingsPage] 加载 workspaces 失败：", e);
    }
  })();

  const save = async () => {
    const d = draft();
    if (!d) return;
    try {
      await updateSettingsBridge(d);
    } catch (e) {
      console.error("[SettingsPage] 保存失败：", e);
    }
  };

  // V1.5: 使用 Provider 类型 (不是 LLMProvider)
  const onProviderChange = (next: Provider) => {
    const d = draft();
    if (!d) return;
    setDraft({
      ...d,
      providers: (d.providers ?? []).map((p) => (p.id === next.id ? next : p)),
    });
  };

  const onProviderDelete = (id: string) => {
    const d = draft();
    if (!d) return;
    setDraft({
      ...d,
      providers: (d.providers ?? []).filter((p) => p.id !== id),
    });
  };

  // V1.5: Add provider 是未来工作，当前只 alert
  const onAddProvider = () => {
    // V1.5+ 只有一个默认 MiniMax provider，用户可以配置但不能添加更多
    alert("Add provider: future work (V1.5+ has 1 pre-fill MiniMax)");
  };

  const onWorkspaceUpdate = async (id: string, patch: Partial<Workspace>) => {
    try {
      await updateWorkspaceBridge(id, patch);
      setWorkspaces((prev) =>
        prev.map((ws) => (ws.id === id ? { ...ws, ...patch } : ws)),
      );
    } catch (e) {
      console.error("[SettingsPage] 更新 workspace 失败：", e);
    }
  };

  const onWorkspaceRemove = async (id: string) => {
    if (!confirm("Delete this workspace?")) return;
    try {
      await removeWorkspaceBridge(id);
      setWorkspaces((prev) => prev.filter((ws) => ws.id !== id));
    } catch (e) {
      console.error("[SettingsPage] 删除 workspace 失败：", e);
    }
  };

  const onAddWorkspace = async () => {
    const id = crypto.randomUUID();
    const newWs: Workspace = {
      id,
      label: "New Workspace",
      root_path: "",
      enabled: false,
    };
    try {
      await addWorkspaceBridge(newWs);
      setWorkspaces((prev) => [...prev, newWs]);
    } catch (e) {
      console.error("[SettingsPage] 添加 workspace 失败：", e);
    }
  };

  const clearHistory = async () => {
    try {
      await clearAllHistoryBridge();
      setConfirmClear(false);
    } catch (e) {
      console.error("[SettingsPage] 清除失败：", e);
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
              {t === "llm"
                ? "LLM"
                : t === "app"
                  ? "App"
                  : t === "window"
                    ? "Window"
                    : t === "billing"
                      ? "Billing"
                      : "Advanced"}
            </button>
          )}
        </For>
      </nav>
      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        <Show when={tab() === "llm" && draft()}>
          <section>
            <h2 class="text-lg font-semibold mb-2 text-zinc-900 dark:text-zinc-100">
              LLM Providers
            </h2>
            {/* V1.5: 空状态友好提示 */}
            <Show
              when={(draft()!.providers ?? []).length > 0}
              fallback={
                <div class="text-center py-12 space-y-2 border border-dashed border-zinc-300 dark:border-zinc-600 rounded-lg">
                  <p class="text-zinc-500 dark:text-zinc-400">No providers configured.</p>
                  <p class="text-zinc-400 dark:text-zinc-500 text-sm">
                    Add your first provider to get started.
                  </p>
                </div>
              }
            >
              <For each={draft()!.providers ?? []}>
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

            {/* ── Workspaces section ── */}
            <div class="mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-700">
              <h3 class="text-base font-semibold mb-3 text-zinc-900 dark:text-zinc-100">
                Workspaces
              </h3>
              <Show
                when={workspaces().length > 0}
                fallback={
                  <p class="text-sm text-muted-foreground py-4 text-center">
                    No workspaces configured.
                  </p>
                }
              >
                <For each={workspaces()}>
                  {(ws) => (
                    <WorkspaceCard
                      workspace={ws}
                      onUpdate={(patch) => onWorkspaceUpdate(ws.id, patch)}
                      onRemove={() => onWorkspaceRemove(ws.id)}
                    />
                  )}
                </For>
              </Show>
              <button
                type="button"
                onClick={onAddWorkspace}
                class="mt-2 px-3 py-1.5 text-sm border border-input bg-background text-zinc-700 dark:text-zinc-300 rounded-md hover:bg-accent hover:text-accent-foreground"
              >
                <Plus class="h-4 w-4 inline mr-1" />
                Add workspace
              </button>
            </div>
          </section>
        </Show>
        <Show when={tab() === "app" && draft()}>
          <section>
            <h2 class="text-lg font-semibold mb-2 text-zinc-900 dark:text-zinc-100">
              App behavior
            </h2>
            <label class="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={draft()!.start_at_login}
                onChange={(e) => setDraft({ ...draft()!, start_at_login: e.currentTarget.checked })}
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
        <Show when={tab() === "window" || tab() === "billing"}>
          <section>
            <p class="text-sm text-zinc-500 dark:text-zinc-400 italic">
              {tab() === "window"
                ? "Window settings (default size 1280×1280, min 800×800; position is remembered)"
                : "Billing providers — see ProviderCard for LLM; billing tools via tools/billing."}
            </p>
          </section>
        </Show>
      </div>
      <footer class="flex items-center justify-end gap-2 p-4 border-t border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
        <button
          type="button"
          onClick={() => void save()}
          class="px-4 py-2 text-sm bg-primary-500 text-white rounded-md font-medium hover:bg-primary-600 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        >
          Save
        </button>
      </footer>
    </main>
  );
}
