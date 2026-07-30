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
  contextWindow?: number;
  deprecated?: boolean;
  thinking?: boolean;
}

export interface ProviderLlm {
  defaultModel: string;
  baseUrl: string;
  apiType: "anthropic-messages";
  contextWindow?: number;
  models: ModelMeta[];
  modelsEndpoint: string;
}

export interface Provider {
  id: string;
  label: string;
  enabled: boolean;
  apiKey: string;
  llm: ProviderLlm;
}

// V1.5+ Settings shape
export interface SettingsV15 {
  providers: Provider[];
  schemaVersion: "1.5";
  defaultLlmProviderId?: string;
  userLanguage: "zh" | "en" | "auto";
  theme: "light" | "dark" | "system";
  startAtLogin: boolean;
  window: {
    rememberPosition: boolean;
    rememberSize: boolean;
    defaultSize: { width: number; height: number };
    minSize: { width: number; height: number };
  };
  systemPrompt: { default: string; userCanEdit: boolean };
  conversations: { autoArchiveAfterDays: number; maxHistory: number };
  // V0 legacy field (cleared after migration, mirrors Rust behavior)
  llmProviders: Array<{
    id: string;
    label: string;
    enabled: boolean;
    defaultModel?: string;
    baseUrl?: string;
    apiType: "anthropic-messages";
    apiKeyRef: string;
  }>;
  // V2: workspaces (added in ADR-0013)
  workspaces?: Array<{
    id: string;
    label: string;
    rootPath: string;
    enabled: boolean;
  }>;
}

// V0 Settings shape (for migration testing)
export interface SettingsV0 {
  schemaVersion?: string;
  llmProviders: Array<{
    id: string;
    label: string;
    enabled: boolean;
    defaultModel?: string;
    baseUrl?: string;
    apiType: "anthropic-messages";
    apiKeyRef: string;
  }>;
  defaultLlmProviderId?: string;
  userLanguage: "zh" | "en" | "auto";
  theme: "light" | "dark" | "system";
  startAtLogin: boolean;
  window: {
    rememberPosition: boolean;
    rememberSize: boolean;
    defaultSize: { width: number; height: number };
    minSize: { width: number; height: number };
  };
  systemPrompt: { default: string; userCanEdit: boolean };
  conversations: { autoArchiveAfterDays: number; maxHistory: number };
}

// ─── Mock Factory ───────────────────────────────────────────────

export const mockProvider = (
  overrides: Partial<Provider> & { id: string; label: string },
): Provider => {
  return {
    id: overrides.id ?? "minimax",
    label: overrides.label ?? "MiniMax",
    enabled: overrides.enabled ?? true,
    apiKey: overrides.apiKey ?? "",
    llm: overrides.llm ?? {
      defaultModel: "MiniMax-M2.5-highspeed",
      baseUrl: "https://api.minimaxi.com/anthropic",
      apiType: "anthropic-messages",
      models: [
        {
          id: "MiniMax-M2.5-highspeed",
          label: "MiniMax-M2.5-highspeed",
          contextWindow: 200000,
          deprecated: false,
          thinking: false,
        },
      ],
      modelsEndpoint: "https://api.minimaxi.com/anthropic/v1/models",
    },
  };
};

export const mockMinimaxProvider: Provider = mockProvider({
  id: "minimax",
  label: "MiniMax",
  apiKey: "",
});

export const mockDeepseekProvider: Provider = mockProvider({
  id: "deepseek",
  label: "DeepSeek",
  apiKey: "",
  llm: {
    defaultModel: "deepseek-chat",
    baseUrl: "https://api.deepseek.com/anthropic",
    apiType: "anthropic-messages",
    contextWindow: 200_000,
    models: [
      {
        id: "deepseek-chat",
        label: "deepseek-chat",
        contextWindow: 64000,
        deprecated: false,
        thinking: false,
      },
    ],
    modelsEndpoint: "https://api.deepseek.com/models",
  },
});

const defaultSettingsV15: SettingsV15 = {
  providers: [mockMinimaxProvider],
  schemaVersion: "1.5",
  defaultLlmProviderId: "minimax",
  userLanguage: "en",
  theme: "system",
  startAtLogin: false,
  window: {
    rememberPosition: false,
    rememberSize: false,
    defaultSize: { width: 800, height: 600 },
    minSize: { width: 400, height: 300 },
  },
  systemPrompt: { default: "You are a helpful assistant.", userCanEdit: true },
  conversations: { autoArchiveAfterDays: 30, maxHistory: 1000 },
  // V0 legacy field (empty for V1.5 default)
  llmProviders: [],
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
  // QA table for file-tools feature
  qaTable: [] as Array<{ question: string; answer: string; default?: boolean }>,
};

// ─── V0 → V1.5 Migration ───────────────────────────────────────

// Default MiniMax provider for V0.5 fresh install
const DEFAULT_MINIMAX_PROVIDER: Provider = {
  id: "minimax",
  label: "MiniMax",
  enabled: true,
  apiKey: "",
  llm: {
    defaultModel: "MiniMax-M2.5-highspeed",
    baseUrl: "https://api.minimaxi.com/anthropic",
    apiType: "anthropic-messages",
    contextWindow: 200_000,
    models: [
      {
        id: "MiniMax-M2.5-highspeed",
        label: "MiniMax-M2.5-highspeed",
        contextWindow: 200_000,
        deprecated: false,
        thinking: false,
      },
    ],
    modelsEndpoint: "https://api.minimaxi.com/anthropic/v1/models",
  },
};

function migrateV0toV15(v0: SettingsV0): SettingsV15 {
  // V0.5 detection: empty llm_providers → fresh install, pre-fill MiniMax
  if (v0.llmProviders.length === 0) {
    return {
      providers: [DEFAULT_MINIMAX_PROVIDER],
      schemaVersion: "1.5",
      defaultLlmProviderId: "minimax",
      userLanguage: v0.userLanguage,
      theme: v0.theme,
      startAtLogin: v0.startAtLogin,
      window: v0.window,
      systemPrompt: v0.systemPrompt,
      conversations: v0.conversations,
      llmProviders: [],
    };
  }

  const providers: Provider[] = [];

  // Migrate each LLM provider
  for (const llm of v0.llmProviders) {
    providers.push({
      id: llm.id,
      label: llm.label,
      enabled: llm.enabled,
      apiKey: llm.apiKeyRef,
      llm: {
        defaultModel: llm.defaultModel ?? "auto",
        baseUrl: llm.baseUrl ?? "",
        apiType: "anthropic-messages",
        models: [],
        modelsEndpoint: "",
      },
    });
  }

  return {
    providers,
    schemaVersion: "1.5",
    defaultLlmProviderId: v0.defaultLlmProviderId,
    userLanguage: v0.userLanguage,
    theme: v0.theme,
    startAtLogin: v0.startAtLogin,
    window: v0.window,
    systemPrompt: v0.systemPrompt,
    conversations: v0.conversations,
    // V0 legacy field cleared after migration (mirrors Rust behavior)
    llmProviders: [],
  };
}

// ─── IPC Command Handlers ───────────────────────────────────────

type IPCCommand = string;
type IPCArgs = Record<string, unknown> | undefined;

const commandHandlers: Record<IPCCommand, (args?: IPCArgs) => unknown> = {
  getSettings(): unknown {
    // If V0 fixture is active, migrate on read
    if (mockState.v0FixtureActive) {
      const v0Settings = mockState.resolved as SettingsV0 | undefined;
      if (v0Settings && !v0Settings.schemaVersion) {
        mockState.settings = migrateV0toV15(v0Settings);
      }
    }
    return { ...mockState.settings };
  },

  updateSettings(args?: IPCArgs): unknown {
    const newSettings = args?.newSettings as Partial<SettingsV15> | undefined;
    if (newSettings) {
      // Merge with existing settings
      mockState.settings = {
        ...mockState.settings,
        ...newSettings,
        // Always preserve schemaVersion
        schemaVersion: "1.5",
      };
    }
    return { ...mockState.settings };
  },

  clearAllHistory(): void {
    // No-op in mock
  },

  deleteProvider(): unknown {
    // No-op in mock (backend may not implement this yet)
    return undefined;
  },

  fetchModels(args?: IPCArgs): unknown {
    // Returns current models from settings for the given provider
    const providerId = args?.providerId as string;
    const provider = mockState.settings.providers.find((p) => p.id === providerId);
    return provider?.llm.models ?? [];
  },

  // ─── V2 File IO (ADR-0013) ───────────────────────────────────
  // Mock handlers for file_tools service; tests set mockState.resolved
  // to control return value, or mockState.rejected to simulate errors.
  readFile(): unknown {
    return mockState.resolved;
  },

  writeFile(): unknown {
    return mockState.resolved;
  },

  editFile(): unknown {
    return mockState.resolved;
  },

  searchFiles(): unknown {
    return mockState.resolved;
  },

  deleteFile(): unknown {
    return mockState.resolved;
  },

  // ─── Conversation IPC (ADR-0013) ─────────────────────────────────
  listConversations(_args?: IPCArgs): unknown {
    // Return empty array by default; tests can override via mockState.resolved
    return mockState.resolved ?? [];
  },

  getConversation(args?: IPCArgs): unknown {
    return mockState.resolved ?? { id: (args?.id as string) ?? "", title: "", systemPrompt: null, workspaceId: "", createdAt: 0, updatedAt: 0, archivedAt: null };
  },

  createConversation(args?: IPCArgs): unknown {
    return mockState.resolved ?? {
      id: "new-conv-id",
      title: (args?.title as string) ?? "",
      systemPrompt: (args?.systemPrompt as string | null) ?? null,
      workspaceId: (args?.workspaceId as string) ?? "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      archivedAt: null,
    };
  },

  archiveConversation(): unknown {
    return mockState.resolved ?? undefined;
  },

  deleteConversation(): unknown {
    return mockState.resolved ?? undefined;
  },

  renameConversation(): unknown {
    return mockState.resolved ?? undefined;
  },

  // ─── Message IPC (ADR-0013) ─────────────────────────────────────
  listMessages(_args?: IPCArgs): unknown {
    return mockState.resolved ?? [];
  },

  appendMessage(args?: IPCArgs): unknown {
    return mockState.resolved ?? { id: "new-msg-id", conversationId: (args?.conversationId as string) ?? "", role: (args?.role as string) ?? "user", content: (args?.content as string) ?? "", toolCalls: null, toolResults: null, model: null, inputTokens: null, outputTokens: null, createdAt: Date.now() };
  },

  searchMessages(_args?: IPCArgs): unknown {
    return mockState.resolved ?? [];
  },

  // ─── Workspace IPC ──────────────────────────────────────────────
  pickWorkspacePath(): unknown {
    return mockState.resolved ?? null;
  },

  // ─── QA Table IPC ───────────────────────────────────────────────
  qaGetTable(_args?: IPCArgs): unknown {
    return mockState.qaTable ?? [];
  },

  // ─── Skills plugin IPC (ADR-0031) ──────────────────────────────────
  skillsScan(_args?: IPCArgs): unknown {
    return mockState.resolved ?? [];
  },

  skillsLoad(_args?: IPCArgs): unknown {
    return mockState.resolved ?? "";
  },

  // ─── MCP plugin IPC (ADR-0032) ─────────────────────────────────────
  "mcp:list-servers"(_args?: IPCArgs): unknown {
    return mockState.resolved ?? [];
  },

  "mcp:get-all-tools"(_args?: IPCArgs): unknown {
    return mockState.resolved ?? [];
  },

  "mcp:get-tools"(_args?: IPCArgs): unknown {
    return mockState.resolved ?? [];
  },

  "mcp:enable"(_args?: IPCArgs): unknown {
    return undefined;
  },

  "mcp:restart"(_args?: IPCArgs): unknown {
    return undefined;
  },

  "mcp:call-tool"(_args?: IPCArgs): unknown {
    return { content: [{ type: "text", text: "mock tool result" }], isError: false };
  },

  "mcp:open-config-dir"(_args?: IPCArgs): unknown {
    return undefined;
  },
};

// ─── Invoke Mock ────────────────────────────────────────────────

export const invoke: (name: string, args?: IPCArgs) => Promise<unknown> = vi.fn().mockImplementation((name: string, args?: IPCArgs) => {
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
export default { invoke } as { invoke: (name: string, args?: IPCArgs) => Promise<unknown> };

// ─── V3: window.codeman Mock ───────────────────────────────────
//
// ipc.ts dispatches via `window.codeman.<method>` (set by src/preload).
// This mock mirrors every command in `commandHandlers` as a method on
// `window.codeman`, so V3 ipc.ts finds the mock at runtime in jsdom tests.

function buildCodemanMock(): Record<string, unknown> {
  // V3.2 IPC contract: every method on window.codeman takes a single
  // args object (or no args). The mock just passes that object through
  // to the V2 `invoke` recorder, so `mockState.callArgs` /
  // `mockState.invokeCalls` / `commandHandlers` continue to work
  // unchanged. No positional-args reconstruction needed.
  const methodToCmd: Record<string, { cmd: string }> = {
    getSettings: { cmd: "getSettings" },
    updateSettings: { cmd: "updateSettings" },
    clearAllHistory: { cmd: "clearAllHistory" },
    listConversations: { cmd: "listConversations" },
    getConversation: { cmd: "getConversation" },
    createConversation: { cmd: "createConversation" },
    archiveConversation: { cmd: "archiveConversation" },
    deleteConversation: { cmd: "deleteConversation" },
    renameConversation: { cmd: "renameConversation" },
    listMessages: { cmd: "listMessages" },
    appendMessage: { cmd: "appendMessage" },
    searchMessages: { cmd: "searchMessages" },
    listWorkspaces: { cmd: "listWorkspaces" },
    addWorkspace: { cmd: "addWorkspace" },
    renameWorkspace: { cmd: "renameWorkspace" },
    deleteWorkspace: { cmd: "deleteWorkspace" },
    pickWorkspacePath: { cmd: "pickWorkspacePath" },
    deleteProvider: { cmd: "deleteProvider" },
    abortRequest: { cmd: "abortRequest" },
    readFile: { cmd: "readFile" },
    writeFile: { cmd: "writeFile" },
    editFile: { cmd: "editFile" },
    searchFiles: { cmd: "searchFiles" },
    deleteFile: { cmd: "deleteFile" },
    skillsScan: { cmd: "skillsScan" },
    skillsLoad: { cmd: "skillsLoad" },
    mcpListServers: { cmd: "mcp:list-servers" },
    mcpGetTools: { cmd: "mcp:get-tools" },
    mcpGetAllTools: { cmd: "mcp:get-all-tools" },
    mcpEnable: { cmd: "mcp:enable" },
    mcpRestart: { cmd: "mcp:restart" },
    mcpCallTool: { cmd: "mcp:call-tool" },
    mcpOpenConfigDir: { cmd: "mcp:open-config-dir" },
    webfetch: { cmd: "webfetch:fetch" },
  };

  const codeman: Record<string, unknown> = {};
  for (const [method, mapping] of Object.entries(methodToCmd)) {
    codeman[method] = (args?: unknown) => invoke(mapping.cmd, args as Record<string, unknown> | undefined);
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
