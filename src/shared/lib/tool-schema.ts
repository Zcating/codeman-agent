//! ADR-0025 Phase 3 PR 3 — Schema.Struct ↔ pi-ai TSchema 桥.
//!
//! pi-mono 的 `AgentTool<TParameters extends TSchema = TSchema>` 强制 typebox 的 `TSchema`
//! 类型符号。Effect 的 `Schema.Struct` 输出 JSON Schema 结构（Draft 07），AJV 验证可用，
//! 但 TS 层面不是 `TSchema`。本 helper 把 `Schema.toJsonSchema(s)` 强转 `TSchema` ——
//! 这是 typebox/SPI 兼容的事实标准做法。
//!
//! 运行时 AJV 看 JSON Schema 结构（不区分来源）；类型层 cast 是唯一必要的桥。
//!
//! 用法:
//!   const ReadFileSchema = Schema.Struct({ workspace_id: Schema.optional(Schema.String), path: Schema.String });
//!   const readFileTool: AgentTool<TSchema, string | AppError> = {
//!     parameters: toToolParameters(ReadFileSchema),
//!     ...
//!   };
import { Schema } from "effect";
import * as JsonSchema from "effect/JSONSchema";
import type { TSchema } from "@sinclair/typebox";

/** 把 Effect `Schema.Struct` 桥接到 pi-ai `AgentTool` 接受的 `TSchema`。 */
export function toToolParameters<S extends Schema.Struct<any>>(schema: S): TSchema {
  return JsonSchema.fromAST(schema.ast, { definitions: {} }) as unknown as TSchema;
}
