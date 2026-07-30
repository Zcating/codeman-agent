// T3 — src/preload/index.ts: contextBridge IPC bridge.
//
// Exposes 33 ipcMain.handle channels + onStreamChunk subscription + a generic
// invoke escape hatch to the renderer as `window.codeman`. Every typed method
// takes a single typed args object (or no args) per V3 IPC contract; the
// renderer wraps this in `Effect.tryPromise` via src/renderer/src/shared/apis/
// invoke.api.ts. Renderer never imports 'electron' directly.
//
// TDD-exempt: contextBridge surface — tested via e2e in T7 (Playwright
// can inspect window.codeman).

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

// ─── StreamSubscription (extracted from CodemanApi per V3.2) ─────

/**
 * Streaming side-channel — extracted from CodemanApi because onStreamChunk
 * is a callback subscription (returns `() => void`, not a Promise). The
 * renderer's `streamChunks` Stream.async wrapper uses this directly.
 */
export interface StreamSubscription {
  readonly onStreamChunk: (handler: (evt: unknown) => void) => () => void;
}

// ─── CodemanApi (single-object args, concrete return types) ──────

/**
 * Shape of `window.codeman` IPC surface. Mirrors `src/main/ipc.ts` and
 * `src/main/mcp-ipc.ts` 1:1. All Promise-returning channels take a single
 * typed args object (or no args).
 */
export interface CodemanApi {
  // Settings
  readonly getSettings: () => Promise<Settings>;
  readonly updateSettings: (args: { newSettings: unknown }) => Promise<Settings>;
  readonly clearAllHistory: () => Promise<void>;

  // Conversations
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

  // Messages
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

  // Workspaces
  readonly listWorkspaces: () => Promise<Workspace[]>;
  readonly addWorkspace: (args: { label: string; rootPath: string }) => Promise<Workspace>;
  readonly renameWorkspace: (args: { id: string; label: string }) => Promise<void>;
  readonly deleteWorkspace: (args: { id: string }) => Promise<void>;
  readonly pickWorkspacePath: () => Promise<string | null>;

  // Provider CRUD (V3+ ADR-0023 D8-W)
  readonly deleteProvider: (args: { id: string }) => Promise<Provider[]>;

  // ADR-0024 D7: abort in-flight LLM request
  readonly abortRequest: (args: { requestId: string }) => Promise<null>;

  // Filesystem (V2 ADR-0013)
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

  // Native shims
  readonly notify: (args: { title: string; body: string }) => Promise<void>;
  readonly openExternal: (args: { url: string }) => Promise<void>;
  readonly setLoginItem: (args: { enabled: boolean }) => Promise<void>;
  readonly getLogPath: () => Promise<string | null>;

  // Skills plugin (ADR-0031)
  readonly skillsScan: () => Promise<SkillManifest[]>;
  readonly skillsLoad: (args: { name: string }) => Promise<string>;

  // MCP plugin (ADR-0032)
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

// ─── Combined exposed shape ──────────────────────────────────────

export type CodemanApiExposed = CodemanApi &
  StreamSubscription & {
    /**
     * Generic IPC escape hatch. Used by e2e helpers (cdp-driver
     * `invoke(page, channel, args)`). Renderer code should prefer the
     * typed methods above for compile-time safety.
     */
    readonly invoke: (channel: string, args?: Record<string, unknown>) => Promise<unknown>;
  };

// ─── Implementation ─────────────────────────────────────────────

const codeman: CodemanApiExposed = {
  // Settings
  getSettings: () => ipcRenderer.invoke("getSettings"),
  updateSettings: (args) => ipcRenderer.invoke("updateSettings", args),
  clearAllHistory: () => ipcRenderer.invoke("clearAllHistory"),

  // Conversations
  listConversations: (args) => ipcRenderer.invoke("listConversations", args),
  getConversation: (args) => ipcRenderer.invoke("getConversation", args),
  createConversation: (args) => ipcRenderer.invoke("createConversation", args),
  archiveConversation: (args) => ipcRenderer.invoke("archiveConversation", args),
  deleteConversation: (args) => ipcRenderer.invoke("deleteConversation", args),
  renameConversation: (args) => ipcRenderer.invoke("renameConversation", args),

  // Messages
  listMessages: (args) => ipcRenderer.invoke("listMessages", args),
  appendMessage: (args) => ipcRenderer.invoke("appendMessage", args),
  searchMessages: (args) => ipcRenderer.invoke("searchMessages", args),

  // Workspaces
  listWorkspaces: () => ipcRenderer.invoke("listWorkspaces"),
  addWorkspace: (args) => ipcRenderer.invoke("addWorkspace", args),
  renameWorkspace: (args) => ipcRenderer.invoke("renameWorkspace", args),
  deleteWorkspace: (args) => ipcRenderer.invoke("deleteWorkspace", args),
  pickWorkspacePath: () => ipcRenderer.invoke("pickWorkspacePath"),

  // Provider CRUD
  deleteProvider: (args) => ipcRenderer.invoke("deleteProvider", args),

  // Abort
  abortRequest: (args) => ipcRenderer.invoke("abortRequest", args),

  // Filesystem
  readFile: (args) => ipcRenderer.invoke("readFile", args),
  writeFile: (args) => ipcRenderer.invoke("writeFile", args),
  editFile: (args) => ipcRenderer.invoke("editFile", args),
  searchFiles: (args) => ipcRenderer.invoke("searchFiles", args),
  deleteFile: (args) => ipcRenderer.invoke("deleteFile", args),

  // Native shims
  notify: (args) => ipcRenderer.invoke("notify", args),
  openExternal: (args) => ipcRenderer.invoke("openExternal", args),
  setLoginItem: (args) => ipcRenderer.invoke("setLoginItem", args),
  getLogPath: () => ipcRenderer.invoke("getLogPath"),

  // Skills plugin (ADR-0031)
  skillsScan: () => ipcRenderer.invoke("skillsScan"),
  skillsLoad: (args) => ipcRenderer.invoke("skillsLoad", args),

  // MCP plugin (ADR-0032)
  mcpListServers: () => ipcRenderer.invoke("mcp:list-servers"),
  mcpGetTools: (args) => ipcRenderer.invoke("mcp:get-tools", args),
  mcpGetAllTools: () => ipcRenderer.invoke("mcp:get-all-tools"),
  mcpEnable: (args) => ipcRenderer.invoke("mcp:enable", args),
  mcpRestart: (args) => ipcRenderer.invoke("mcp:restart", args),
  mcpCallTool: (args) => ipcRenderer.invoke("mcp:call-tool", args),
  mcpOpenConfigDir: () => ipcRenderer.invoke("mcp:open-config-dir"),

  // Webfetch
  webfetch: (args) => ipcRenderer.invoke("webfetch:fetch", args),

  // Streaming: preload exposes a callback registration API; main calls
  // webContents.send('stream-chunk', evt). Renderer wraps onStreamChunk
  // in Stream.async (T5).
  onStreamChunk: (handler) => {
    const listener = (_e: unknown, evt: unknown) => handler(evt);
    ipcRenderer.on("stream-chunk", listener);
    return () => {
      ipcRenderer.off("stream-chunk", listener);
    };
  },

  // Generic escape hatch for e2e
  invoke: (channel, args) => ipcRenderer.invoke(channel, args ?? {}),
};

contextBridge.exposeInMainWorld("codeman", codeman);
