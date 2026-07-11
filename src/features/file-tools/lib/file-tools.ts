//! File Tools — 5 个 AgentTool 定义（V2 文件 IO，ADR-0013）。
//!
//! T11-T15：read_file / write_file / edit_file / search_files / delete_file。
//! 每个工具调用 FileService 方法，FileService 通过 Effect.provide(Layer) 提供（Effect v3 API）。

import { Schema } from "effect";
import { toToolParameters } from "../../../shared/lib/tool-schema";
import type { TSchema } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Effect, Exit } from "effect";
import { FileService, FileServiceLive } from "../../../shared/lib/ipc";
import { InvalidConfig, Unknown, type AppError } from "../../../shared/lib/errors";
import type { FileMatch } from "../../../shared/lib/types";

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
// Args normalizer — LLM may use camelCase (workspaceId) even though schema
// says snake_case (workspace_id). Normalize to snake_case for the IPC layer.
// ============================================================================
function pickArgs<T extends Record<string, any>>(args: T, snake: string, camel?: string): any {
  if (args[snake] !== undefined) {
    return args[snake];
  }
  if (camel && args[camel] !== undefined) {
    return args[camel];
  }
  return undefined;
}

/** T27: workspace_id may now be missing from LLM args (schema is Optional).
 *  Return an `Effect.fail(InvalidConfig)` when neither LLM nor the runtime
 *  wrapper provided one — bubbles up via the normal tool error path and
 *  renders cleanly in ToolCallCard. Using `Effect.fail` (not sync `throw`)
 *  so the cause reaches `runFileEffect` as `Cause.Fail`, not `Cause.Die`. */
function requireWorkspaceId(args: Record<string, any>): Effect.Effect<string, AppError> {
  const ws = pickArgs(args, "workspace_id", "workspaceId");
  if (typeof ws === "string" && ws.length > 0) {
    return Effect.succeed(ws);
  }
  return Effect.fail(new InvalidConfig({
    field: "workspace_id",
    message:
      "workspace_id is required. The runtime should inject it from the conversation context — " +
      "if you see this, the chat.runtime.run() call is missing ProviderConfig.workspaceId.",
  }));
}

// ============================================================================
// Tool Schemas
// ============================================================================

/**
 * T27 + ADR-0025 PR 3 + this PR (Task 4): workspace_id 是 optional.
 *
 * Runtime injection: `createFileTools(workspaceId)` wraps every tool's `execute`
 * and injects `workspace_id` into args BEFORE schema validation (per
 * `pickArgs` / `createFileTools` block below). LLM may also pass it explicitly
 * (explicit value wins).
 *
 * Centralised here so the 5 sibling `Schema.Struct({...})` definitions stay in
 * sync if the rule ever flips back to required, or to constrain it further
 * (e.g., branded `WorkspaceId` per `src/shared/lib/workspace-id.ts`).
 */
export const workspaceIdField = Schema.optional(Schema.String);

// T27: workspace_id 改为可选 — runtime (chat.store.sendMessage) 通过
// `createFileTools(provider.workspaceId)` 自动注入,避免 LLM (或 mock JSON)
// 不知道 UUID 时校验失败。LLM 也可以显式覆盖(优先用 LLM 传的)。
const ReadFileSchema = Schema.Struct({
  workspace_id: workspaceIdField,
  path: Schema.String,
});
type ReadFileArgs = Schema.Schema.Type<typeof ReadFileSchema>;

const WriteFileSchema = Schema.Struct({
  workspace_id: workspaceIdField,
  path: Schema.String,
  content: Schema.String,
});
type WriteFileArgs = Schema.Schema.Type<typeof WriteFileSchema>;

const EditFileSchema = Schema.Struct({
  workspace_id: workspaceIdField,
  path: Schema.String,
  old_text: Schema.String,
  new_text: Schema.String,
  replace_all: Schema.Boolean,
});
type EditFileArgs = Schema.Schema.Type<typeof EditFileSchema>;

const SearchFilesSchema = Schema.Struct({
  workspace_id: workspaceIdField,
  glob: Schema.String,
  content_pattern: Schema.optional(Schema.String),
});
type SearchFilesArgs = Schema.Schema.Type<typeof SearchFilesSchema>;

const DeleteFileSchema = Schema.Struct({
  workspace_id: workspaceIdField,
  path: Schema.String,
});
type DeleteFileArgs = Schema.Schema.Type<typeof DeleteFileSchema>;

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
  function* (typedArgs: ReadFileArgs) {
    const workspaceId = yield* requireWorkspaceId(typedArgs);
    const svc = yield* FileService;
    return yield* svc.readFile(workspaceId, pickArgs(typedArgs, "path"));
  },
  Effect.provide(FileServiceLive),
);

export const readFileTool: AgentTool<TSchema, string | AppError> = {
  label: "read_file",
  name: "read_file",
  description:
    "Read a file from a workspace directory (UTF-8, ≤10MB). Returns the full file content.",
  parameters: toToolParameters(ReadFileSchema),
  execute: async (_toolCallId, args) => {
    const typedArgs = args as unknown as ReadFileArgs;
    return runFileEffect(readFile(typedArgs), (content) => `Content:\n${content}`);
  },
};

const writeFile = Effect.fnUntraced(
  function* (typedArgs: WriteFileArgs) {
    const workspaceId = yield* requireWorkspaceId(typedArgs);
    const svc = yield* FileService;
    return yield* svc.writeFile(
      workspaceId,
      pickArgs(typedArgs, "path"),
      pickArgs(typedArgs, "content"),
    );
  },
  Effect.provide(FileServiceLive),
);

export const writeFileTool: AgentTool<TSchema, void | AppError> = {
  label: "write_file",
  name: "write_file",
  description:
    "Write content to a file in a workspace (atomic write, ≤10MB). Creates or overwrites.",
  parameters: toToolParameters(WriteFileSchema),
  execute: async (_toolCallId, args) => {
    const typedArgs = args as unknown as WriteFileArgs;
    return runFileEffect(writeFile(typedArgs), () => "Done: file written successfully.");
  },
};

const editFile = Effect.fnUntraced(
  function* (typedArgs: EditFileArgs) {
    const workspaceId = yield* requireWorkspaceId(typedArgs);
    const svc = yield* FileService;
    return yield* svc.editFile(
      workspaceId,
      pickArgs(typedArgs, "path"),
      pickArgs(typedArgs, "old_text", "oldText"),
      pickArgs(typedArgs, "new_text", "newText"),
      pickArgs(typedArgs, "replace_all", "replaceAll"),
    );
  },
  Effect.provide(FileServiceLive),
);

export const editFileTool: AgentTool<TSchema, void | AppError> = {
  label: "edit_file",
  name: "edit_file",
  description:
    "Replace text in a file (unique match required unless replace_all=true). " +
    "Use replace_all=false for single replacement. Returns error if old_text matches 0 or 2+ times (unless replace_all=true).",
  parameters: toToolParameters(EditFileSchema),
  execute: async (_toolCallId, args) => {
    const typedArgs = args as unknown as EditFileArgs;
    return runFileEffect(editFile(typedArgs), () =>
      typedArgs.replace_all ? "Done: all occurrences replaced." : "Done: text replaced.",
    );
  },
};

const searchFiles = Effect.fnUntraced(
  function* (typedArgs: SearchFilesArgs) {
    const workspaceId = yield* requireWorkspaceId(typedArgs);
    const svc = yield* FileService;
    return yield* svc.searchFiles(
      workspaceId,
      pickArgs(typedArgs, "glob"),
      pickArgs(typedArgs, "content_pattern", "contentPattern") ?? null,
    );
  },
  Effect.provide(FileServiceLive),
);

export const searchFilesTool: AgentTool<TSchema, FileMatch[] | AppError> = {
  label: "search_files",
  name: "search_files",
  description:
    "Find files in workspace by glob pattern, optionally filtered by content substring (≤100 results). " +
    "Returns array of matches with path, line_number, and line_content.",
  parameters: toToolParameters(SearchFilesSchema),
  execute: async (_toolCallId, args) => {
    const typedArgs = args as unknown as SearchFilesArgs;
    return runFileEffect(searchFiles(typedArgs), (matches: FileMatch[]) => {
      if (matches.length === 0) {
        return "No matches found.";
      }
      return `Found ${matches.length} match(es):\n${matches
        .map(
          (m) =>
            `  ${m.path}${m.lineNumber != null ? `:${m.lineNumber}` : ""}${
              m.lineContent != null ? ` — ${m.lineContent}` : ""
            }`,
        )
        .join("\n")}`;
    });
  },
};

const deleteFile = Effect.fnUntraced(
  function* (typedArgs: DeleteFileArgs) {
    const workspaceId = yield* requireWorkspaceId(typedArgs);
    const svc = yield* FileService;
    return yield* svc.deleteFile(workspaceId, pickArgs(typedArgs, "path"));
  },
  Effect.provide(FileServiceLive),
);

export const deleteFileTool: AgentTool<TSchema, void | AppError> = {
  label: "delete_file",
  name: "delete_file",
  description:
    "Move a file to the recycle bin (recoverable, no permanent delete in V2). " +
    "Blocked extensions: .exe/.dll/.sys/.ini and other system files.",
  parameters: toToolParameters(DeleteFileSchema),
  execute: async (_toolCallId, args) => {
    const typedArgs = args as unknown as DeleteFileArgs;
    return runFileEffect(deleteFile(typedArgs), () => "Done: file moved to recycle bin.");
  },
};

/** 所有 file-tools 工具数组（向后兼容 — 调用方无 workspaceId 时仍可使用）。
 *
 *  绝大多数路径请用 `createFileTools(workspaceId)`,它会包装 execute 注入
 *  `workspace_id` 到 args(LLM 省略或 mock JSON 不带时)。`fileTools` 这个
 *  直导数组保留,供测试或一次性脚本调用 — 调用方必须自己在 args 里提供
 *  `workspace_id`,否则工具返回 `InvalidConfig` 错误。 */
export const fileTools: AgentTool<TSchema, unknown>[] = [
  readFileTool,
  writeFileTool,
  editFileTool,
  searchFilesTool,
  deleteFileTool,
];

/** 创建带 `workspace_id` 自动注入的 file tools 列表(T27)。
 *
 *  pi-agent-core 的 schema 校验在 `execute` 之前运行,因此我们无法在收到
 *  args 后再补 `workspace_id` — 必须**在 schema 校验之前**把 field 填好。
 *  包装层在 Agent 校验后的 execute 调用里,把 `provider.workspaceId` 注入
 *  args(若 LLM 自己传了,以 LLM 为准,允许覆盖)。
 *
 *  @param workspaceId - 当前 conversation 绑定的 workspace UUID。
 *                       若省略 / 空字符串,等价于 `fileTools`(工具接收
 *                       不带 workspace_id 的 args 时返回 InvalidConfig)。
 */
export function createFileTools(workspaceId?: string): AgentTool<TSchema, unknown>[] {
  const tools: AgentTool<TSchema, unknown>[] = [readFileTool, writeFileTool, editFileTool, searchFilesTool, deleteFileTool];
  if (!workspaceId) {
    return tools;
  }
  return tools.map((tool) => ({
    ...tool,
    execute: async (toolCallId: string, params: unknown, signal?: AbortSignal) => {
      // 若 LLM 已显式给 workspace_id / workspaceId,优先用 LLM 的(允许覆盖
      // 默认值 — 比如未来多 workspace 场景)。否则注入 runtime 提供的值。
      const args = (params && typeof params === "object"
        ? (params as Record<string, unknown>)
        : {}) as Record<string, unknown>;
      const alreadyHas = pickArgs(args, "workspace_id", "workspaceId");
      const finalArgs =
        typeof alreadyHas === "string" && alreadyHas.length > 0
          ? args
          : { ...args, workspace_id: workspaceId };
      return tool.execute(toolCallId, finalArgs, signal);
    },
  }));
}
