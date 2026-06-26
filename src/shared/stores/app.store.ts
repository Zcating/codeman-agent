//! 全局 app-store (ADR-0015 + ADR-0016).
//!
//! Settings 的全局 reactive 桥接层。UI 通过 `appStore.state.value` 读，
//! 通过 `appStore.set(patch)` / `appStore.forceFlush()` / `appStore.refresh()`
//! 及 service-only-in-store 新方法 (D4) 写。
//!
//! 架构约束：
//! - **store 函数返回类型二选一**：`void` 或 `Effect<A, E, never>`。绝不返回 Promise。
//! - **本模块不接 debounce 逻辑**。`set()` 是同步 state mutation；debounce 由 Settings
//!   feature 层（`src/features/settings/lib/settings-saver.ts`）用 es-toolkit 实现。
//! - **D4 硬规则**（ADR-0016）：所有 service 操作（IPC / ProviderService / SettingsService /
//!   WorkspaceService）必须包成 store method，组件层只调 `Effect.runPromiseExit(store.method())`。
//!
//! 设计要点：
//! - `value: Settings` 永不为 null — `defaultSettings` 站位
//! - `set(patch)` 同步 in-memory update（不触发 IPC）
//! - `forceFlush()` 跳过 debounce 立即 IPC（footer Save 调用）
//! - `refresh()` 从后端重新加载
//! - `refreshProviderModels(id)` 拉 models + 写 state + D2 不变量
//! - `pickWorkspacePath()` 弹 OS folder picker
//! - `deleteProvider(id)` 从 providers[] 移除
//! - `clearAllHistory()` 清 SQLite conversation 表
//! - 启动时由 `src/index.tsx` 在 mount RouterProvider 之前 `await Effect.runPromiseExit(appStore.refresh())`

import { createStore } from "solid-js/store";
import { Effect } from "effect";
import type { Settings, Provider, ModelMeta, AppError } from "../lib/types";
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import {
  ProviderService,
  ProviderServiceLive,
  WorkspaceService,
  WorkspaceServiceLive,
  SettingsService,
  SettingsServiceLive,
} from "../lib/tauri";

// ─── Default Settings (ADR-0015) ──────────────────────────────────────
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
      "You are an AI assistant with access to file system tools.\n" +
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
};

const [settings, setSettings] = createStore<{ value: Settings }>({
  value: defaultSettings,
});

function applyPatch(patch: Partial<Settings>): void {
  setSettings("value", (prev) => ({ ...prev, ...patch }));
}

function toAppError(e: unknown): AppError {
  if (e && typeof e === "object" && "kind" in e) {
    return e as AppError;
  }
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

/**
 * V1.8+ ADR-0016 D1 + D2: 拉 models 列表 + 写 state + 强制执行 Default Model Invariant。
 *
 * Invariant: `Provider.llm.default_model` 始终是 `Provider.llm.models` 中某元素 id 或 `""`。
 *  若 default_model 不在新数组中且数组非空 → 改 models[0].id
 *  若数组为空 → 改 `""`
 *  已经在数组里 → 不动
 */
const refreshProviderModelsEffect = (id: string): Effect.Effect<ModelMeta[], AppError> =>
  Effect.gen(function* () {
    const svc = yield* ProviderService;
    const models = yield* svc.fetchModels(id);
    setSettings("value", (prev) => {
      const providers = (prev.providers ?? []).map((p) => {
        if (p.id !== id) {
          return p;
        }
        const newLlm = { ...p.llm, models };
        if (models.length > 0 && !models.some((m) => m.id === p.llm.default_model)) {
          newLlm.default_model = models[0].id;
        } else if (models.length === 0) {
          newLlm.default_model = "";
        }
        return { ...p, llm: newLlm };
      });
      return { ...prev, providers };
    });
    return models;
  })
    .pipe(Effect.provide(ProviderServiceLive))
    .pipe(Effect.mapError((e: unknown) => toAppError(e)));

/** V1.8+ ADR-0016 D4: 弹 OS folder picker，返回选中路径或 null。 */
const pickWorkspacePathEffect = Effect.gen(function* () {
  const svc = yield* WorkspaceService;
  return yield* svc.pickPath();
})
  .pipe(Effect.provide(WorkspaceServiceLive))
  .pipe(Effect.provide(SettingsServiceLive))
  .pipe(Effect.mapError((e: unknown) => toAppError(e)));

/** V1.8+ ADR-0016 D4: 从 providers[] 移除指定记录 + 触发后端 delete IPC (V0 占位)。 */
const deleteProviderEffect = (id: string): Effect.Effect<void, AppError> =>
  Effect.gen(function* () {
    // 1. client-side state mutation (实际删除)
    const providers = (settings.value.providers ?? []).filter((p) => p.id !== id);
    setSettings("value", (prev) => ({ ...prev, providers }));
    // 2. 后端 IPC (V0 占位, 失败不阻塞 — Rust 端无此命令但前端调用不 throw)
    const svc = yield* ProviderService;
    yield* svc.delete(id);
  })
    .pipe(Effect.provide(ProviderServiceLive))
    .pipe(Effect.mapError((e: unknown) => toAppError(e)));

/** V1.8+ ADR-0016 D4 + D5: 清 SQLite conversation 表。 */
const clearAllHistoryEffect: Effect.Effect<void, AppError> = Effect.gen(function* () {
  const svc = yield* SettingsService;
  yield* svc.clearAllHistory();
})
  .pipe(Effect.provide(SettingsServiceLive))
  .pipe(Effect.mapError((e: unknown) => toAppError(e)));

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
   * Returns Effect — caller bridges via `Effect.runPromiseExit(appStore.forceFlush())`.
   */
  forceFlush(): Effect.Effect<void, AppError> {
    return flushEffect;
  },

  /**
   * Reload Settings from backend. Called on app startup and on demand.
   * Returns Effect — caller bridges via `Effect.runPromiseExit(appStore.refresh())`.
   */
  refresh(): Effect.Effect<Settings, AppError> {
    return refreshEffect;
  },

  /**
   * V1.8+ ADR-0016 D1: 拉指定 provider 的 models 列表，写入 store。
   * 包含 D2 Default Model Invariant 强制执行。
   * 组件用 `Effect.runPromiseExit(appStore.refreshProviderModels(id))` + Exit.match 处理。
   * 注意: settingsSaver.scheduleSave() 仍由组件调用 (shared → feature 单向依赖)。
   */
  refreshProviderModels(id: string): Effect.Effect<ModelMeta[], AppError> {
    return refreshProviderModelsEffect(id);
  },

  /**
   * V1.8+ ADR-0016 D4: 弹 OS folder picker，返回选中路径或 null。
   * 组件用 `Effect.runPromiseExit(appStore.pickWorkspacePath())` + Exit.match。
   */
  pickWorkspacePath(): Effect.Effect<string | null, AppError> {
    return pickWorkspacePathEffect;
  },

  /**
   * V1.8+ ADR-0016 D4: 从 providers[] 移除 + 后端 delete IPC。
   * 组件用 `Effect.runPromiseExit(appStore.deleteProvider(id))` + Exit.match。
   */
  deleteProvider(id: string): Effect.Effect<void, AppError> {
    return deleteProviderEffect(id);
  },

  /**
   * V1.8+ ADR-0016 D4 + D5: 清 SQLite conversation 表。
   * 组件用 `Effect.runPromiseExit(appStore.clearAllHistory())` + Exit.match。
   */
  clearAllHistory(): Effect.Effect<void, AppError> {
    return clearAllHistoryEffect;
  },

  /**
   * 设置 Home 上次选中的 workspace id。
   * 用户在 Home 选 workspace 时调用；写入 in-memory state 后由 settingsSaver.scheduleSave() 触发
   * debounced IPC flush。详见 CONTEXT.md "Last-Used Workspace"。
   */
  setLastUsedWorkspaceId(id: string | null): void {
    applyPatch({ last_used_workspace_id: id ?? undefined });
  },

  /**
   * 读取 Home 上次选中的 workspace id。
   * 返回 `null` 表示从未设置过（首次启动 / 用户未在 Home 选过）。
   * 注意：调用方需配合 `Settings.workspaces[]` 做 fallback（删除/禁用检测），
   * 不能假设返回值在 workspaces[] 中存在。
   */
  getLastUsedWorkspaceId(): string | null {
    return appStore.state.value.last_used_workspace_id ?? null;
  },
};

/** Test-only: reset store state to defaultSettings (called from app.store.test.ts). */
export function _resetAppStoreForTest(): void {
  setSettings("value", defaultSettings);
}
