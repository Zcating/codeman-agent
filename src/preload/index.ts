// T3 — src/preload/index.ts: contextBridge IPC bridge.
//
// Exposes the 24 ipcMain.handle channels + onStreamChunk subscription to
// the renderer as `window.codeman`. Renderer never imports 'electron' directly;
// all cross-process calls go through this typed surface.
//
// TDD-exempt: contextBridge surface — tested via e2e in T7 (Playwright
// can inspect window.codeman).

import { contextBridge, ipcRenderer } from "electron";

const codeman = {
  // Settings
  getSettings: () => ipcRenderer.invoke("getSettings"),
  updateSettings: (newSettings: unknown) =>
    ipcRenderer.invoke("updateSettings", { newSettings }),
  clearAllHistory: () => ipcRenderer.invoke("clearAllHistory"),

  // Conversations
  listConversations: (includeArchived: boolean) =>
    ipcRenderer.invoke("listConversations", { includeArchived }),
  getConversation: (id: string) =>
    ipcRenderer.invoke("getConversation", { id }),
  createConversation: (args: {
    title: string;
    workspaceId: string;
    systemPrompt: string | null;
  }) => ipcRenderer.invoke("createConversation", args),
  archiveConversation: (id: string) =>
    ipcRenderer.invoke("archiveConversation", { id }),
  deleteConversation: (id: string) =>
    ipcRenderer.invoke("deleteConversation", { id }),

  // Messages
  listMessages: (conversationId: string) =>
    ipcRenderer.invoke("listMessages", { conversationId }),
  appendMessage: (args: {
    conversationId: string;
    role: string;
    content: string;
    toolCalls?: string;
    toolResults?: string;
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
  }) => ipcRenderer.invoke("appendMessage", args),
  searchMessages: (query: string, limit: number) =>
    ipcRenderer.invoke("searchMessages", { query, limit }),

  // Workspaces
  listWorkspaces: () => ipcRenderer.invoke("listWorkspaces"),
  addWorkspace: (label: string, rootPath: string) =>
    ipcRenderer.invoke("addWorkspace", { label, rootPath }),
  renameWorkspace: (id: string, label: string) =>
    ipcRenderer.invoke("renameWorkspace", { id, label }),
  deleteWorkspace: (id: string) =>
    ipcRenderer.invoke("deleteWorkspace", { id }),
  pickWorkspacePath: () => ipcRenderer.invoke("pickWorkspacePath"),

  // Provider CRUD (V3+ ADR-0023 D8-W). ADR-0026 D1 mandates this channel;
  // main handler at src/main/ipc.ts (deleteProvider handler).
  deleteProvider: (id: string) => ipcRenderer.invoke("deleteProvider", { id }),

  // ADR-0024 D7: abort in-flight LLM request by requestId
  abortRequest: (requestId: string) =>
    ipcRenderer.invoke("abortRequest", { requestId }),

  // Filesystem
  readFile: (workspaceId: string, path: string) =>
    ipcRenderer.invoke("readFile", { workspaceId, path }),
  writeFile: (workspaceId: string, path: string, content: string) =>
    ipcRenderer.invoke("writeFile", { workspaceId, path, content }),
  editFile: (
    workspaceId: string,
    path: string,
    oldText: string,
    newText: string,
    replaceAll: boolean,
  ) =>
    ipcRenderer.invoke("editFile", {
      workspaceId,
      path,
      oldText,
      newText,
      replaceAll,
    }),
  searchFiles: (
    workspaceId: string,
    glob: string,
    contentPattern: string | null,
  ) =>
    ipcRenderer.invoke("searchFiles", {
      workspaceId,
      glob,
      contentPattern,
    }),
  deleteFile: (workspaceId: string, path: string) =>
    ipcRenderer.invoke("deleteFile", { workspaceId, path }),

  // Native shims
notify: (title: string, body: string) =>
    ipcRenderer.invoke("notify", { title, body }),
  openExternal: (url: string) => ipcRenderer.invoke("openExternal", { url }),
  setLoginItem: (enabled: boolean) => ipcRenderer.invoke("setLoginItem", { enabled }),
  getLogPath: () => ipcRenderer.invoke("getLogPath"),

  // Skills plugin (ADR-0031)
  skillsScan: () => ipcRenderer.invoke("skillsScan"),
  skillsLoad: (name: string) => ipcRenderer.invoke("skillsLoad", { name }),

  // MCP plugin (ADR-0032)
  mcpListServers: () => ipcRenderer.invoke("mcp:list-servers"),
  mcpGetTools: (args: { serverName: string }) => ipcRenderer.invoke("mcp:get-tools", args),
  mcpGetAllTools: () => ipcRenderer.invoke("mcp:get-all-tools"),
  mcpEnable: (args: { serverName: string; enabled: boolean }) =>
    ipcRenderer.invoke("mcp:enable", args),
  mcpRestart: (args: { serverName: string }) =>
    ipcRenderer.invoke("mcp:restart", args),
  mcpCallTool: (args: { serverName: string; toolName: string; args: unknown }) =>
    ipcRenderer.invoke("mcp:call-tool", args),
  mcpOpenConfigDir: () => ipcRenderer.invoke("mcp:open-config-dir"),

  // Streaming: preload exposes a callback registration API; main calls
  // webContents.send('stream-chunk', evt). Renderer wraps onStreamChunk
  // in Stream.async (T5).
  onStreamChunk: (handler: (evt: unknown) => void): (() => void) => {
    const listener = (_e: unknown, evt: unknown) => handler(evt);
    ipcRenderer.on("stream-chunk", listener);
    return () => {
      ipcRenderer.off("stream-chunk", listener);
    };
  },

  /**
   * Generic IPC bridge — channels specs pass V2-style camelCase args to
   * V3 main handlers. Mirrors V2 Tauri `__TAURI_INTERNALS__.invoke`.
   * Used by e2e helpers (cdp-driver `invoke(page, channel, args)`).
   * Renderer code should prefer the typed methods above for compile-time
   * safety; this is the generic escape hatch for arbitrary channels.
   */
  invoke: (channel: string, args?: Record<string, unknown>) =>
    ipcRenderer.invoke(channel, args ?? {}),
};

contextBridge.exposeInMainWorld("codeman", codeman);

export type CodemanApi = typeof codeman;

