//! File Tools — 5 个 AgentTool 定义（V2 文件 IO，ADR-0013）。
//!
//! T11-T15：read_file / write_file / edit_file / search_files / delete_file。
//! 每个工具调用 FileApi 方法，FileApi 通过 Effect.provide(Layer) 提供（Effect v3 API）。

import { Schema } from "effect";
import { toToolParameters } from "@codeman-frontend/shared/lib/tool-schema";
import type { Static, TSchema } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Effect, Exit } from "effect";
import { FileApi, FileApiLive } from "@shared/apis";
import { InvalidConfig, Unknown, type AppError } from "@codeman-frontend/shared/lib/errors";
import type { FileMatch } from "@codeman-frontend/shared/lib/types";

// ============================================================================
// AgentToolResult type (pi-ai 0.9.4 doesn't export this type)
// ============================================================================

interface TextContent {
  type: "text";
  text: string;
}

interface AgentToolResult<T> {
  content: TextContent[];
  details: T;
}
// ============================================================================
// Args accessor — ADR-0013.1: schema field = IPC arg key = chat system prompt
// hint, single camelCase truth source. Returns the property's type as declared
// in `T`, so optional fields stay `T | undefined` and required fields stay `T`.
// ============================================================================
function pickArgs<T extends Record<string, unknown>, K extends keyof T>(
  args: T,
  key: K,
): T[K] {
  return args[key];
}

/** T27 + ADR-0013.1: workspaceId may now be missing from LLM args (schema is
 *  Optional). Return an `Effect.fail(InvalidConfig)` when neither LLM nor the
 *  runtime wrapper provided one — bubbles up via the normal tool error path
 *  and renders cleanly in ToolCallCard. Using `Effect.fail` (not sync
 *  `throw`) so the cause reaches `runFileEffect` as `Cause.Fail`, not
 *  `Cause.Die`. */
function requireWorkspaceId(args: Record<string, any>): Effect.Effect<string, AppError> {
  const ws = pickArgs(args, "workspaceId");
  if (typeof ws === "string" && ws.length > 0) {
    return Effect.succeed(ws);
  }
  return Effect.fail(new InvalidConfig({
    field: "workspaceId",
    message:
      "workspaceId is required. The runtime should inject it from the conversation context — " +
      "if you see this, the chat.runtime.run() call is missing ProviderConfig.workspaceId.",
  }));
}

// ============================================================================
// Tool Schemas
// ============================================================================

/**
 * T27 + ADR-0025 PR 3 + ADR-0013.1 + this PR (Task 4): workspaceId 是 optional.
 *
 * ADR-0013.1 wire-format rename: schema field is camelCase to match the TS IPC
 * layer (`window.codeman.readFile(workspaceId, path)`) and the chat system
 * prompt hint (`chat.store.ts:194-195`). Single source of truth.
 *
 * Runtime injection: `createFileTools(workspaceId)` wraps every tool's `execute`
 * and injects `workspaceId` into args BEFORE schema validation (per
 * `pickArgs` / `createFileTools` block below). LLM may also pass it explicitly
 * (explicit value wins).
 *
 * Centralised here so the 5 sibling `Schema.Struct({...})` definitions stay in
 * sync if the rule ever flips back to required, or to constrain it further
 * (e.g., branded `WorkspaceId` per `src/shared/lib/workspace-id.ts`).
 */
export const workspaceIdField = Schema.optional(Schema.String);

// T27 + ADR-0013.1: workspaceId 改为可选 — runtime (chat.store.sendMessage) 通过
// `createFileTools(provider.workspaceId)` 自动注入,避免 LLM (或 mock JSON)
// 不知道 UUID 时校验失败。LLM 也可以显式覆盖(优先用 LLM 传的)。
const ReadFileSchema = Schema.Struct({
  workspaceId: workspaceIdField,
  path: Schema.String,
});

const WriteFileSchema = Schema.Struct({
  workspaceId: workspaceIdField,
  path: Schema.String,
  content: Schema.String,
});

const EditFileSchema = Schema.Struct({
  workspaceId: workspaceIdField,
  path: Schema.String,
  oldText: Schema.String,
  newText: Schema.String,
  replaceAll: Schema.Boolean,
});

const SearchFilesSchema = Schema.Struct({
  workspaceId: workspaceIdField,
  glob: Schema.String,
  contentPattern: Schema.optional(Schema.String),
});

const DeleteFileSchema = Schema.Struct({
  workspaceId: workspaceIdField,
  path: Schema.String,
});

// ============================================================================
// Helper: run Effect and convert to AgentToolResult
// ============================================================================

async function runFileEffect<T>(
  effect: Effect.Effect<T, AppError>,
  formatSuccess: (value: T) => string,
): Promise<AgentToolResult<T | AppError>> {
  const exit = await Effect.runPromiseExit(effect);

  if (Exit.isFailure(exit)) {
    const cause = exit.cause;
    let err: AppError;
    if (cause._tag === "Fail") {
      err = cause.error as AppError;
    } else {
      err = new Unknown({ message: String(cause) });
    }
    return {
      content: [
        {
          type: "text",
          // 含 kind 标签:让 SandboxViolation / NotFound / Unknown 等错误种类在
          // text payload 里可见(tool 消费方通常只看 text 不看 details)。
          text: `Error (${err._tag}): ${"message" in err ? err.message : JSON.stringify(err)
            }`,
        },
      ],
      details: err,
    };
  }

  const value = exit.value;
  return {
    content: [{ type: "text", text: formatSuccess(value) }],
    details: value,
  };
}

// ============================================================================
// Tool Definitions
// ============================================================================

const readFile = Effect.fnUntraced(
  function* (typedArgs: Static<typeof readParams>) {
    const workspaceId = yield* requireWorkspaceId(typedArgs);
    const svc = yield* FileApi;
    return yield* svc.readFile(workspaceId, pickArgs(typedArgs, "path"));
  },
  Effect.provide(FileApiLive),
);

const readParams = toToolParameters(ReadFileSchema);
export const readFileTool: AgentTool<typeof readParams, string | AppError> = {
  label: "read_file",
  name: "read_file",
  description:
    "Read a file from a workspace directory (UTF-8, ≤10MB). Returns the full file content.",
  parameters: readParams,
  execute: async (_toolCallId, args) => {
    return runFileEffect(
      readFile(args as Static<typeof readParams>),
      (content) => `Content:\n${content}`,
    );
  },
};

const writeFile = Effect.fnUntraced(
  function* (typedArgs: Static<typeof writeParams>) {
    const workspaceId = yield* requireWorkspaceId(typedArgs);
    const svc = yield* FileApi;
    return yield* svc.writeFile(
      workspaceId,
      pickArgs(typedArgs, "path"),
      pickArgs(typedArgs, "content"),
    );
  },
  Effect.provide(FileApiLive),
);

const writeParams = toToolParameters(WriteFileSchema);
export const writeFileTool: AgentTool<typeof writeParams, void | AppError> = {
  label: "write_file",
  name: "write_file",
  description:
    "Write content to a file in a workspace (atomic write, ≤10MB). Creates or overwrites.",
  parameters: writeParams,
  execute: async (_toolCallId, args) => {
    return runFileEffect(
      writeFile(args as Static<typeof writeParams>),
      () => "Done: file written successfully.",
    );
  },
};

const editFile = Effect.fnUntraced(
  function* (typedArgs: Static<typeof editParams>) {
    const workspaceId = yield* requireWorkspaceId(typedArgs);
    const svc = yield* FileApi;
    return yield* svc.editFile(
      workspaceId,
      pickArgs(typedArgs, "path"),
      pickArgs(typedArgs, "oldText"),
      pickArgs(typedArgs, "newText"),
      pickArgs(typedArgs, "replaceAll"),
    );
  },
  Effect.provide(FileApiLive),
);

const editParams = toToolParameters(EditFileSchema);
export const editFileTool: AgentTool<typeof editParams, void | AppError> = {
  label: "edit_file",
  name: "edit_file",
  description:
    "Replace text in a file (unique match required unless replaceAll=true). " +
    "Use replaceAll=false for single replacement. Returns error if oldText matches 0 or 2+ times (unless replaceAll=true).",
  parameters: editParams,
  execute: async (_toolCallId, args) => {
    return runFileEffect(
      editFile(args as Static<typeof editParams>),
      () =>
        (args as Static<typeof editParams>).replaceAll
          ? "Done: all occurrences replaced."
          : "Done: text replaced.",
    );
  },
};

const searchFiles = Effect.fnUntraced(
  function* (typedArgs: Static<typeof searchParams>) {
    const workspaceId = yield* requireWorkspaceId(typedArgs);
    const svc = yield* FileApi;
    return yield* svc.searchFiles(
      workspaceId,
      pickArgs(typedArgs, "glob"),
      pickArgs(typedArgs, "contentPattern") ?? null,
    );
  },
  Effect.provide(FileApiLive),
);

const searchParams = toToolParameters(SearchFilesSchema);
export const searchFilesTool: AgentTool<typeof searchParams, FileMatch[] | AppError> = {
  label: "search_files",
  name: "search_files",
  description:
    "Find files in workspace by glob pattern, optionally filtered by content substring (≤100 results). " +
    "Returns array of matches with path, line_number, and line_content.",
  parameters: searchParams,
  execute: async (_toolCallId, args) => {
    return runFileEffect(searchFiles(args as Static<typeof searchParams>), (matches: FileMatch[]) => {
      if (matches.length === 0) {
        return "No matches found.";
      }
      const description = matches
        .map((m) => `${m.path}:${m.lineNumber ?? "null"} - ${m.lineContent ?? "null"}`)
        .join("\n");
      return `Found ${matches.length} match(es):\n${description}`;
    });
  },
};

const deleteFile = Effect.fnUntraced(
  function* (typedArgs: Static<typeof deleteParams>) {
    const workspaceId = yield* requireWorkspaceId(typedArgs);
    const svc = yield* FileApi;
    return yield* svc.deleteFile(workspaceId, pickArgs(typedArgs, "path"));
  },
  Effect.provide(FileApiLive),
);

const deleteParams = toToolParameters(DeleteFileSchema);
export const deleteFileTool: AgentTool<typeof deleteParams, void | AppError> = {
  label: "delete_file",
  name: "delete_file",
  description:
    "Move a file to the recycle bin (recoverable, no permanent delete in V2). " +
    "Blocked extensions: .exe/.dll/.sys/.ini and other system files.",
  parameters: deleteParams,
  execute: async (_toolCallId, args) => {
    return runFileEffect(
      deleteFile(args as Static<typeof deleteParams>),
      () => "Done: file moved to recycle bin.",
    );
  },
};

/** 所有 file-tools 工具数组（向后兼容 — 调用方无 workspaceId 时仍可使用）。
 *
 *  绝大多数路径请用 `createFileTools(workspaceId)`,它会包装 execute 注入
 *  `workspaceId` 到 args(LLM 省略或 mock JSON 不带时)。`fileTools` 这个
 *  直导数组保留,供测试或一次性脚本调用 — 调用方必须自己在 args 里提供
 *  `workspaceId`,否则工具返回 `InvalidConfig` 错误。 
 **/
export const fileTools: AgentTool<TSchema, unknown>[] = [
  readFileTool,
  writeFileTool,
  editFileTool,
  searchFilesTool,
  deleteFileTool,
];

/** 创建带 `workspaceId` 自动注入的 file tools 列表(T27 + ADR-0013.1)。
 *
 *  pi-agent-core 的 schema 校验在 `execute` 之前运行,因此我们无法在收到
 *  args 后再补 `workspaceId` — 必须**在 schema 校验之前**把 field 填好。
 *  包装层在 Agent 校验后的 execute 调用里,把 `provider.workspaceId` 注入
 *  args(若 LLM 自己传了,以 LLM 为准,允许覆盖)。
 *
 *  @param workspaceId - 当前 conversation 绑定的 workspace UUID。
 *                       若省略 / 空字符串,等价于 `fileTools`(工具接收
 *                       不带 workspaceId 的 args 时返回 InvalidConfig)。
 */
export function createFileTools(workspaceId?: string): AgentTool<TSchema, unknown>[] {
  const tools: AgentTool<TSchema, unknown>[] = [readFileTool, writeFileTool, editFileTool, searchFilesTool, deleteFileTool];
  if (!workspaceId) {
    return tools;
  }
  return tools.map((tool) => ({
    ...tool,
    execute: async (toolCallId: string, params: unknown, signal?: AbortSignal) => {
      // 若 LLM 已显式给 workspaceId,优先用 LLM 的(允许覆盖默认值 — 比如
      // 未来多 workspace 场景)。否则注入 runtime 提供的值。
      // ADR-0013.1: schema field 唯一 = workspaceId,不需要 dual-form 桥。
      const args = (params && typeof params === "object"
        ? (params as Record<string, unknown>)
        : {}) as Record<string, unknown>;
      const alreadyHas = pickArgs(args, "workspaceId");
      const finalArgs =
        typeof alreadyHas === "string" && alreadyHas.length > 0
          ? args
          : { ...args, workspaceId };
      return tool.execute(toolCallId, finalArgs, signal);
    },
  }));
}
