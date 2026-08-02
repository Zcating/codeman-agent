
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
  CompactionEntry,
} from "../lib/types";
import type { SubAgentConfig } from "@codeman-frontend/plugins/multi-agents/lib/sub-agent.types";

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

  // Run command
  readonly runCommand: (args: { command: string; cwd?: string; timeoutMs?: number }) => Promise<unknown>;

  // Compaction
  readonly compactionList: (args: { conversationId?: string }) => Promise<CompactionEntry[]>;
  readonly compactionAppend: (args: {
    conversationId?: string;
    summary: string;
    model: string;
    tokensBefore: number;
    kind: "auto" | "manual";
    firstKeptMessageId: string;
  }) => Promise<CompactionEntry>;

  // Sub-Agents
  readonly subAgentsList: () => Promise<readonly SubAgentConfig[]>;
  readonly subAgentsAdd: (config: SubAgentConfig) => Promise<SubAgentConfig>;
  readonly subAgentsUpdate: (args: { id: string; patch: Partial<SubAgentConfig> }) => Promise<SubAgentConfig>;
  readonly subAgentsDelete: (args: { id: string }) => Promise<void>;
  readonly subAgentsSetEnabled: (args: { id: string; enabled: boolean }) => Promise<SubAgentConfig>;
}

declare global {
  var codeman: (CodemanApi & StreamSubscription) | undefined;
}

function getApi(): CodemanApi & StreamSubscription {
  if (typeof window === "undefined" || !window.codeman) {
    throw new Error(
      "[invoke.api.ts] window.codeman not available — preload not loaded?",
    );
  }
  return window.codeman;
}

export interface TauriError {
  readonly kind: "IPC";
  readonly message: string;
}

export const TauriError = {
  IPC: (message: string): TauriError => ({ kind: "IPC" as const, message }),
};

function mapIpcError(e: unknown): AppError {
  if (e instanceof Error) {
    const msg = e.message;
    const braceStart = msg.lastIndexOf("{");
    if (braceStart !== -1) {
      try {
        const candidate = msg.slice(braceStart);
        const parsed = JSON.parse(candidate) as Record<string, unknown>;
        if (parsed && typeof parsed === "object" && ("kind" in parsed || "_tag" in parsed)) {
          return decodeAppError(parsed);
        }
      } catch {
      }
    }
    try {
      const parsed = JSON.parse(msg) as Record<string, unknown>;
      if (parsed && typeof parsed === "object" && ("kind" in parsed || "_tag" in parsed)) {
        return decodeAppError(parsed);
      }
    } catch {
    }
  }
  if (e && typeof e === "object" && ("kind" in e || "_tag" in e)) {
    return decodeAppError(e);
  }
  return new Unknown({ message: String(e) });
}

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

export const streamChunks: Stream.Stream<unknown, never, never> = Stream.async<unknown>(
  (emit) => {
    const unsubscribe = getApi().onStreamChunk((evt) => emit.single(evt));
    return Effect.sync(() => unsubscribe());
  },
);
