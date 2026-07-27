//! V3 IPC invoke infrastructure — extracted from ipc.ts for domain split.
//!
//! Contains: TauriError, CodemanApi, api(), dispatchInvoke, invoke, streamChunks.

import { Effect, Stream } from "effect";
import { logger } from "@codeman-frontend/shared/lib/logger";
import { Unknown, type AppError } from "@codeman-frontend/shared/lib/errors";
import { decodeAppError } from "@codeman-frontend/shared/lib/decode-app-error";

// ─── TauriError ───────────────────────────────────────────────

/** Tauri-Electron IPC error - distinct from AppError for service-specific error handling */
export interface TauriError {
  readonly kind: "IPC";
  readonly message: string;
}

export const TauriError = {
  IPC: (message: string): TauriError => ({ kind: "IPC" as const, message }),
};

// ─── CodemanApi (preload-exposed API shape) ───────────────────

/** Shape of preload-exposed API (mirrors src/preload/index.ts) */
export interface CodemanApi {
  getSettings: () => Promise<unknown>;
  updateSettings: (newSettings: unknown) => Promise<unknown>;
  clearAllHistory: () => Promise<unknown>;
  listConversations: (includeArchived: boolean) => Promise<unknown>;
  getConversation: (id: string) => Promise<unknown>;
  createConversation: (args: unknown) => Promise<unknown>;
  archiveConversation: (id: string) => Promise<unknown>;
  deleteConversation: (id: string) => Promise<unknown>;
  renameConversation: (id: string, title: string) => Promise<unknown>;
  listMessages: (conversationId: string) => Promise<unknown>;
  appendMessage: (args: unknown) => Promise<unknown>;
  searchMessages: (query: string, limit: number) => Promise<unknown>;
  listWorkspaces: () => Promise<unknown>;
  addWorkspace: (label: string, rootPath: string) => Promise<unknown>;
  renameWorkspace: (id: string, label: string) => Promise<unknown>;
  deleteWorkspace: (id: string) => Promise<unknown>;
  pickWorkspacePath: () => Promise<unknown>;
  /** V3+ ADR-0023 D8-W: 删除 provider（注意：当前 Electron 后端未实现，
   * ProviderService.delete 仍会触发 IPC 失败 — 由 mapError 转 AppError）。
   * 留此声明是为 renderer/preload 类型一致，避免 dispatchInvoke 命中 default 抛 Unknown。
   */
  deleteProvider: (id: string) => Promise<unknown>;
  // ADR-0024 D7: abort in-flight LLM request by requestId
  abortRequest: (requestId: string) => Promise<unknown>;
  readFile: (workspaceId: string, path: string) => Promise<unknown>;
  writeFile: (workspaceId: string, path: string, content: string) => Promise<unknown>;
  editFile: (
    workspaceId: string,
    path: string,
    oldText: string,
    newText: string,
    replaceAll: boolean,
  ) => Promise<unknown>;
  searchFiles: (
    workspaceId: string,
    glob: string,
    contentPattern: string | null,
  ) => Promise<unknown>;
  deleteFile: (workspaceId: string, path: string) => Promise<unknown>;
  notify: (title: string, body: string) => Promise<unknown>;
  openExternal: (url: string) => Promise<unknown>;
  setLoginItem: (enabled: boolean) => Promise<unknown>;
  getLogPath: () => Promise<unknown>;
  // Skills plugin (ADR-0031) — main process reads ~/.agents/skills/
  skillsScan: () => Promise<unknown>;
  skillsLoad: (name: string) => Promise<unknown>;
  // MCP plugin (ADR-0032) — MCP client IPC
  mcpListServers: () => Promise<unknown>;
  mcpGetTools: (args: { serverName: string }) => Promise<unknown>;
  mcpGetAllTools: () => Promise<unknown>;
  mcpEnable: (args: { serverName: string; enabled: boolean }) => Promise<unknown>;
  mcpRestart: (args: { serverName: string }) => Promise<unknown>;
  mcpCallTool: (args: { serverName: string; toolName: string; args: unknown }) => Promise<unknown>;
  mcpOpenConfigDir: () => Promise<unknown>;
  onStreamChunk: (handler: (evt: unknown) => void) => () => void;
}

declare global {
  // eslint-disable-next-line no-var
  var codeman: CodemanApi | undefined;
}

// ─── api() ────────────────────────────────────────────────────

function api(): CodemanApi {
  if (typeof window === "undefined" || !window.codeman) {
    throw new Error(
      "[invoke.api.ts] window.codeman not available — preload not loaded?",
    );
  }
  return window.codeman;
}

// ─── dispatchInvoke ───────────────────────────────────────────

/**
 * Dispatch IPC command to the appropriate window.codeman method.
 * Mirrors the channel name → method mapping in src/main/ipc.ts.
 */
async function dispatchInvoke<T>(
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const a = api();
  const arg = (k: string) => args?.[k];
  switch (name) {
    case "getSettings":
      return (await a.getSettings()) as T;
    case "updateSettings":
      return (await a.updateSettings(arg("newSettings") as unknown)) as T;
    case "clearAllHistory":
      return (await a.clearAllHistory()) as T;
    case "listConversations":
      return (await a.listConversations(!!arg("includeArchived"))) as T;
    case "getConversation":
      return (await a.getConversation(arg("id") as string)) as T;
    case "createConversation":
      return (await a.createConversation(args)) as T;
    case "archiveConversation":
      return (await a.archiveConversation(arg("id") as string)) as T;
    case "deleteConversation":
      return (await a.deleteConversation(arg("id") as string)) as T;
    case "renameConversation":
      return (await a.renameConversation(arg("id") as string, arg("title") as string)) as T;
    case "listMessages":
      return (await a.listMessages(arg("conversationId") as string)) as T;
    case "appendMessage":
      return (await a.appendMessage(args)) as T;
    case "searchMessages":
      return (await a.searchMessages(arg("query") as string, arg("limit") as number)) as T;
    case "listWorkspaces":
      return (await a.listWorkspaces()) as T;
    case "addWorkspace":
      return (await a.addWorkspace(arg("label") as string, arg("rootPath") as string)) as T;
    case "renameWorkspace":
      return (await a.renameWorkspace(arg("id") as string, arg("label") as string)) as T;
    case "deleteWorkspace":
      return (await a.deleteWorkspace(arg("id") as string)) as T;
    case "pickWorkspacePath":
      return (await a.pickWorkspacePath()) as T;
    case "deleteProvider":
      return (await a.deleteProvider(arg("id") as string)) as T;
    case "abortRequest":
      return (await a.abortRequest(arg("requestId") as string)) as T;
    case "readFile":
      return (await a.readFile(arg("workspaceId") as string, arg("path") as string)) as T;
    case "writeFile":
      return (await a.writeFile(arg("workspaceId") as string, arg("path") as string, arg("content") as string)) as T;
    case "editFile":
      return (await a.editFile(
        arg("workspaceId") as string,
        arg("path") as string,
        arg("oldText") as string,
        arg("newText") as string,
        !!arg("replaceAll"),
      )) as T;
    case "searchFiles":
      return (await a.searchFiles(
        arg("workspaceId") as string,
        arg("glob") as string,
        (arg("contentPattern") as string | null) ?? null,
      )) as T;
    case "deleteFile":
      return (await a.deleteFile(arg("workspaceId") as string, arg("path") as string)) as T;
    case "skillsScan":
      return (await a.skillsScan()) as T;
    case "skillsLoad":
      return (await a.skillsLoad(arg("name") as string)) as T;
    case "mcpListServers":
      return (await a.mcpListServers()) as T;
    case "mcpGetTools":
      return (await a.mcpGetTools({ serverName: arg("serverName") as string })) as T;
    case "mcpGetAllTools":
      return (await a.mcpGetAllTools()) as T;
    case "mcpEnable":
      return (await a.mcpEnable({ serverName: arg("serverName") as string, enabled: !!arg("enabled") })) as T;
    case "mcpRestart":
      return (await a.mcpRestart({ serverName: arg("serverName") as string })) as T;
    case "mcpCallTool":
      return (await a.mcpCallTool({ serverName: arg("serverName") as string, toolName: arg("toolName") as string, args: arg("args") as unknown })) as T;
    case "mcpOpenConfigDir":
      return (await a.mcpOpenConfigDir()) as T;
    default:
      throw new Unknown({ message: `Unknown IPC: ${name}` });
  }
}

// ─── invoke (Effect wrapper) ──────────────────────────────────

/**
 * Wrap an IPC command in an Effect that maps errors to AppError.
 * Preserves upstream AppError shape (when the error has a `kind` field,
 * e.g. SandboxViolation / NotFound from main process), otherwise logs and
 * falls back to Unknown. Sandbox errors are NOT logged as noise — UI
 * (tool_call_card) renders their detail.
 */
export const invoke = <T>(
  name: string,
  args?: Record<string, unknown>,
): Effect.Effect<T, AppError> =>
  Effect.tryPromise({
    try: () => dispatchInvoke<T>(name, args),
    catch: (e) => {
      // AppError from main process is encoded as JSON in Error.message
      // (src/main/ipc.ts sandboxHandler wraps AppError plain objects).
      // However, Electron's ipcMain.handle re-wraps the Error, so the renderer
      // sees: `Error: Error invoking remote method 'X': Error: {"Kind":"...","message":"..."}`.
      // We need to extract the JSON from the doubly-wrapped message.
      if (e instanceof Error) {
        const msg = e.message;
        // Look for the last `{...}` in the message chain (the inner JSON payload).
        const braceStart = msg.lastIndexOf("{");
        if (braceStart !== -1) {
          try {
            const candidate = msg.slice(braceStart);
            const parsed = JSON.parse(candidate) as Record<string, unknown>;
            if (parsed && typeof parsed === "object" && ("kind" in parsed || "_tag" in parsed)) {
              return decodeAppError(parsed);
            }
          } catch { /* not our JSON — fall through */ }
        }
        // Also try parsing the whole message as JSON (pre-wrap case).
        try {
          const parsed = JSON.parse(msg) as Record<string, unknown>;
          if (parsed && typeof parsed === "object" && ("kind" in parsed || "_tag" in parsed)) {
            return decodeAppError(parsed);
          }
        } catch { /* nope */ }
      }
      if (e && typeof e === "object" && ("kind" in e || "_tag" in e)) {
        return decodeAppError(e);
      }
      logger.error("IPC 调用失败", name, e);
      return new Unknown({ message: String(e) });
    },
  });

// ─── streamChunks ─────────────────────────────────────────────

/**
 * Stream consumer — wraps window.codeman.onStreamChunk in an Effect Stream.
 * Used by chat store to subscribe to pi-mono agent events from main process.
 * Per V3 consensus 1.1: main process owns the pi-mono subscription; this
 * Stream just adapts the preload callback API to Effect's Stream type.
 */
export const streamChunks: Stream.Stream<unknown, never, never> = Stream.async<unknown>(
  (emit) => {
    const unsubscribe = api().onStreamChunk((evt) => emit.single(evt));
    return Effect.sync(() => unsubscribe());
  },
);
