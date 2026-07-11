//! ADR-0025 D8 — Schema.Struct ↔ pi-mono `AgentTool` 桥.
//!
//! pi-mono 的 `AgentTool<TParameters extends TSchema = TSchema>` 强制 typebox 的
//! `TSchema` 类型符号。`execute: (id, params: Static<TParameters>, ...)` 用 TypeBox
//! 的 `Static<T>` 从 TSchema 反推参数类型（typebox 类型推导魔法）。
//!
//! 运行时（per ADR-0025.1 D-C）：`effect/JSONSchema.fromAST` 把 Effect AST 转
//! JSON Schema（Draft 07）。产物给 pi-mono AJV 验证，与 `Type.Object(...)` 产物
//! 验证结果一致（AJV 看 JSON Schema 结构，不区分来源）。
//!
//! 类型层（per ADR-0025 D8-A / D8-B / D8-C）：
//! - `SchemaToTypeBox<S>` 把 `Schema.Struct` 的 value shape 映射到 TypeBox brand
//! - `Static<typeof toToolParameters(S)>` 自动推导 schema 的 value shape
//! - 调用方写 `AgentTool<typeof params, ...>` 后，execute 的 params 不再是 unknown
//!
//! Cast 范围：`as unknown as SchemaToTypeBox<S>` 是 type-layer 声明 —— runtime 值的
//! JSON Schema 结构跟 `Type.Object(...)` 产物结构相同，只是没有 `[Kind]` /
//! `'static'` TypeBox compile-time markers。AJV 不区分。
//!
//! 用法:
//!   const readParams = toToolParameters(ReadFileSchema);
//!   // readParams 编译期类型: Type.Object<{ workspace_id: TOptional<TString>, path: TString }>
//!   // Static<typeof readParams>: { workspace_id?: string; path: string }
//!   export const readFileTool: AgentTool<typeof readParams, string | AppError> = {
//!     parameters: readParams,
//!     execute: async (_, params) => { /* params: { workspace_id?: string; path: string } */ },
//!   };
import { Schema } from "effect";
import * as JsonSchema from "effect/JSONSchema";
import {
  type TString,
  type TNumber,
  type TBoolean,
  type TLiteral,
  type TOptional,
  type TArray,
  type TObject,
} from "@sinclair/typebox";

// ============================================================================
// Type layer: Effect Schema value shape → TypeBox leaf brands (D8-B / D8-C)
// ============================================================================

/**
 * Map a TypeScript primitive to its TypeBox leaf brand.
 * - `string | undefined` (from `a?: string`) → TString (optionality is preserved
 *   by the outer mapped type via keyof)
 * - `ReadonlyArray<string>` (Effect's `Schema.Array(Schema.String)`) → TArray<TString>
 * - string/number/boolean literal → TLiteral<L>
 * Unsupported primitives resolve to `never` (fail-fast at the call site).
 */
type PrimitiveToTypeBox<V> = V extends string
  ? string extends V
    ? TString
    : V extends infer L
      ? L extends string | number | boolean
        ? TLiteral<L>
        : never
      : TString
  : V extends number
    ? number extends V
      ? TNumber
      : V extends infer L
        ? L extends number
          ? TLiteral<L>
          : never
        : TNumber
    : V extends boolean
      ? boolean extends V
        ? TBoolean
        : V extends infer L
          ? L extends boolean
            ? TLiteral<L>
            : never
          : TBoolean
      : V extends ReadonlyArray<string>
        ? TArray<TString>
        : never;

/**
 * Split T into required and optional keys. `{} extends Pick<T, K>` is the
 * canonical TS trick to test optionality: if K is optional, `Pick<T, K>`
 * accepts `{}`, so `{} extends Pick<T, K>` is true.
 */
type RequiredKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : K;
}[keyof T];
type OptionalKeys<T> = Exclude<keyof T, RequiredKeys<T>>;

/**
 * Walk an Effect Schema's value shape (`Schema.Schema.Type<S>`) and produce the
 * corresponding TypeBox TProperties.
 *
 * - Each property's value type is mapped via `PrimitiveToTypeBox`.
 * - Optional fields are wrapped with `TOptional<...>` (NO `?` modifier on the
 *   mapped property) so TypeBox's `OptionalPropertyKeys` helper detects them.
 *   A bare `?` would also make TypeBox's `T["K"]` access yield `T | undefined`,
 *   which leaks into `Static<T>` as `| undefined` and produces `{a?:
 *   string | undefined}` instead of the expected `{a?: string}`.
 * - `-readonly` strips the readonly modifier that mapped types preserve by
 *   default — Effect's `Schema.Schema.Type<...>` returns `{readonly a: string}`
 *   for a `readonly` struct, and the test expects plain `{a: string}`.
 */
type ShapeToTypeBox<T> = {
  -readonly [K in RequiredKeys<T>]: PrimitiveToTypeBox<T[K]>;
} & {
  -readonly [K in OptionalKeys<T>]: TOptional<PrimitiveToTypeBox<T[K]>>;
};

/** Top-level: Schema.Struct → Type.Object<ShapeToTypeBox<valueShape>> brand. */
export type SchemaToTypeBox<S extends Schema.Struct<any>> = S extends Schema.Schema<
  infer A,
  infer _I,
  infer _R
>
  ? TObject<ShapeToTypeBox<A>>
  : never;

/** 把 Effect `Schema.Struct` 桥接到 pi-mono `AgentTool` 接受的 TypeBox schema. */
export function toToolParameters<S extends Schema.Struct<any>>(
  schema: S,
): SchemaToTypeBox<S> {
  return JsonSchema.fromAST(schema.ast, {
    definitions: {},
  }) as unknown as SchemaToTypeBox<S>;
}