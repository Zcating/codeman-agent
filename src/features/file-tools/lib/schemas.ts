//! ADR-0025 Phase 3 PR 4 — file-tools Branded ID: FilePath.
//!
//! FilePath 是 file-tools feature 专用，留在本 feature lib/schemas.ts（ADR-0025 D6）。
//! Rust sandbox 层有更严格的 path validation（无 .. 不出 workspace root 等），
//! 这里只做最薄一层 brand + 路径分量 ".." 拒绝（节省 IPC 往返）。
//!
//! 用法:
//!   const fp = FilePathSchema.make(args.path);  // LLM args → branded
//!   await FileService.readFile(workspaceId, fp); // 进入 IPC
import { Schema } from "effect";

/**
 * Effect Schema: branded string with **component-level** traversal guard.
 *
 * Reject only when `..` appears as a WHOLE path component (after splitting on
 * `/` and `\`). Substring matches like `/foo/..bar/baz` are accepted because
 * the Rust sandbox does strict component validation on the Rust side; this
 * thin client-side filter only saves IPC round-trips for obvious traversal.
 *
 * (Review feedback J4: previous `!s.includes("..")` over-rejected legitimate
 * filenames like `...weird.txt` and `/foo/..bar/baz`.)
 */
export const FilePathSchema = Schema.String.pipe(
  Schema.filter(
    (s) => !s.split(/[\\/]+/).some((seg) => seg === ".."),
    { message: () => "Path component '..' is not allowed" },
  ),
  Schema.brand("FilePath"),
);

/** Branded ID type. Compile-time distinct from `string`. */
export type FilePath = Schema.Schema.Type<typeof FilePathSchema>;
