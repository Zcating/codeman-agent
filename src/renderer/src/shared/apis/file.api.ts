//! FileService domain — extracted from ipc.ts for domain split.

import { Effect, Layer, Context } from "effect";
import { invoke } from "@codeman-frontend/shared/apis/invoke.api";
import type { FileMatch } from "@codeman-frontend/shared/lib/types";
import type { AppError } from "@codeman-frontend/shared/lib/errors";

// ─── FileService tag ─────────────────────────────────────────

export class FileService extends Context.Tag("FileService")<
  FileService,
  {
    readonly readFile: (workspaceId: string, path: string) => Effect.Effect<string, AppError>;
    readonly writeFile: (
      workspaceId: string,
      path: string,
      content: string,
    ) => Effect.Effect<void, AppError>;
    readonly editFile: (
      workspaceId: string,
      path: string,
      oldText: string,
      newText: string,
      replaceAll: boolean,
    ) => Effect.Effect<void, AppError>;
    readonly searchFiles: (
      workspaceId: string,
      glob: string,
      contentPattern: string | null,
    ) => Effect.Effect<FileMatch[], AppError>;
    readonly deleteFile: (workspaceId: string, path: string) => Effect.Effect<void, AppError>;
  }
>() {}

// ─── FileService live layer ──────────────────────────────────

export const FileServiceLive = Layer.succeed(FileService, {
  readFile: (workspaceId: string, path: string) =>
    invoke<string>("readFile", { workspaceId, path }),

  writeFile: (workspaceId: string, path: string, content: string) =>
    invoke<void>("writeFile", { workspaceId, path, content }),

  editFile: (
    workspaceId: string,
    path: string,
    oldText: string,
    newText: string,
    replaceAll: boolean,
  ) =>
    invoke<void>("editFile", {
      workspaceId,
      path,
      oldText,
      newText,
      replaceAll,
    }),

  searchFiles: (workspaceId: string, glob: string, contentPattern: string | null) =>
    invoke<FileMatch[]>("searchFiles", {
      workspaceId,
      glob,
      contentPattern,
    }),

  deleteFile: (workspaceId: string, path: string) =>
    invoke<void>("deleteFile", { workspaceId, path }),
});
