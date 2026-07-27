//! V3 IPC invoke infrastructure — typed CodemanApi + StreamSubscription + invoke<T>.
//!
//! Replaces V2 string-dispatch with a fully typed channel-name → method shape.
//! `CodemanApi` is a hand-mirror of `src/preload/index.ts`; `StreamSubscription`
//! is the streaming side-channel (extracted per V3.2 — onStreamChunk returns
//! `() => void`, not a Promise, so it does not fit the CodemanApi shape).
//!
//! All methods on CodemanApi follow the V3 IPC contract: single typed args
//! object (or no args) and a concrete return Promise type. The new
//! `invoke<T extends keyof CodemanApi>(channel, args)` signature derives
//! args and return types from `CodemanApi[T]`, so channel name typos and
//! arg-shape mismatches are caught at compile time.
//!
//! Instrumentation (Q2埋点): success logs `[IPC] <channel> ok` via
//! `Effect.logDebug` (dev only, no-op in prod); failure logs
//! `[IPC] <channel> 失败` via the project `logger` (always).

import { Effect, Stream } from "effect";
import { logger } from "@codeman-frontend/shared/lib/logger";
import { Unknown, type AppError } from "@codeman-frontend/shared/lib/errors";
import { decodeAppError } from "@codeman-frontend/shared/lib/decode-app-error";
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
} from "../lib/types";

// ─── StreamSubscription (extracted from CodemanApi) ──────────────

/**
 * Streaming side-channel — `onStreamChunk` is a callback subscription
 * (returns `() => void`, not a Promise), so it does not fit CodemanApi's
 * "every method returns a Promise" shape. Used directly by `streamChunks`
 * below, bypassing `invoke`.
 */
export interface StreamSubscription {
  readonly onStreamChunk: (handler: (evt: unknown) => void) => () => void;
}

// ─── CodemanApi (mirror of preload; single-object args, typed returns) ───

/**
 * Hand-mirror of `src/preload/index.ts` `CodemanApi`. Every method takes a
 * single typed args object (or no args) and returns a concrete Promise type.
 * If preload changes, this must change too.
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
}

declare global {
  // eslint-disable-next-line no-var
  var codeman: (CodemanApi & StreamSubscription) | undefined;
}

// ─── Internal: API accessor ─────────────────────────────────────

function getApi(): CodemanApi & StreamSubscription {
  if (typeof window === "undefined" || !window.codeman) {
    throw new Error(
      "[invoke.api.ts] window.codeman not available — preload not loaded?",
    );
  }
  return window.codeman;
}

// ─── TauriError (kept for provider.api.ts internal use) ─────────

/**
 * Tauri-Electron IPC error — distinct from AppError, used by ProviderApi
 * for service-internal errors (e.g. provider not found). The main IPC
 * path uses `AppError` (via `mapIpcError`); `TauriError` is unrelated
 * to the invoke surface.
 */
export interface TauriError {
  readonly kind: "IPC";
  readonly message: string;
}

export const TauriError = {
  IPC: (message: string): TauriError => ({ kind: "IPC" as const, message }),
};

// ─── Internal: IPC error → AppError mapping ─────────────────────

/**
 * Map an IPC rejection to AppError. Tries to extract AppError from
 * Electron's double-wrapped error message (sandboxHandler in main encodes
 * AppError as JSON inside Error.message), otherwise falls back to Unknown.
 */
function mapIpcError(e: unknown): AppError {
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
      } catch {
        /* not our JSON — fall through */
      }
    }
    // Also try parsing the whole message as JSON (pre-wrap case).
    try {
      const parsed = JSON.parse(msg) as Record<string, unknown>;
      if (parsed && typeof parsed === "object" && ("kind" in parsed || "_tag" in parsed)) {
        return decodeAppError(parsed);
      }
    } catch {
      /* nope */
    }
  }
  if (e && typeof e === "object" && ("kind" in e || "_tag" in e)) {
    return decodeAppError(e);
  }
  return new Unknown({ message: String(e) });
}

// ─── invoke<T> (typed channel + args + return) ──────────────────

/**
 * Type-safe IPC invoke.
 *
 * - `channel` is a literal of `keyof CodemanApi`; typos are compile errors.
 * - `args` is the method's typed args object (`Parameters<CodemanApi[T]>[0]`).
 *   For no-arg methods `Parameters<T>[0]` is `undefined`, so `args?` is
 *   optional and may be omitted. For arg-taking methods `args` is required
 *   (omit-at-call-site would still typecheck but fail at runtime — the
 *   strict overload story for required-arg methods is left as a future
 *   refactor; today we accept the soft check).
 * - Return is `R`; defaults to `unknown`. Callers typically provide
 *   `R` explicitly as the expected concrete return type, e.g.
 *   `invoke<Settings>("getSettings")`. With Q4's tightened CodemanApi,
 *   the concrete type is also auto-derivable as
 *   `Awaited<ReturnType<CodemanApi[T]>>` — future refactor can default
 *   `R` to that once type-parameter-default cross-reference is relaxed
 *   (TS currently disallows `<R = Awaited<ReturnType<T>>, T = ...>`).
 *
 * Wraps the underlying `window.codeman[channel](args)` call in
 * `Effect.tryPromise` and maps errors to `AppError`. No `dispatch` switch,
 * no string name lookup — the channel name IS the method name.
 */
export const invoke = <
  R = unknown,
  T extends keyof CodemanApi = keyof CodemanApi,
>(
  channel: T,
  args?: Parameters<CodemanApi[T]>[0],
): Effect.Effect<R, AppError> =>
  Effect.tryPromise({
    try: async () => {
      const method = getApi()[channel] as (a: unknown) => Promise<unknown>;
      return (await method(args)) as R;
    },
    catch: mapIpcError,
  }).pipe(
    Effect.tap(() => Effect.logDebug(`[IPC] ${channel} ok`)),
    Effect.tapError((e) =>
      Effect.sync(() => logger.error("IPC 调用失败", channel, e)),
    ),
  );

// ─── streamChunks (uses StreamSubscription directly) ────────────

/**
 * Stream consumer — wraps `window.codeman.onStreamChunk` in an Effect
 * Stream. Used by chat store to subscribe to pi-mono agent events from
 * main process. Per V3 consensus 1.1: main process owns the pi-mono
 * subscription; this Stream just adapts the preload callback API to
 * Effect's Stream type. Bypasses `invoke` because onStreamChunk returns
 * an unsubscribe fn, not a Promise.
 */
export const streamChunks: Stream.Stream<unknown, never, never> = Stream.async<unknown>(
  (emit) => {
    const unsubscribe = getApi().onStreamChunk((evt) => emit.single(evt));
    return Effect.sync(() => unsubscribe());
  },
);
