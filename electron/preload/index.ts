// T3 — electron/preload/index.ts: contextBridge IPC bridge.
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
  getSettings: () => ipcRenderer.invoke("get_settings"),
  updateSettings: (newSettings: unknown) =>
    ipcRenderer.invoke("update_settings", { newSettings }),
  clearAllHistory: () => ipcRenderer.invoke("clear_all_history"),

  // Conversations
  listConversations: (includeArchived: boolean) =>
    ipcRenderer.invoke("list_conversations", { includeArchived }),
  getConversation: (id: string) =>
    ipcRenderer.invoke("get_conversation", { id }),
  createConversation: (args: {
    title: string;
    workspaceId: string;
    systemPrompt: string | null;
  }) => ipcRenderer.invoke("create_conversation", args),
  archiveConversation: (id: string) =>
    ipcRenderer.invoke("archive_conversation", { id }),
  deleteConversation: (id: string) =>
    ipcRenderer.invoke("delete_conversation", { id }),

  // Messages
  listMessages: (conversationId: string) =>
    ipcRenderer.invoke("list_messages", { conversationId }),
  appendMessage: (args: {
    conversationId: string;
    role: string;
    content: string;
    toolCalls?: string;
    toolResults?: string;
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
  }) => ipcRenderer.invoke("append_message", args),
  searchMessages: (query: string, limit: number) =>
    ipcRenderer.invoke("search_messages", { query, limit }),

  // Workspaces
  listWorkspaces: () => ipcRenderer.invoke("list_workspaces"),
  addWorkspace: (label: string, rootPath: string) =>
    ipcRenderer.invoke("add_workspace", { label, root_path: rootPath }),
  renameWorkspace: (id: string, label: string) =>
    ipcRenderer.invoke("rename_workspace", { id, label }),
  deleteWorkspace: (id: string) =>
    ipcRenderer.invoke("delete_workspace", { id }),
  pickWorkspacePath: () => ipcRenderer.invoke("pick_workspace_path"),

  // Provider CRUD (V3+ ADR-0023 D8-W). NOTE: Electron main process does NOT
  // currently register a "delete_provider" handler — the IPC will surface a
  // "no handler registered" error from main. Local appStore.deleteProvider()
  // already mutates client state; backend sync is a follow-up task.
  deleteProvider: (id: string) => ipcRenderer.invoke("delete_provider", { id }),

  // Filesystem
  readFile: (workspaceId: string, path: string) =>
    ipcRenderer.invoke("read_file", { workspaceId, path }),
  writeFile: (workspaceId: string, path: string, content: string) =>
    ipcRenderer.invoke("write_file", { workspaceId, path, content }),
  editFile: (
    workspaceId: string,
    path: string,
    oldText: string,
    newText: string,
    replaceAll: boolean,
  ) =>
    ipcRenderer.invoke("edit_file", {
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
    ipcRenderer.invoke("search_files", {
      workspaceId,
      glob,
      contentPattern,
    }),
  deleteFile: (workspaceId: string, path: string) =>
    ipcRenderer.invoke("delete_file", { workspaceId, path }),

  // Native shims
  notify: (title: string, body: string) =>
    ipcRenderer.invoke("notify", { title, body }),
  openExternal: (url: string) => ipcRenderer.invoke("open_external", { url }),
  setLoginItem: (enabled: boolean) =>
    ipcRenderer.invoke("set_login_item", { enabled }),
  getLogPath: () => ipcRenderer.invoke("get_log_path"),

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

