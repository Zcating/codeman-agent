//! File Tools — 5 个 AgentTool 定义（V2 文件 IO，ADR-0013）。
//!
//! T11-T15：read_file / write_file / edit_file / search_files / delete_file。
//! 每个工具调用 FileService 方法，FileService 通过 Effect.provide(Layer) 提供（Effect v3 API）。

import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-ai";
import { Effect, Exit } from "effect";
import { FileService, FileServiceLive } from "../../../shared/lib/tauri";
import type { AppError, FileMatch } from "../../../shared/lib/types";

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
// Tool Schemas
// ============================================================================

const ReadFileSchema = Type.Object({
  workspace_id: Type.String(),
  path: Type.String(),
});
type ReadFileArgs = Static<typeof ReadFileSchema>;

const WriteFileSchema = Type.Object({
  workspace_id: Type.String(),
  path: Type.String(),
  content: Type.String(),
});
type WriteFileArgs = Static<typeof WriteFileSchema>;

const EditFileSchema = Type.Object({
  workspace_id: Type.String(),
  path: Type.String(),
  old_text: Type.String(),
  new_text: Type.String(),
  replace_all: Type.Boolean(),
});
type EditFileArgs = Static<typeof EditFileSchema>;

const SearchFilesSchema = Type.Object({
  workspace_id: Type.String(),
  glob: Type.String(),
  content_pattern: Type.Optional(Type.String()),
});
type SearchFilesArgs = Static<typeof SearchFilesSchema>;

const DeleteFileSchema = Type.Object({
  workspace_id: Type.String(),
  path: Type.String(),
});
type DeleteFileArgs = Static<typeof DeleteFileSchema>;

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
      err = { kind: "Unknown" as const, message: String(cause) };
    }
    return {
      content: [
        {
          type: "text",
          // 含 kind 标签:让 SandboxViolation / NotFound / Unknown 等错误种类在
          // text payload 里可见(tool 消费方通常只看 text 不看 details)。
          text: `Error${"kind" in err ? ` (${(err as { kind: string }).kind})` : ""}: ${
            "message" in err ? err.message : JSON.stringify(err)
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

export const readFileTool: AgentTool<typeof ReadFileSchema, string | AppError> = {
  label: "read_file",
  name: "read_file",
  description:
    "Read a file from a workspace directory (UTF-8, ≤10MB). Returns the full file content.",
  parameters: ReadFileSchema,
  execute: async (_toolCallId, args: ReadFileArgs) => {
    const program = Effect.gen(function* () {
      const svc = yield* FileService;
      return yield* svc.readFile(args.workspace_id, args.path);
    }).pipe(Effect.provide(FileServiceLive));
    return runFileEffect(program, (content) => `Content:\n${content}`);
  },
};

export const writeFileTool: AgentTool<typeof WriteFileSchema, void | AppError> = {
  label: "write_file",
  name: "write_file",
  description:
    "Write content to a file in a workspace (atomic write, ≤10MB). Creates or overwrites.",
  parameters: WriteFileSchema,
  execute: async (_toolCallId, args: WriteFileArgs) => {
    const program = Effect.gen(function* () {
      const svc = yield* FileService;
      return yield* svc.writeFile(args.workspace_id, args.path, args.content);
    }).pipe(Effect.provide(FileServiceLive));
    return runFileEffect(program, () => "Done: file written successfully.");
  },
};

export const editFileTool: AgentTool<typeof EditFileSchema, void | AppError> = {
  label: "edit_file",
  name: "edit_file",
  description:
    "Replace text in a file (unique match required unless replace_all=true). " +
    "Use replace_all=false for single replacement. Returns error if old_text matches 0 or 2+ times (unless replace_all=true).",
  parameters: EditFileSchema,
  execute: async (_toolCallId, args: EditFileArgs) => {
    const program = Effect.gen(function* () {
      const svc = yield* FileService;
      return yield* svc.editFile(
        args.workspace_id,
        args.path,
        args.old_text,
        args.new_text,
        args.replace_all,
      );
    }).pipe(Effect.provide(FileServiceLive));
    return runFileEffect(program, () =>
      args.replace_all ? "Done: all occurrences replaced." : "Done: text replaced.",
    );
  },
};

export const searchFilesTool: AgentTool<typeof SearchFilesSchema, FileMatch[] | AppError> = {
  label: "search_files",
  name: "search_files",
  description:
    "Find files in workspace by glob pattern, optionally filtered by content substring (≤100 results). " +
    "Returns array of matches with path, line_number, and line_content.",
  parameters: SearchFilesSchema,
  execute: async (_toolCallId, args: SearchFilesArgs) => {
    const program = Effect.gen(function* () {
      const svc = yield* FileService;
      return yield* svc.searchFiles(args.workspace_id, args.glob, args.content_pattern ?? null);
    }).pipe(Effect.provide(FileServiceLive));
    return runFileEffect(program, (matches: FileMatch[]) => {
      if (matches.length === 0) return "No matches found.";
      return `Found ${matches.length} match(es):\n${matches
        .map(
          (m) =>
            `  ${m.path}${m.line_number != null ? `:${m.line_number}` : ""}${
              m.line_content != null ? ` — ${m.line_content}` : ""
            }`,
        )
        .join("\n")}`;
    });
  },
};

export const deleteFileTool: AgentTool<typeof DeleteFileSchema, void | AppError> = {
  label: "delete_file",
  name: "delete_file",
  description:
    "Move a file to the recycle bin (recoverable, no permanent delete in V2). " +
    "Blocked extensions: .exe/.dll/.sys/.ini and other system files.",
  parameters: DeleteFileSchema,
  execute: async (_toolCallId, args: DeleteFileArgs) => {
    const program = Effect.gen(function* () {
      const svc = yield* FileService;
      return yield* svc.deleteFile(args.workspace_id, args.path);
    }).pipe(Effect.provide(FileServiceLive));
    return runFileEffect(program, () => "Done: file moved to recycle bin.");
  },
};

/** 所有 file-tools 工具数组（供 runtime 注册） */
export const fileTools: AgentTool<any, any>[] = [
  readFileTool,
  writeFileTool,
  editFileTool,
  searchFilesTool,
  deleteFileTool,
];
