//! ADR-0025 Phase 3 PR 4 — file-tools Branded ID: FilePath.
//!
//! FilePath 是 file-tools feature 专用，留在本 feature lib/schemas.ts（ADR-0025 D6）。
//! Rust sandbox 层有更严格的 path validation（无 .. 不出 workspace root 等），
//! 这里只做最薄一层 brand + 字符串包含 ".." 的快速拒绝（节省 IPC 往返）。
//!
//! 用法:
//!   const fp = FilePathSchema.make(args.path);  // LLM args → branded
//!   await FileService.readFile(workspaceId, fp); // 进入 IPC
import { Schema } from "effect";

/** Effect Schema: branded string with traversal guard. */
export const FilePathSchema = Schema.String.pipe(
  Schema.filter((s) => !s.includes(".."), {
    message: () => "Path traversal ('..') not allowed",
  }),
  Schema.brand("FilePath"),
);

/** Branded ID type. Compile-time distinct from `string`. */
export type FilePath = Schema.Schema.Type<typeof FilePathSchema>;
