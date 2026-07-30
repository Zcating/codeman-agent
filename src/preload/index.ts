import { contextBridge, ipcRenderer } from "electron";
import type {
  Settings,
  Conversation,
  Message,
  Provider,
  Workspace,
  FileMatch,
  SkillManifest,
  McpServerInfo,
  McpTool,
  McpToolEntry,
} from "@codeman-frontend/shared/lib/types";

export interface StreamSubscription {
  readonly onStreamChunk: (handler: (evt: unknown) => void) => () => void;
}

export interface CodemanApi {
  readonly getSettings: () => Promise<Settings>;
  readonly updateSettings: (args: { newSettings: unknown }) => Promise<Settings>;
  readonly clearAllHistory: () => Promise<void>;

  readonly listConversations: (args: { includeArchived: boolean }) => Promise<Conversation[]>;
  readonly getConversation: (args: { id: string }) => Promise<Conversation>;
  readonly createConversation: (args: {
    title: string;
    workspaceId: string;
    systemPrompt: string | null;
  }) => Promise<Conversation>;
  readonly archiveConversation: (args: { id: string }) => Promise<void>;
  readonly deleteConversation: (args: { id: string }) => Promise<void>;
  readonly renameConversation: (args: { id: string; title: string }) => Promise<void>;

  readonly listMessages: (args: { conversationId: string }) => Promise<Message[]>;
  readonly appendMessage: (args: {
    conversationId: string;
    role: string;
    content: string;
    thinking?: string | null;
    toolCalls?: string;
    toolResults?: string;
    model?: string | null;
    inputTokens?: number;
    outputTokens?: number;
  }) => Promise<Message>;
  readonly searchMessages: (args: { query: string; limit: number }) => Promise<Message[]>;

  readonly listWorkspaces: () => Promise<Workspace[]>;
  readonly addWorkspace: (args: { label: string; rootPath: string }) => Promise<Workspace>;
  readonly renameWorkspace: (args: { id: string; label: string }) => Promise<void>;
  readonly deleteWorkspace: (args: { id: string }) => Promise<void>;
  readonly pickWorkspacePath: () => Promise<string | null>;

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

  // Webfetch (SSRF-guarded HTTP fetch)
  readonly webfetch: (args: { url: string; timeout?: number }) => Promise<{
    status: number;
    contentType: string;
    body: ArrayBuffer;
  }>;
}

export type CodemanApiExposed = CodemanApi &
  StreamSubscription & {
    readonly invoke: (channel: string, args?: Record<string, unknown>) => Promise<unknown>;
  };

const codeman: CodemanApiExposed = {
  getSettings: () => ipcRenderer.invoke("getSettings"),
  updateSettings: (args) => ipcRenderer.invoke("updateSettings", args),
  clearAllHistory: () => ipcRenderer.invoke("clearAllHistory"),

  listConversations: (args) => ipcRenderer.invoke("listConversations", args),
  getConversation: (args) => ipcRenderer.invoke("getConversation", args),
  createConversation: (args) => ipcRenderer.invoke("createConversation", args),
  archiveConversation: (args) => ipcRenderer.invoke("archiveConversation", args),
  deleteConversation: (args) => ipcRenderer.invoke("deleteConversation", args),
  renameConversation: (args) => ipcRenderer.invoke("renameConversation", args),

  listMessages: (args) => ipcRenderer.invoke("listMessages", args),
  appendMessage: (args) => ipcRenderer.invoke("appendMessage", args),
  searchMessages: (args) => ipcRenderer.invoke("searchMessages", args),

  listWorkspaces: () => ipcRenderer.invoke("listWorkspaces"),
  addWorkspace: (args) => ipcRenderer.invoke("addWorkspace", args),
  renameWorkspace: (args) => ipcRenderer.invoke("renameWorkspace", args),
  deleteWorkspace: (args) => ipcRenderer.invoke("deleteWorkspace", args),
  pickWorkspacePath: () => ipcRenderer.invoke("pickWorkspacePath"),

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

  onStreamChunk: (handler) => {
    const listener = (_e: unknown, evt: unknown) => handler(evt);
    ipcRenderer.on("stream-chunk", listener);
    return () => {
      ipcRenderer.off("stream-chunk", listener);
    };
  },

  invoke: (channel, args) => ipcRenderer.invoke(channel, args ?? {}),
};

contextBridge.exposeInMainWorld("codeman", codeman);
