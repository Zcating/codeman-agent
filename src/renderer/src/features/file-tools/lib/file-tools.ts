import { Schema } from "effect";
import { toToolParameters } from "@codeman-frontend/shared/lib/tool-schema";
import type { Static, TSchema } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Effect, Exit } from "effect";
import { FileApi, FileApiLive } from "@codeman-frontend/shared/apis";
import { InvalidConfig, Unknown, type AppError } from "@codeman-frontend/shared/lib/errors";
import type { FileMatch } from "@codeman-frontend/shared/lib/types";





interface TextContent {
  type: "text";
  text: string;
}

interface AgentToolResult<T> {
  content: TextContent[];
  details: T;
}
function pickArgs<T extends Record<string, unknown>, K extends keyof T>(
  args: T,
  key: K,
): T[K] {
  return args[key];
}


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






export const workspaceIdField = Schema.optional(Schema.String);




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





const readFile = Effect.fn(
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

const writeFile = Effect.fn(
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

const editFile = Effect.fn(
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

const searchFiles = Effect.fn(
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

const deleteFile = Effect.fn(
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


export const fileTools: AgentTool<TSchema, unknown>[] = [
  readFileTool,
  writeFileTool,
  editFileTool,
  searchFilesTool,
  deleteFileTool,
];


export function createFileTools(workspaceId?: string): AgentTool<TSchema, unknown>[] {
  const tools: AgentTool<TSchema, unknown>[] = [readFileTool, writeFileTool, editFileTool, searchFilesTool, deleteFileTool];
  if (!workspaceId) {
    return tools;
  }
  return tools.map((tool) => ({
    ...tool,
    execute: async (toolCallId: string, params: unknown, signal?: AbortSignal) => {
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
