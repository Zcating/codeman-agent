//! V3 IPC mock — used by Effect service tests and jsdom test environment.
//! Sets up `window.codeman` and exports `mockState` for test state control.
//! (Replaces src/__mocks__/@tauri-apps/api/core.ts post-migration.)
//!
//! V1.5+ schema: Settings.providers[] (llm only — billing removed V2)
//! V0 schema: Settings.llm_providers[] (legacy, migrated on read)

import { vi } from "vitest";

// ─── V1.5+ Types ───────────────────────────────────────────────

export interface ModelMeta {
  id: string;
  label: string;
  context_window?: number;
  deprecated?: boolean;
  thinking?: boolean;
}

export interface ProviderLlm {
  default_model: string;
  base_url: string;
  api_type: "anthropic-messages";
  models: ModelMeta[];
  models_endpoint: string;
}

export interface Provider {
  id: string;
  label: string;
  enabled: boolean;
  api_key: string;
  llm: ProviderLlm;
}

// V1.5+ Settings shape
export interface SettingsV15 {
  providers: Provider[];
  schema_version: "1.5";
  default_llm_provider_id?: string;
  user_language: "zh" | "en" | "auto";
  theme: "light" | "dark" | "system";
  start_at_login: boolean;
  window: {
    remember_position: boolean;
    remember_size: boolean;
    default_size: { width: number; height: number };
    min_size: { width: number; height: number };
  };
  system_prompt: { default: string; user_can_edit: boolean };
  conversations: { auto_archive_after_days: number; max_history: number };
  // V0 legacy field (cleared after migration, mirrors Rust behavior)
  llm_providers: Array<{
    id: string;
    label: string;
    enabled: boolean;
    default_model?: string;
    base_url?: string;
    api_type: "anthropic-messages";
    api_key_ref: string;
  }>;
  // V2: workspaces (added in ADR-0013)
  workspaces?: Array<{
    id: string;
    label: string;
    root_path: string;
    enabled: boolean;
  }>;
}

// V0 Settings shape (for migration testing)
export interface SettingsV0 {
  schema_version?: string;
  llm_providers: Array<{
    id: string;
    label: string;
    enabled: boolean;
    default_model?: string;
    base_url?: string;
    api_type: "anthropic-messages";
    api_key_ref: string;
  }>;
  default_llm_provider_id?: string;
  user_language: "zh" | "en" | "auto";
  theme: "light" | "dark" | "system";
  start_at_login: boolean;
  window: {
    remember_position: boolean;
    remember_size: boolean;
    default_size: { width: number; height: number };
    min_size: { width: number; height: number };
  };
  system_prompt: { default: string; user_can_edit: boolean };
  conversations: { auto_archive_after_days: number; max_history: number };
}

// ─── Mock Factory ───────────────────────────────────────────────

export const mockProvider = (
  overrides: Partial<Provider> & { id: string; label: string },
): Provider => {
  return {
    id: overrides.id ?? "minimax",
    label: overrides.label ?? "MiniMax",
    enabled: overrides.enabled ?? true,
    api_key: overrides.api_key ?? "",
    llm: overrides.llm ?? {
      default_model: "MiniMax-M2.5-highspeed",
      base_url: "https://api.minimaxi.com/anthropic",
      api_type: "anthropic-messages",
      models: [
        {
          id: "MiniMax-M2.5-highspeed",
          label: "MiniMax-M2.5-highspeed",
          context_window: 200000,
          deprecated: false,
          thinking: false,
        },
      ],
      models_endpoint: "https://api.minimaxi.com/anthropic/v1/models",
    },
  };
};

export const mockMinimaxProvider: Provider = mockProvider({
  id: "minimax",
  label: "MiniMax",
  api_key: "",
});

export const mockDeepseekProvider: Provider = mockProvider({
  id: "deepseek",
  label: "DeepSeek",
  api_key: "",
  llm: {
    default_model: "deepseek-chat",
    base_url: "https://api.deepseek.com/anthropic",
    api_type: "anthropic-messages",
    models: [
      {
        id: "deepseek-chat",
        label: "deepseek-chat",
        context_window: 64000,
        deprecated: false,
        thinking: false,
      },
    ],
    models_endpoint: "https://api.deepseek.com/models",
  },
});

const defaultSettingsV15: SettingsV15 = {
  providers: [mockMinimaxProvider],
  schema_version: "1.5",
  default_llm_provider_id: "minimax",
  user_language: "en",
  theme: "system",
  start_at_login: false,
  window: {
    remember_position: false,
    remember_size: false,
    default_size: { width: 800, height: 600 },
    min_size: { width: 400, height: 300 },
  },
  system_prompt: { default: "You are a helpful assistant.", user_can_edit: true },
  conversations: { auto_archive_after_days: 30, max_history: 1000 },
  // V0 legacy field (empty for V1.5 default)
  llm_providers: [],
};

// ─── Mock State ────────────────────────────────────────────────

export const mockState = {
  resolved: undefined as unknown,
  rejected: undefined as Error | undefined,
  calls: [] as string[],
  // TDD 增强：跟踪每次 IPC 调用的 (command, args) 用于桥接函数参数断言。
  // 增量为追加数组，每条 = `{ name, args }`；旧 `calls` 保留向后兼容。
  callArgs: [] as Array<{ name: string; args: Record<string, unknown> | undefined }>,
  // Captures full invoke calls: { name, args }
  invokeCalls: [] as { name: string; args?: Record<string, unknown> }[],
  // V1.5+ settings store
  settings: { ...defaultSettingsV15 } as SettingsV15,
  // ADR-0015: store is retained for test backward compat only.
  // New code should read api_key from settings.providers[i].api_key.
  // Legacy tests reading from store still work; new tests should NOT use it.
  store: {} as Record<string, Record<string, string>>,
  // V0 migration flag
  v0FixtureActive: false,
  // Command-specific resolved override: when set, only applies to specific commands
  // while the general resolved still applies to all commands.
  // This allows tests to override return values for specific commands without
  // affecting get_settings (which needs to return full settings for provider validation).
  resolvedByCommand: {} as Record<string, unknown>,
};

// ─── V0 → V1.5 Migration ───────────────────────────────────────

// Default MiniMax provider for V0.5 fresh install
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
      },
    ],
    models_endpoint: "https://api.minimaxi.com/anthropic/v1/models",
  },
};

function migrateV0toV15(v0: SettingsV0): SettingsV15 {
  // V0.5 detection: empty llm_providers → fresh install, pre-fill MiniMax
  if (v0.llm_providers.length === 0) {
    return {
      providers: [DEFAULT_MINIMAX_PROVIDER],
      schema_version: "1.5",
      default_llm_provider_id: "minimax",
      user_language: v0.user_language,
      theme: v0.theme,
      start_at_login: v0.start_at_login,
      window: v0.window,
      system_prompt: v0.system_prompt,
      conversations: v0.conversations,
      llm_providers: [],
    };
  }

  const providers: Provider[] = [];

  // Migrate each LLM provider
  for (const llm of v0.llm_providers) {
    providers.push({
      id: llm.id,
      label: llm.label,
      enabled: llm.enabled,
      api_key: llm.api_key_ref,
      llm: {
        default_model: llm.default_model ?? "auto",
        base_url: llm.base_url ?? "",
        api_type: "anthropic-messages",
        models: [],
        models_endpoint: "",
      },
    });
  }

  return {
    providers,
    schema_version: "1.5",
    default_llm_provider_id: v0.default_llm_provider_id,
    user_language: v0.user_language,
    theme: v0.theme,
    start_at_login: v0.start_at_login,
    window: v0.window,
    system_prompt: v0.system_prompt,
    conversations: v0.conversations,
    // V0 legacy field cleared after migration (mirrors Rust behavior)
    llm_providers: [],
  };
}

// ─── IPC Command Handlers ───────────────────────────────────────

type IPCCommand = string;
type IPCArgs = Record<string, unknown> | undefined;

const commandHandlers: Record<IPCCommand, (args?: IPCArgs) => unknown> = {
  get_settings(): unknown {
    // If V0 fixture is active, migrate on read
    if (mockState.v0FixtureActive) {
      const v0Settings = mockState.resolved as SettingsV0 | undefined;
      if (v0Settings && !v0Settings.schema_version) {
        mockState.settings = migrateV0toV15(v0Settings);
      }
    }
    return { ...mockState.settings };
  },

  update_settings(args?: IPCArgs): unknown {
    const newSettings = (args?.newSettings ?? args?.new_settings) as Partial<SettingsV15> | undefined;
    if (newSettings) {
      // Merge with existing settings
      mockState.settings = {
        ...mockState.settings,
        ...newSettings,
        // Always preserve schema_version
        schema_version: "1.5",
      };
    }
    return { ...mockState.settings };
  },

  clear_all_history(): void {
    // No-op in mock
  },

  fetch_models(args?: IPCArgs): unknown {
    // Returns current models from settings for the given provider
    const providerId = args?.providerId as string;
    const provider = mockState.settings.providers.find((p) => p.id === providerId);
    return provider?.llm.models ?? [];
  },

  // ─── V2 File IO (ADR-0013) ───────────────────────────────────
  // Mock handlers for file_tools service; tests set mockState.resolved
  // to control return value, or mockState.rejected to simulate errors.
  read_file(): unknown {
    return mockState.resolved;
  },

  write_file(): unknown {
    return mockState.resolved;
  },

  edit_file(): unknown {
    return mockState.resolved;
  },

  search_files(): unknown {
    return mockState.resolved;
  },

  delete_file(): unknown {
    return mockState.resolved;
  },

  // ─── Conversation IPC (ADR-0013) ─────────────────────────────────
  list_conversations(_args?: IPCArgs): unknown {
    // Return empty array by default; tests can override via mockState.resolved
    return mockState.resolved ?? [];
  },

  get_conversation(args?: IPCArgs): unknown {
    return mockState.resolved ?? { id: (args?.id as string) ?? "", title: "", system_prompt: null, workspace_id: "", created_at: 0, updated_at: 0, archived_at: null };
  },

  create_conversation(args?: IPCArgs): unknown {
    return mockState.resolved ?? {
      id: "new-conv-id",
      title: (args?.title as string) ?? "",
      system_prompt: (args?.systemPrompt as string | null) ?? null,
      workspace_id: (args?.workspaceId as string) ?? "",
      created_at: Date.now(),
      updated_at: Date.now(),
      archived_at: null,
    };
  },

  archive_conversation(): unknown {
    return mockState.resolved ?? undefined;
  },

  delete_conversation(): unknown {
    return mockState.resolved ?? undefined;
  },

  // ─── Message IPC (ADR-0013) ─────────────────────────────────────
  list_messages(_args?: IPCArgs): unknown {
    return mockState.resolved ?? [];
  },

  append_message(args?: IPCArgs): unknown {
    return mockState.resolved ?? { id: "new-msg-id", conversation_id: (args?.conversationId as string) ?? "", role: (args?.role as string) ?? "user", content: (args?.content as string) ?? "", tool_calls: null, tool_results: null, model: null, input_tokens: null, output_tokens: null, created_at: Date.now() };
  },

  search_messages(_args?: IPCArgs): unknown {
    return mockState.resolved ?? [];
  },

  // ─── Workspace IPC ──────────────────────────────────────────────
  pick_workspace_path(): unknown {
    return mockState.resolved ?? null;
  },
};

// ─── Invoke Mock ────────────────────────────────────────────────

export const invoke = vi.fn().mockImplementation((name: string, args?: IPCArgs) => {
  mockState.calls.push(name);
  mockState.callArgs.push({ name, args: args as Record<string, unknown> | undefined });
  mockState.invokeCalls.push({ name, args: args as Record<string, unknown> | undefined });

  if (mockState.rejected) {
    return Promise.reject(mockState.rejected);
  }

  // Command-specific resolved override: takes precedence over general resolved.
  // Allows tests to override specific commands without affecting get_settings.
  if (mockState.resolvedByCommand[name] !== undefined && !mockState.v0FixtureActive) {
    return Promise.resolve(mockState.resolvedByCommand[name]);
  }

  // Backward compatibility: if mockState.resolved is set AND v0FixtureActive is false,
  // return it directly. This preserves existing test behavior where tests set mockState.resolved.
  // But if v0FixtureActive is true, we need to run the handler to apply migration.
  if (mockState.resolved !== undefined && !mockState.v0FixtureActive) {
    return Promise.resolve(mockState.resolved);
  }

  const handler = commandHandlers[name];
  if (!handler) {
    return Promise.reject(
      new Error(
        `[mock] Unknown IPC command: "${name}". Available: ${Object.keys(commandHandlers).join(", ")}`,
      ),
    );
  }

  try {
    const result = handler(args);
    return Promise.resolve(result);
  } catch (e) {
    return Promise.reject(e);
  }
});

export { invoke as TauriInvoke };
export default { invoke };

// ─── V3: window.codeman Mock ───────────────────────────────────
//
// ipc.ts dispatches via `window.codeman.<method>` (set by electron/preload).
// This mock mirrors every command in `commandHandlers` as a method on
// `window.codeman`, so V3 ipc.ts finds the mock at runtime in jsdom tests.

function buildCodemanMock(): Record<string, unknown> {
  // The renderer (ipc.ts) dispatches each IPC command via a different
  // window.codeman method (NOT a generic invoke). Each method has a
  // specific positional signature. The mock reconstructs an args object
  // matching the V2 invoke(cmd, args) shape so that mockState.callArgs /
  // invokeCalls / commandHandlers continue to work unchanged.
  //
  // Method → (cmd, arg-builder from positional args):
  const methodToCmd: Record<string, { cmd: string; build: (...a: unknown[]) => Record<string, unknown> }> = {
    getSettings: { cmd: "get_settings", build: () => ({}) },
    updateSettings: { cmd: "update_settings", build: (ns) => ({ newSettings: ns }) },
    clearAllHistory: { cmd: "clear_all_history", build: () => ({}) },
    listConversations: { cmd: "list_conversations", build: (ia) => ({ includeArchived: ia }) },
    getConversation: { cmd: "get_conversation", build: (id) => ({ id }) },
    createConversation: { cmd: "create_conversation", build: (a) => a as Record<string, unknown> },
    archiveConversation: { cmd: "archive_conversation", build: (id) => ({ id }) },
    deleteConversation: { cmd: "delete_conversation", build: (id) => ({ id }) },
    listMessages: { cmd: "list_messages", build: (cid) => ({ conversationId: cid }) },
    appendMessage: { cmd: "append_message", build: (a) => a as Record<string, unknown> },
    searchMessages: { cmd: "search_messages", build: (q, l) => ({ query: q, limit: l }) },
    listWorkspaces: { cmd: "list_workspaces", build: () => ({}) },
    addWorkspace: { cmd: "add_workspace", build: (l, rp) => ({ label: l, root_path: rp }) },
    renameWorkspace: { cmd: "rename_workspace", build: (id, l) => ({ id, label: l }) },
    deleteWorkspace: { cmd: "delete_workspace", build: (id) => ({ id }) },
    pickWorkspacePath: { cmd: "pick_workspace_path", build: () => ({}) },
    readFile: { cmd: "read_file", build: (wid, p) => ({ workspaceId: wid, path: p }) },
    writeFile: { cmd: "write_file", build: (wid, p, c) => ({ workspaceId: wid, path: p, content: c }) },
    editFile: { cmd: "edit_file", build: (wid, p, ot, nt, ra) => ({ workspaceId: wid, path: p, oldText: ot, newText: nt, replaceAll: ra }) },
    searchFiles: { cmd: "search_files", build: (wid, g, cp) => ({ workspaceId: wid, glob: g, contentPattern: cp }) },
    deleteFile: { cmd: "delete_file", build: (wid, p) => ({ workspaceId: wid, path: p }) },
  };

  const codeman: Record<string, unknown> = {};
  for (const [method, mapping] of Object.entries(methodToCmd)) {
    codeman[method] = (...args: unknown[]) => {
      const builtArgs = mapping.build(...args);
      return invoke(mapping.cmd, builtArgs);
    };
  }
  // Native shims (no IPC handler — return resolved Promise for tests).
  codeman.notify = () => Promise.resolve();
  codeman.openExternal = () => Promise.resolve();
  codeman.setLoginItem = () => Promise.resolve();
  codeman.getLogPath = () => Promise.resolve("/tmp/codeman.log");
  // Streaming — return unsubscribe fn.
  codeman.onStreamChunk = () => () => {};
  return codeman;
}

// Install window.codeman on the global (jsdom). Skip if window absent
// (e.g. running in pure Node). Use Object.defineProperty to make it
// writable so tests can swap the codeman object via `window.codeman = ...`.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "codeman", {
    value: buildCodemanMock(),
    writable: true,
    configurable: true,
  });
}
