//! 全局 app-store (ADR-0015).
//!
//! Settings 的全局 reactive 桥接层。UI 通过 `appStore.state.value` 读，
//! 通过 `appStore.set(patch)` / `appStore.forceFlush()` / `appStore.refresh()` 写。
//!
//! 架构约束：
//! - **store 函数返回类型二选一**：`void` 或 `Effect<A, E, R>`。绝不返回 Promise。
//! - **本模块不持 debounce 逻辑**。`set()` 是同步 state mutation;debounce 由 Settings
//!   feature 层（`src/features/settings/lib/settings-saver.ts`）用 es-toolkit 实现。
//!
//! 设计要点：
//! - `value: Settings` 永不为 null —— `defaultSettings` 占位
//! - `set(patch)` 同步 in-memory update（不触发 IPC）
//! - `forceFlush()` 跳过任何 debounce，立即 IPC（footer Save 调用）
//! - `refresh()` 从后端重新加载
//! - 启动时由 `src/index.tsx` 在 mount RouterProvider 之前 `await Effect.runPromise(appStore.refresh())`

import { createStore } from "solid-js/store";
import { Effect } from "effect";
import type { Settings, Provider, ProviderBilling, ModelMeta, AppError } from "../lib/types";
import { invoke as tauriInvoke } from "@tauri-apps/api/core";

// ─── Default Settings (ADR-0015) ─────────────────────────────────────
const DEFAULT_MINIMAX_PROVIDER: Provider = {
  id: "minimax",
  label: "MiniMax",
  enabled: true,
  api_key: "",
  llm: {
    default_model: "MiniMax-M2.5-highspeed",
    base_url: "https://api.minimaxi.com/anthropic",
    api_type: "anthropic-messages",
    models: [
      {
        id: "MiniMax-M2.5-highspeed",
        label: "MiniMax-M2.5-highspeed",
        context_window: 200_000,
        deprecated: false,
        thinking: false,
      } as ModelMeta,
    ],
    models_endpoint: "https://api.minimaxi.com/anthropic/v1/models",
  },
  billing: {
    kind: "plan_quota",
  } as ProviderBilling,
};

export const defaultSettings: Settings = {
  providers: [DEFAULT_MINIMAX_PROVIDER],
  schema_version: "1.5",
  default_llm_provider_id: "minimax",
  user_language: "auto",
  theme: "system",
  start_at_login: true,
  window: {
    remember_position: true,
    remember_size: true,
    default_size: { width: 1280, height: 1280 },
    min_size: { width: 800, height: 800 },
  },
  system_prompt: {
    default:
      "You are an AI assistant with access to billing tools and file system tools.\n" +
      "\n## Billing Tools\n" +
      "You can call get_balance and get_plan_quota to check provider billing state.\n" +
      "\n## File Tools\n" +
      "You have access to 5 file tools (read_file, write_file, edit_file, search_files, delete_file).\n" +
      "Each tool requires a workspace_id parameter — only operate within user-configured workspaces.\n" +
      "Paths outside any workspace will return a SandboxViolation error.\n" +
      "For edit_file, your old_text must match exactly once unless you set replace_all=true.\n" +
      "Files are limited to 10 MB. Binary files, .exe/.dll/.sys files, and paths outside workspaces are blocked.",
    user_can_edit: true,
  },
  conversations: { auto_archive_after_days: 30, max_history: 1000 },
  workspaces: [],
  llm_providers: [],
  billing_providers: [],
};

const [settings, setSettings] = createStore<{ value: Settings }>({
  value: defaultSettings,
});

function applyPatch(patch: Partial<Settings>): void {
  setSettings("value", (prev) => ({ ...prev, ...patch }));
}

function toAppError(e: unknown): AppError {
  if (e && typeof e === "object" && "kind" in e) return e as AppError;
  return { kind: "Unknown", message: e instanceof Error ? e.message : String(e) };
}

const flushEffect: Effect.Effect<void, AppError> = Effect.tryPromise({
  try: async () => {
    await tauriInvoke("update_settings", { newSettings: settings.value });
  },
  catch: toAppError,
});

const refreshEffect: Effect.Effect<Settings, AppError> = Effect.tryPromise({
  try: async () => {
    const fresh = await tauriInvoke<Settings>("get_settings");
    setSettings("value", fresh);
    return fresh;
  },
  catch: toAppError,
});

export const appStore = {
  /** Reactive read of current Settings (always defined, never null). */
  state: settings,

  /**
   * Merge patch into reactive state SYNCHRONOUSLY (no debounce, no IPC).
   * - Multiple set() calls within a short time coalesce visually but each mutates state immediately.
   * - To trigger IPC, call `settingsSaver.scheduleSave()` (from src/features/settings/lib/settings-saver).
   * - Returns void immediately.
   */
  set(patch: Partial<Settings>): void {
    applyPatch(patch);
  },

  /**
   * Force immediate flush (skip debounce). Called by footer Save button.
   * Returns Effect —— 调用方用 `Effect.runPromise(appStore.forceFlush())` 桥接。
   */
  forceFlush(): Effect.Effect<void, AppError> {
    return flushEffect;
  },

  /**
   * Reload Settings from backend. Called on app startup and on demand.
   * Returns Effect —— 调用方用 `Effect.runPromise(appStore.refresh())` 桥接。
   */
  refresh(): Effect.Effect<Settings, AppError> {
    return refreshEffect;
  },
};

/** Test-only: reset store state to defaultSettings (called from app.store.test.ts). */
export function _resetAppStoreForTest(): void {
  setSettings("value", defaultSettings);
}
