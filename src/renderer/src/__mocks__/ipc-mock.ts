
import { vi } from "vitest";


export interface ModelMeta {
  id: string;
  label: string;
  contextWindow?: number;
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
  apiKey: string;
  llm: ProviderLlm;
}

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
  llmProviders: Array<{
    id: string;
    label: string;
    enabled: boolean;
    defaultModel?: string;
    baseUrl?: string;
    apiType: "anthropic-messages";
    apiKeyRef: string;
  }>;
  workspaces?: Array<{
    id: string;
    label: string;
    rootPath: string;
    enabled: boolean;
  }>;
}

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


export const mockProvider = (
  overrides: Partial<Provider> & { id: string; label: string },
): Provider => {
  return {
    id: overrides.id ?? "minimax",
    label: overrides.label ?? "MiniMax",
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
  llmProviders: [],
};


export const mockState = {
  resolved: undefined as unknown,
  rejected: undefined as Error | undefined,
  calls: [] as string[],
  callArgs: [] as Array<{ name: string; args: Record<string, unknown> | undefined }>,
  invokeCalls: [] as { name: string; args?: Record<string, unknown> }[],
  settings: { ...defaultSettingsV15 } as SettingsV15,
  store: {} as Record<string, Record<string, string>>,
  v0FixtureActive: false,
  resolvedByCommand: {} as Record<string, unknown>,
  qaTable: [] as Array<{ question: string; answer: string; default?: boolean }>,
};


const DEFAULT_MINIMAX_PROVIDER: Provider = {
  id: "minimax",
  label: "MiniMax",
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
        thinking: false,
      },
    ],
    modelsEndpoint: "https://api.minimaxi.com/anthropic/v1/models",
  },
};

function migrateV0toV15(v0: SettingsV0): SettingsV15 {
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

  for (const llm of v0.llmProviders) {
    providers.push({
      id: llm.id,
      label: llm.label,
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
    llmProviders: [],
  };
}


type IPCCommand = string;
type IPCArgs = Record<string, unknown> | undefined;

const commandHandlers: Record<IPCCommand, (args?: IPCArgs) => unknown> = {
  getSettings(): unknown {
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
      mockState.settings = {
        ...mockState.settings,
        ...newSettings,
        schemaVersion: "1.5",
      };
    }
    return { ...mockState.settings };
  },

  clearAllHistory(): void {
  },

  deleteProvider(): unknown {
    return undefined;
  },

  fetchModels(args?: IPCArgs): unknown {
    const providerId = args?.providerId as string;
    const provider = mockState.settings.providers.find((p) => p.id === providerId);
    return provider?.llm.models ?? [];
  },

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

  listConversations(_args?: IPCArgs): unknown {
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

  listMessages(_args?: IPCArgs): unknown {
    return mockState.resolved ?? [];
  },

  appendMessage(args?: IPCArgs): unknown {
    return mockState.resolved ?? { id: "new-msg-id", conversationId: (args?.conversationId as string) ?? "", role: (args?.role as string) ?? "user", content: (args?.content as string) ?? "", toolCalls: null, toolResults: null, model: null, inputTokens: null, outputTokens: null, createdAt: Date.now() };
  },

  searchMessages(_args?: IPCArgs): unknown {
    return mockState.resolved ?? [];
  },

  pickWorkspacePath(): unknown {
    return mockState.resolved ?? null;
  },

  qaGetTable(_args?: IPCArgs): unknown {
    return mockState.qaTable ?? [];
  },

  skillsScan(_args?: IPCArgs): unknown {
    return mockState.resolved ?? [];
  },

  skillsLoad(_args?: IPCArgs): unknown {
    return mockState.resolved ?? "";
  },

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

  runCommand(_args?: IPCArgs): unknown {
    return mockState.resolved;
  },

  runCommandAssess(_args?: IPCArgs): unknown {
    return { risk: { kind: "low", reasons: [] }, requestID: undefined };
  },

  runCommandExecute(_args?: IPCArgs): unknown {
    return mockState.resolved;
  },

  runCommandReply(_args?: IPCArgs): unknown {
    return { ok: true };
  },
};


export const invoke: (name: string, args?: IPCArgs) => Promise<unknown> = vi.fn().mockImplementation((name: string, args?: IPCArgs) => {
  mockState.calls.push(name);
  mockState.callArgs.push({ name, args: args as Record<string, unknown> | undefined });
  mockState.invokeCalls.push({ name, args: args as Record<string, unknown> | undefined });

  if (mockState.rejected) {
    return Promise.reject(mockState.rejected);
  }

  if (mockState.resolvedByCommand[name] !== undefined && !mockState.v0FixtureActive) {
    return Promise.resolve(mockState.resolvedByCommand[name]);
  }

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


function buildCodemanMock(): Record<string, unknown> {
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
    runCommand: { cmd: "runCommand" },
    runCommandAssess: { cmd: "runCommandAssess" },
    runCommandExecute: { cmd: "runCommandExecute" },
    runCommandReply: { cmd: "runCommandReply" },
  };

  const codeman: Record<string, unknown> = {};
  for (const [method, mapping] of Object.entries(methodToCmd)) {
    codeman[method] = (args?: unknown) => invoke(mapping.cmd, args as Record<string, unknown> | undefined);
  }
  codeman.notify = () => Promise.resolve();
  codeman.openExternal = () => Promise.resolve();
  codeman.setLoginItem = () => Promise.resolve();
  codeman.getLogPath = () => Promise.resolve("/tmp/codeman.log");
  codeman.onStreamChunk = () => () => {};
  // ADR-0060 — bridge stubs so renderer tests can install `window.codeman`
  // and access the new bridge without throwing. Real subscription/result
  // capture is set up locally in automation-llm.test.ts.
  codeman.automationsExecuteLlm = () => () => {};
  codeman.automationsSendLlmResult = () => {};
  codeman.onPermissionAsked = () => () => {};
  codeman.onPermissionReplied = () => () => {};
  return codeman;
}

if (typeof window !== "undefined") {
  Object.defineProperty(window, "codeman", {
    value: buildCodemanMock(),
    writable: true,
    configurable: true,
  });
}
