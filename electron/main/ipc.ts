// T4 — electron/main/ipc.ts: 24 ipcMain.handle channels wired to settings/db/files.
//
// T3 was stubs; T4 wires real handlers backed by:
//   - settings-schema.ts (sanitize + V0→V1.5 migration)
//   - db/mod.ts (better-sqlite3 + 3 SQL migrations already applied)
//   - file-sandbox.ts (validatePathInWorkspace / validatePathForWrite / read/write)

import { app, BrowserWindow, dialog, Notification, shell, ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import { readFile, unlink, readdir, stat } from "node:fs/promises";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { initDatabase, getDatabase } from "./db/mod";
// QA 路由由 electron/main/mock-server.ts 负责(POST /mock/anthropic/v1/messages
// 经 qa-loader.ts 读 Q→A 文件);不再走 IPC。
import { sanitize, type Settings, type Provider } from "./settings-schema";
import {
  validatePathInWorkspace,
  readFileInWorkspace,
  writeFileInWorkspace,
} from "./file-sandbox";

// ─── Settings store (JSON file under app.getPath("userData")) ─────────

let settingsCache: Settings | null = null;

// ADR-0024 D7: Map<requestId, AbortController> for aborting in-flight LLM requests
const abortControllers = new Map<string, AbortController>();

function settingsPath(): string {
  // app.setPath('userData') is called BEFORE registerIpcHandlers in main/index.ts.
  return join(app.getPath("userData"), "settings.json");
}

function loadSettings(): Settings {
  if (settingsCache) {return settingsCache;}
  const path = settingsPath();
  let raw: unknown = {};
  if (existsSync(path)) {
    try {
      raw = JSON.parse(readFileSync(path, "utf-8"));
    } catch {
      raw = {};
    }
  }
  // Load (or initialize) V1.5 camelCase settings from disk.
  // Schema.decodeUnknownEither inside sanitize() validates; malformed JSON → DEFAULT_SETTINGS.
  settingsCache = sanitize(raw as Partial<Settings>);
  saveSettings();
  return settingsCache;
}

function saveSettings(): void {
  if (!settingsCache) {return;}
  writeFileSync(settingsPath(), JSON.stringify(settingsCache, null, 2), "utf-8");
}

function updateSettings(patch: Partial<Settings>): Settings {
  loadSettings();
  settingsCache = sanitize({ ...settingsCache!, ...patch });
  saveSettings();
  return settingsCache!;
}

// ─── DB init flag ─────────────────────────────────────────────────────

let dbReady = false;
function dbInit(): void {
  if (!dbReady) {
    initDatabase();
    dbReady = true;
  }
}

// ─── Row types + mappers ────────────────────────────────────────────

interface RawConvRow {
  id: string;
  title: string;
  system_prompt: string | null;
  created_at: number;
  updated_at: number;
  archived_at: number | null;
  workspace_id: string;
}
interface RawMsgRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  thinking: string | null;
  tool_calls: string | null;
  tool_results: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: number;
}
interface RawWorkspace {
  id: string;
  label: string;
  root_path: string;
  created_at: number;
}

function toConversation(row: RawConvRow) {
  return {
    id: row.id,
    title: row.title,
    systemPrompt: row.system_prompt ?? null,
    workspaceId: row.workspace_id ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at ?? null,
  };
}
function toMessage(row: RawMsgRow) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    thinking: row.thinking ?? null,
    toolCalls: row.tool_calls ? JSON.parse(row.tool_calls) : null,
    toolResults: row.tool_results ? JSON.parse(row.tool_results) : null,
    model: row.model,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    createdAt: row.created_at,
  };
}
function toWorkspace(row: RawWorkspace) {
  return {
    id: row.id,
    label: row.label,
    rootPath: row.root_path,
    createdAt: row.created_at,
  };
}

function getConv(includeArchived: boolean) {
  dbInit();
  const sql = includeArchived
    ? "SELECT * FROM conversations"
    : "SELECT * FROM conversations WHERE archived_at IS NULL";
  return (getDatabase().prepare(sql).all() as RawConvRow[]).map(toConversation);
}

async function getWorkspaceById(id: string): Promise<RawWorkspace> {
  dbInit();
  const row = getDatabase().prepare("SELECT * FROM workspaces WHERE id = ?").get(id) as RawWorkspace | undefined;
  if (!row) {
    throw new Error(`Workspace not found: ${id}`);
  }
  return row;
}

// ─── File search ────────────────────────────────────────────────────

async function searchFilesInWorkspace(
  root: string,
  glob: string,
  contentPattern: string | null,
): Promise<Array<{ path: string; line: number; text: string }>> {
  const results: Array<{ path: string; line: number; text: string }> = [];
  await walkDir(root, async (relPath) => {
    const norm = relPath.replace(/\\/g, "/");
    if (!matchGlob(norm, glob)) {return;}
    if (contentPattern === null) {
      results.push({ path: norm, line: 0, text: "" });
      return;
    }
    const content = await readFile(join(root, relPath), "utf-8").catch(() => null);
    if (!content) {return;}
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(contentPattern)) {
        results.push({ path: norm, line: i + 1, text: lines[i].trim() });
        return;
      }
    }
  });
  return results;
}

async function walkDir(root: string, visit: (relPath: string) => Promise<void>): Promise<void> {
  // Skip dotfiles + node_modules + dist for sanity.
  const skip = new Set([".git", "node_modules", "dist", "dist-electron", ".electron-builder-cache"]);
  const stack: Array<{ abs: string; rel: string }> = [{ abs: root, rel: "" }];
  while (stack.length > 0) {
    const item = stack.pop()!;
    let entries: string[];
    try {
      entries = await readdir(item.abs);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (skip.has(entry)) {continue;}
      const childRel = item.rel ? `${item.rel}/${entry}` : entry;
      const childAbs = join(root, childRel);
      const st = await stat(childAbs).catch(() => null);
      if (!st) {continue;}
      if (st.isDirectory()) {
        stack.push({ abs: childAbs, rel: childRel });
      } else if (st.isFile()) {
        await visit(childRel);
      }
    }
  }
}

function matchGlob(relPath: string, glob: string): boolean {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::DOUBLESTAR::")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/::DOUBLESTAR::/g, ".*");
  return new RegExp(`^${escaped}$`).test(relPath);
}

// ─── Handler registration ──────────────────────────────────────────

export function registerIpcHandlers(_deps: {
  getMainWindow: () => BrowserWindow | null;
}): void {
  dbInit();
  loadSettings();

  // Settings
  ipcMain.handle("getSettings", () => loadSettings());
  ipcMain.handle("updateSettings", (_e, args) => {
    // V2 spec convention: args may be { newSettings } OR just the patch object.
    const rawPatch =
      (args && typeof args === "object" && ("newSettings" in args ? (args as { newSettings: unknown }).newSettings : args)) ?? {};
    const patch = rawPatch as Partial<Settings>;
    return updateSettings(patch);
  });
  ipcMain.handle("clearAllHistory", () => {
    dbInit();
    getDatabase().exec("DELETE FROM conversations");
  });

  // Conversations
  ipcMain.handle("listConversations", (_e, args) => {
    const include = !!(args && typeof args === "object" && (args as { includeArchived?: boolean }).includeArchived);
    return getConv(include);
  });
  ipcMain.handle("getConversation", (_e, args: { id: string }) => {
    dbInit();
    const row = getDatabase().prepare("SELECT * FROM conversations WHERE id = ?").get(args.id) as RawConvRow | undefined;
    if (!row) {throw new Error(`Conversation not found: ${args.id}`);}
    return toConversation(row);
  });
  ipcMain.handle("createConversation", (_e, args: { title?: string; workspaceId?: string; systemPrompt?: string | null }) => {
    dbInit();
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const title = args.title ?? "";
    const workspaceId = args.workspaceId ?? "";
    const systemPrompt = args.systemPrompt ?? null;
    getDatabase()
      .prepare(
        "INSERT INTO conversations (id, title, system_prompt, created_at, updated_at, archived_at, workspace_id) VALUES (?, ?, ?, ?, ?, NULL, ?)",
      )
      .run(id, title, systemPrompt, now, now, workspaceId);
    return toConversation({
      id,
      title,
      system_prompt: systemPrompt,
      created_at: now,
      updated_at: now,
      archived_at: null,
      workspace_id: workspaceId,
    });
  });
  ipcMain.handle("archiveConversation", (_e, args: { id: string }) => {
    dbInit();
    getDatabase().prepare("UPDATE conversations SET archived_at = ? WHERE id = ?").run(
      Math.floor(Date.now() / 1000),
      args.id,
    );
  });
  ipcMain.handle("deleteConversation", (_e, args: { id: string }) => {
    dbInit();
    getDatabase().prepare("DELETE FROM conversations WHERE id = ?").run(args.id);
  });

  // Messages
  ipcMain.handle("listMessages", (_e, args: { conversationId?: string }) => {
    dbInit();
    const convId = args.conversationId;
    if (!convId) {return [];}
    const rows = getDatabase()
      .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC")
      .all(convId) as RawMsgRow[];
    return rows.map(toMessage);
  });
  ipcMain.handle("appendMessage", (_e, args: {
    conversationId?: string;
    role: string;
    content: string;
    thinking?: string | null;
    toolCalls?: string;
    toolResults?: string;
    model?: string | null;
  }) => {
    dbInit();
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const convId = args.conversationId ?? "";
    const thinking = args.thinking ?? null;
    const toolCalls = args.toolCalls ?? null;
    const toolResults = args.toolResults ?? null;
    getDatabase()
      .prepare(
        "INSERT INTO messages (id, conversation_id, role, content, thinking, tool_calls, tool_results, model, input_tokens, output_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)",
      )
      .run(
        id,
        convId,
        args.role,
        args.content,
        thinking,
        toolCalls,
        toolResults,
        args.model ?? null,
        now,
      );
    return toMessage({
      id,
      conversation_id: convId,
      role: args.role,
      content: args.content,
      thinking,
      tool_calls: toolCalls,
      tool_results: toolResults,
      model: args.model ?? null,
      input_tokens: null,
      output_tokens: null,
      created_at: now,
    });
  });
  ipcMain.handle("searchMessages", (_e, args: { query: string; limit?: number }) => {
    dbInit();
    const limit = args.limit ?? 20;
    try {
      const rows = getDatabase()
        .prepare(
          "SELECT m.* FROM messages m JOIN messages_fts f ON m.rowid = f.rowid WHERE messages_fts MATCH ? ORDER BY rank LIMIT ?",
        )
        .all(args.query, limit) as RawMsgRow[];
      return rows.map(toMessage);
    } catch {
      return [];
    }
  });

  // Workspaces
  ipcMain.handle("listWorkspaces", () => {
    dbInit();
    const rows = getDatabase()
      .prepare("SELECT * FROM workspaces ORDER BY created_at DESC")
      .all() as RawWorkspace[];
    return rows.map(toWorkspace);
  });
  ipcMain.handle("addWorkspace", (_e, args: { label?: string; rootPath?: string }) => {
    dbInit();
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const label = args.label ?? "Workspace";
    const rootPath = args.rootPath ?? "";
    try {
      getDatabase()
        .prepare("INSERT INTO workspaces (id, label, root_path, created_at) VALUES (?, ?, ?, ?)")
        .run(id, label, rootPath, now);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`addWorkspace failed: ${msg}`);
    }
    return toWorkspace({ id, label, root_path: rootPath, created_at: now });
  });
  ipcMain.handle("renameWorkspace", (_e, args: { id: string; label: string }) => {
    dbInit();
    getDatabase().prepare("UPDATE workspaces SET label = ? WHERE id = ?").run(args.label, args.id);
  });
  ipcMain.handle("deleteWorkspace", (_e, args: { id: string }) => {
    dbInit();
    // CASCADE: conversations in this workspace are deleted.
    getDatabase().prepare("DELETE FROM workspaces WHERE id = ?").run(args.id);
  });
  ipcMain.handle("pickWorkspacePath", async () => {
    const r = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    return r.canceled ? null : r.filePaths[0] ?? null;
  });

  /**
   * Wrap a sandbox-calling handler so AppError plain objects (thrown by
   * file-sandbox.ts) become proper Error instances BEFORE they reach Electron
   * IPC serialization. Without this, Electron serializes them as "[object Object]",
   * the renderer can't parse the error kind, and tool_execution etc. lose error context.
   *
   * Encodes the AppError as JSON in the Error message. The renderer's `invoke()`
   * (src/shared/lib/ipc.ts) reconstructs the AppError from this JSON.
   */
  const sandboxHandler = <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      try {
        return await fn(...args);
      } catch (e) {
        if (e && typeof e === "object" && "kind" in e) {
          const ae = e as { kind: string; message?: string };
          throw new Error(JSON.stringify({ kind: ae.kind, message: ae.message ?? String(e) }));
        }
        throw e;
      }
    };

  // Filesystem
  ipcMain.handle("readFile", sandboxHandler(async (_e, args: { workspaceId?: string; path: string }) => {
    dbInit();
    const wsId = args.workspaceId ?? "";
    const ws = await getWorkspaceById(wsId);
    return await readFileInWorkspace(ws.root_path, args.path);
  }));
  ipcMain.handle("writeFile", sandboxHandler(async (_e, args: { workspaceId?: string; path: string; content: string }) => {
    dbInit();
    const wsId = args.workspaceId ?? "";
    const ws = await getWorkspaceById(wsId);
    await writeFileInWorkspace(ws.root_path, args.path, args.content);
  }));
  ipcMain.handle("editFile", sandboxHandler(async (_e, args: { workspaceId?: string; path: string; oldText: string; newText: string; replaceAll?: boolean }) => {
    dbInit();
    const wsId = args.workspaceId ?? "";
    const ws = await getWorkspaceById(wsId);
    const abs = await validatePathInWorkspace(args.path, ws.root_path);
    const content = await readFile(abs, "utf-8");
    const occurrences = content.split(args.oldText).length - 1;
    if (occurrences === 0) {
      throw new Error(`Pattern not found in ${args.path}`);
    }
    if (occurrences > 1 && !args.replaceAll) {
      throw new Error(
        `Pattern matches ${occurrences} times — use replaceAll or be more specific (must match exactly once)`,
      );
    }
    const newContent = args.replaceAll
      ? content.split(args.oldText).join(args.newText)
      : content.replace(args.oldText, args.newText);
    await writeFileInWorkspace(ws.root_path, args.path, newContent);
  }));
  ipcMain.handle("searchFiles", async (_e, args: { workspaceId?: string; glob: string; contentPattern?: string | null }) => {
    dbInit();
    const wsId = args.workspaceId ?? "";
    const ws = await getWorkspaceById(wsId);
    return await searchFilesInWorkspace(ws.root_path, args.glob, args.contentPattern ?? null);
  });
  ipcMain.handle("deleteFile", sandboxHandler(async (_e, args: { workspaceId?: string; path: string }) => {
    dbInit();
    const wsId = args.workspaceId ?? "";
    const ws = await getWorkspaceById(wsId);
    const abs = await validatePathInWorkspace(args.path, ws.root_path);
    await unlink(abs);
  }));

  // QA 路由由 electron/main/mock-server.ts 负责(POST /mock/anthropic/v1/messages
  // 经 qa-loader.ts 读 Q→A 文件);不再走 IPC。

  // Native shims
  ipcMain.handle("setLoginItem", (_e, args) => {
    app.setLoginItemSettings({ openAtLogin: !!(args && (args as { enabled?: boolean }).enabled) });
  });
  ipcMain.handle("notify", (_e, args) => {
    const title = (args && (args as { title?: string }).title) ?? "";
    const body = (args && (args as { body?: string }).body) ?? "";
    new Notification({ title, body }).show();
  });
  ipcMain.handle("openExternal", (_e, args) => {
    const url = (args && (args as { url?: string }).url) ?? "";
    return shell.openExternal(url);
  });
  ipcMain.handle("getLogPath", async () => {
    const { default: log } = await import("electron-log");
    return log.transports.file.getFile()?.path ?? null;
  });
  // ADR-0026 D1: Provider CRUD — delete provider from settings
  ipcMain.handle("deleteProvider", (_e, args: { id: string }) => {
    loadSettings();
    const next = {
      ...settingsCache!,
      providers: settingsCache!.providers.filter((p: Provider) => p.id !== args.id),
    };
    settingsCache = sanitize(next);
    saveSettings();
    return settingsCache!.providers;
  });
  // ADR-0024 D7: abort in-flight request by requestId
  ipcMain.handle("abortRequest", (_e, args: { requestId: string }) => {
    const ctrl = abortControllers.get(args.requestId);
    if (ctrl) {
      ctrl.abort();
      abortControllers.delete(args.requestId);
    }
    return null;
  });
}

/**
 * Forward a raw RuntimeEvent from main-process pi-mono subscription
 * to the renderer's preload-exposed onStreamChunk handler.
 * Per V3 consensus 1.1: main process owns the subscription lifecycle;
 * no intermediate queue. Sends to the first non-destroyed BrowserWindow
 * (single-window app, but resilient to mid-render destruction).
 */
export function emitStreamChunk(evt: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("stream-chunk", evt);
      return;
    }
  }
}
