import { contextBridge, ipcRenderer } from "electron";
import type {
  Settings,
  Provider,
  FileMatch,
  SkillManifest,
  McpServerInfo,
  McpTool,
  McpToolEntry,
} from "@codeman-frontend/shared/lib/types";
import type { SubAgentConfig } from "@codeman-frontend/shared/lib/sub-agent-schema";
import type {
  AutomationRule,
  AutomationId,
  AutomationExecution,
  LlmExecuteRequest,
  LlmResultPayload,
} from "../shared/lib/automation-types";
export type {
  AutomationExecution,
  LlmActionPayload,
  LlmExecuteRequest,
  LlmResultStatus,
  LlmResultPayload,
} from "../shared/lib/automation-types";

export interface StreamSubscription {
  readonly onStreamChunk: (handler: (evt: unknown) => void) => () => void;
}

export interface PiProvider {
  id: string;
  label: string;
  baseUrl: string;
  defaultModel: string;
  models: PiModel[];
}

export interface PiModel {
  id: string;
  label: string;
  contextWindow?: number;
  thinking: boolean;
}

export interface PiUserSettings {
  theme?: "light" | "dark" | "system";
  userLanguage?: "zh" | "en" | "auto";
  startAtLogin?: boolean;
  contextFiles?: string[];
  systemPrompt?: {
    default: string;
    userCanEdit: boolean;
  };
  window?: {
    rememberPosition: boolean;
    rememberSize: boolean;
    defaultSize: { width: number; height: number };
    minSize: { width: number; height: number };
  };
}

export interface PiRuntimeApi {
  readonly listProviders: () => Promise<PiProvider[]>;
  readonly setApiKey: (providerId: string, apiKey: string) => Promise<void>;
  readonly getSettings: () => Promise<PiUserSettings>;
  readonly setSetting: (key: string, value: unknown) => Promise<void>;
}

export interface CodemanApi {
  readonly getSettings: () => Promise<Settings>;
  readonly updateSettings: (args: { newSettings: unknown }) => Promise<Settings>;
  readonly clearAllHistory: () => Promise<void>;

  readonly deleteProvider: (args: { id: string }) => Promise<Provider[]>;

  readonly abortRequest: (args: { requestId: string }) => Promise<null>;

  readonly readFile: (args: { workspaceId: string; path: string }) => Promise<string>;
  readonly writeFile: (args: { workspaceId: string; path: string; content: string }) => Promise<void>;
  readonly editFile: (args: {
    workspaceId: string;
    path: string;
    oldText: string;
    newText: string;
    replaceAll: boolean;
  }) => Promise<void>;
  readonly searchFiles: (args: {
    workspaceId: string;
    glob: string;
    contentPattern: string | null;
  }) => Promise<FileMatch[]>;
  readonly deleteFile: (args: { workspaceId: string; path: string }) => Promise<void>;

  readonly notify: (args: { title: string; body: string }) => Promise<void>;
  readonly openExternal: (args: { url: string }) => Promise<void>;
  readonly setLoginItem: (args: { enabled: boolean }) => Promise<void>;
  readonly getLogPath: () => Promise<string | null>;

  readonly skillsScan: () => Promise<SkillManifest[]>;
  readonly skillsLoad: (args: { name: string }) => Promise<string>;

  readonly mcpListServers: () => Promise<McpServerInfo[]>;
  readonly mcpGetTools: (args: { serverName: string }) => Promise<McpTool[]>;
  readonly mcpGetAllTools: () => Promise<McpToolEntry[]>;
  readonly mcpEnable: (args: { serverName: string; enabled: boolean }) => Promise<void>;
  readonly mcpRestart: (args: { serverName: string }) => Promise<void>;
  readonly mcpCallTool: (args: { serverName: string; toolName: string; args: unknown }) => Promise<unknown>;
  readonly mcpOpenConfigDir: () => Promise<void>;

  readonly webfetch: (args: { url: string; timeout?: number }) => Promise<{
    status: number;
    contentType: string;
    body: ArrayBuffer;
  }>;

  readonly subAgentsList: () => Promise<readonly SubAgentConfig[]>;
  readonly subAgentsAdd: (config: SubAgentConfig) => Promise<SubAgentConfig>;
  readonly subAgentsUpdate: (args: { id: string; patch: Partial<SubAgentConfig> }) => Promise<SubAgentConfig>;
  readonly subAgentsDelete: (args: { id: string }) => Promise<void>;
  readonly subAgentsSetEnabled: (args: { id: string; enabled: boolean }) => Promise<SubAgentConfig>;

  readonly automationsList: () => Promise<readonly AutomationRule[]>;
  readonly automationsCreate: (rule: AutomationRule) => Promise<AutomationRule>;
  readonly automationsUpdate: (rule: AutomationRule) => Promise<AutomationRule>;
  readonly automationsDelete: (args: { id: AutomationId }) => Promise<void>;
  readonly automationsToggle: (args: { id: AutomationId; enabled: boolean }) => Promise<AutomationRule>;
  readonly automationsRunNow: (args: { id: AutomationId }) => Promise<void>;
  readonly automationsListExecutions: (args: {
    ruleId?: AutomationId;
    limit?: number;
    offset?: number;
  }) => Promise<readonly AutomationExecution[]>;
  readonly automationsGetExecution: (args: { id: string }) => Promise<AutomationExecution>;
  readonly automationsRunMissed: (args: { id: AutomationId }) => Promise<void>;

  readonly automationsExecuteLlm: (
    handler: (request: LlmExecuteRequest) => void | Promise<void>,
  ) => () => void;

  readonly automationsSendLlmResult: (payload: LlmResultPayload) => void;

  readonly piRuntime: PiRuntimeApi;
}

export type CodemanApiExposed = CodemanApi &
  StreamSubscription & {
    readonly invoke: (channel: string, args?: Record<string, unknown>) => Promise<unknown>;
  };

const codeman: CodemanApiExposed = {
  getSettings: () => ipcRenderer.invoke("getSettings"),
  updateSettings: (args) => ipcRenderer.invoke("updateSettings", args),
  clearAllHistory: () => ipcRenderer.invoke("clearAllHistory"),

  deleteProvider: (args) => ipcRenderer.invoke("deleteProvider", args),

  abortRequest: (args) => ipcRenderer.invoke("abortRequest", args),

  readFile: (args) => ipcRenderer.invoke("readFile", args),
  writeFile: (args) => ipcRenderer.invoke("writeFile", args),
  editFile: (args) => ipcRenderer.invoke("editFile", args),
  searchFiles: (args) => ipcRenderer.invoke("searchFiles", args),
  deleteFile: (args) => ipcRenderer.invoke("deleteFile", args),

  notify: (args) => ipcRenderer.invoke("notify", args),
  openExternal: (args) => ipcRenderer.invoke("openExternal", args),
  setLoginItem: (args) => ipcRenderer.invoke("setLoginItem", args),
  getLogPath: () => ipcRenderer.invoke("getLogPath"),

  skillsScan: () => ipcRenderer.invoke("skillsScan"),
  skillsLoad: (args) => ipcRenderer.invoke("skillsLoad", args),

  mcpListServers: () => ipcRenderer.invoke("mcp:list-servers"),
  mcpGetTools: (args) => ipcRenderer.invoke("mcp:get-tools", args),
  mcpGetAllTools: () => ipcRenderer.invoke("mcp:get-all-tools"),
  mcpEnable: (args) => ipcRenderer.invoke("mcp:enable", args),
  mcpRestart: (args) => ipcRenderer.invoke("mcp:restart", args),
  mcpCallTool: (args) => ipcRenderer.invoke("mcp:call-tool", args),
  mcpOpenConfigDir: () => ipcRenderer.invoke("mcp:open-config-dir"),

  webfetch: (args) => ipcRenderer.invoke("webfetch:fetch", args),

  subAgentsList: () => ipcRenderer.invoke("subAgents:list"),
  subAgentsAdd: (config) => ipcRenderer.invoke("subAgents:add", config),
  subAgentsUpdate: (args) => ipcRenderer.invoke("subAgents:update", args),
  subAgentsDelete: (args) => ipcRenderer.invoke("subAgents:delete", args),
  subAgentsSetEnabled: (args) => ipcRenderer.invoke("subAgents:setEnabled", args),

  // Automations
  automationsList: () => ipcRenderer.invoke("automations:list"),
  automationsCreate: (rule) => ipcRenderer.invoke("automations:create", rule),
  automationsUpdate: (rule) => ipcRenderer.invoke("automations:update", rule),
  automationsDelete: (args) => ipcRenderer.invoke("automations:delete", args),
  automationsToggle: (args) => ipcRenderer.invoke("automations:toggle", args),
  automationsRunNow: (args) => ipcRenderer.invoke("automations:run-now", args),
  automationsListExecutions: (args) => ipcRenderer.invoke("automations:list-executions", args),
  automationsGetExecution: (args) => ipcRenderer.invoke("automations:get-execution", args),
  automationsRunMissed: (args) => ipcRenderer.invoke("automations:run-missed", args),

  // Wraps handler in ipcRenderer's listener signature and returns an unsubscribe fn
  // for parity with `onStreamChunk` (cleanup pattern, idempotent re-subscribe safe).
  automationsExecuteLlm: (handler) => {
    const listener = (_e: unknown, request: LlmExecuteRequest) => {
      // Swallow handler rejections — main has its own timeout + pending map,
      // renderer errors are best-effort reported via sendLlmResult.
      void Promise.resolve(handler(request)).catch(() => {});
    };
    ipcRenderer.on("automations:execute-llm", listener);
    return () => {
      ipcRenderer.off("automations:execute-llm", listener);
    };
  },

  automationsSendLlmResult: (payload) => {
    ipcRenderer.send("automations:execute-llm-result", payload);
  },

  onStreamChunk: (handler) => {
    const listener = (_e: unknown, evt: unknown) => handler(evt);
    ipcRenderer.on("stream-chunk", listener);
    return () => {
      ipcRenderer.off("stream-chunk", listener);
    };
  },

  invoke: (channel, args) => ipcRenderer.invoke(channel, args ?? {}),

  piRuntime: {
    listProviders: () => ipcRenderer.invoke("pi:list-providers"),
    setApiKey: (providerId, apiKey) =>
      ipcRenderer.invoke("pi:set-api-key", { providerId, apiKey }),
    getSettings: () => ipcRenderer.invoke("pi:get-settings"),
    setSetting: (key, value) =>
      ipcRenderer.invoke("pi:set-setting", { key, value }),
  },
};

contextBridge.exposeInMainWorld("codeman", codeman);
