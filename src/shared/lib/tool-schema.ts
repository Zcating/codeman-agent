//! ADR-0025 Phase 3 PR 3 — Schema.Struct ↔ pi-ai TSchema 桥.
//!
//! pi-mono 的 `AgentTool<TParameters extends TSchema = TSchema>` 强制 typebox 的 `TSchema`
//! 类型符号。Effect 的 `Schema.Struct` 输出 AST；本 helper 用 `effect/JSONSchema.fromAST`
//! 把 AST 直接转 JSON Schema 结构（Draft 07），AJV 验证可用。运行时 AJV 看 JSON Schema 结构
//! （不区分来源）；类型层 `as unknown as TSchema` cast 是唯一必要的桥。
//!
//! ADR-0025.1 D-C 选择 `fromAST` 而非 `Schema.toJsonSchema` 的理由：前者直接读 AST 输出更接近
//! typebox 风格（绕过 `Schema.toJsonSchema` 的转换路径，规避 Effect annotation 在 `format` /
//! `$ref` 上的处理偏差）；AJV 兼容性更好。
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
