//! D8 — Schema.Struct ↔ pi-mono `AgentTool` 桥.
//!
//! pi-mono 的 `AgentTool<TParameters extends TSchema = TSchema>` 强制 typebox 的
//! `TSchema` 类型符号。`execute: (id, params: Static<TParameters>, ...)` 用 TypeBox
//! 的 `Static<T>` 从 TSchema 反推参数类型（typebox 类型推导魔法）。
//!
//! 运行时：AST walker 把 Effect AST 直接映射到 TypeBox runtime 构造器（per
//! `SchemaToTypeBox<S>` 类型层同表的 D8-B 9 节点覆盖）。产物带 `Symbol.for("TypeBox.Kind")`
//! metadata，是真正的 TypeBox 对象（非 plain JSON Schema）。
//!
//! 为什么必须是真 TypeBox 对象？pi-mono 的
//! `@earendil-works/pi-ai/dist/utils/validation.js` 在 `validateToolArguments`
//! 内部用 `Object.getOwnPropertySymbols(parameters).includes(TYPEBOX_KIND)`
//! 切换两条不同的 coerce / 校验路径：
//!
//!   - 有 `[Kind]` symbol → 走 `Value.Convert(parameters, args)`（TypeBox-native
//!     coercion，含 default value / type coercion 完整逻辑）+ `Compile` 编译
//!   - 无 `[Kind]` symbol → 走自定义 `coerceWithJsonSchema`（plain JSON Schema
//!     兼容分支）+ 同样的 `Compile`
//!
//! 旧实现（D8-R，`JsonSchema.fromAST`）落在第二条路径。TypeBox 路径与
//! plain JSON Schema 路径的 coerce 行为不一致 —— 以 file-tools 当前 schema 现状
//! （无 default value / 无 transform）无可观测差异，但属于已存在的语义分歧。
//! 切到 walker 走第一条路径消除该分歧。
//!
//! 类型层（per D8-A / D8-B / D8-C）：
//! - `SchemaToTypeBox<S>` 把 `Schema.Struct` 的 value shape 映射到 TypeBox brand
//! - `Static<typeof toToolParameters(S)>` 自动推导 schema 的 value shape
//! - 调用方写 `AgentTool<typeof params, ...>` 后，execute 的 params 不再是 unknown
//!
//! Cast 范围：`as SchemaToTypeBox<S>` 现在是同形 cast（不再需要 `as unknown`
//! 跳板）—— walker 产物本身被 TS 推导为 `TObject<ShapeToTypeBox<A>>`，cast 仅
//! 是把 `TSchema` 窄化到具体 `SchemaToTypeBox<S>` 类型符号。
//!
//! 用法:
//!   const readParams = toToolParameters(ReadFileSchema);
//!   // readParams 编译期类型: Type.Object<{ workspaceId: TOptional<TString>, path: TString }>
//!   // Static<typeof readParams>: { workspaceId?: string; path: string }
//!   export const readFileTool: AgentTool<typeof readParams, string | AppError> = {
//!     parameters: readParams,
//!     execute: async (_, params) => { /* params: { workspaceId?: string; path: string } */ },
//!   };
import { Schema } from "effect";
import * as AST from "effect/SchemaAST";
import {
  Type,
  type TArray,
  type TBoolean,
  type TLiteral,
  type TNumber,
  type TObject,
  type TOptional,
  type TProperties,
  type TSchema,
  type TString,
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

// ============================================================================
// Runtime walker: Effect AST → TypeBox runtime object (D8-B 9-node coverage)
// ============================================================================

/**
 * Walk an Effect AST node and produce a corresponding TypeBox TSchema.
 *
 * Coverage mirrors the type-layer `PrimitiveToTypeBox` + `ShapeToTypeBox`:
 *
 * | AST `_tag`         | TypeBox                |
 * | ------------------ | ---------------------- |
 * | `StringKeyword`    | `Type.String()`        |
 * | `NumberKeyword`    | `Type.Number()`        |
 * | `BooleanKeyword`   | `Type.Boolean()`       |
 * | `Literal`          | `Type.Literal(v)`      | (TLiteralValue ⊂ string|number|boolean — null/bigint 抛错)
 * | `TupleType`        | `Type.Tuple(...)`      | (暂不处理 `rest`，file-tools 不用)
 * | `Union`            | `Type.Union(...)`      |
 * | `TypeLiteral`      | `Type.Object({...})`   | (TypeBox 自动从 `[OptionalKind]` symbol 推导 `required` 数组)
 *
 * Unsupported nodes (Refinement / Transformation / Suspend / TemplateLiteral /
 * Enums / Declaration / VoidKeyword / NeverKeyword / BigIntKeyword /
 * ObjectKeyword / AnyKeyword / UnknownKeyword / UniqueSymbol / SymbolKeyword /
 * IndexSignature) throw with a clear error so future tool schemas using them
 * fail loudly rather than silently producing wrong shapes.
 *
 * `UndefinedKeyword` is handled indirectly: `Schema.optional(S)` produces
 * `PropertySignature { type: Union([S, UndefinedKeyword]) }`. The TypeLiteral
 * case strips `UndefinedKeyword` from such Unions before walking, so the
 * runtime product is `TOptional<T>` (not `TOptional<TUnion<[T, TUndefined]>>`).
 *
 * `Type.Object({...})` auto-handles `required`: for each property, if value
 * is `TOptional<T>` (Type.Optional adds the `[OptionalKind]` symbol),
 * TypeBox strips it from the `required` array — so the walker does not pass
 * `required` explicitly.
 */

/**
 * Strip `UndefinedKeyword` members from a Union, returning the remaining
 * types. Used to peel off Effect's `Schema.optional(S)` representation
 * (`Union([S, UndefinedKeyword])`) so we get a single concrete schema to
 * wrap with `Type.Optional(...)`.
 *
 * If only one non-undefined member remains, return it directly. Otherwise
 * rebuild a Union AST via `AST.Union.make(...)`.
 */
function stripUndefined(node: AST.Union): AST.AST {
  const nonUndef = node.types.filter((t) => t._tag !== "UndefinedKeyword");
  if (nonUndef.length === 1) {return nonUndef[0]!;}
  return AST.Union.make(nonUndef);
}

function walkAST(node: AST.AST): TSchema {
  switch (node._tag) {
    case "StringKeyword":
      return Type.String();
    case "NumberKeyword":
      return Type.Number();
    case "BooleanKeyword":
      return Type.Boolean();
    case "Literal": {
      // TypeBox.Type.Literal accepts only string | number | boolean (TLiteralValue).
      // Effect's LiteralValue also includes null / bigint — those are not
      // representable in JSON Schema; fail loudly rather than silently drop precision.
      const v = node.literal;
      if (typeof v === "bigint" || v === null) {
        throw new Error(
          `toToolParameters: AST Literal "${String(v)}" is not representable in ` +
          `TypeBox (Type.Literal accepts only string|number|boolean).`,
        );
      }
      return Type.Literal(v);
    }
    case "TupleType": {
      // Effect represents `Schema.Array(S)` as TupleType with empty `elements`
      // and a single-element `rest` (variadic homogeneous tuple). Map that
      // directly to TypeBox's `Type.Array(...)`.
      if (node.elements.length === 0 && node.rest.length === 1) {
        return Type.Array(walkAST(node.rest[0]!.type));
      }
      if (node.rest.length > 0) {
        throw new Error(
          `toToolParameters: TupleType with multiple \`rest\` elements is not supported.`,
        );
      }
      const items = node.elements.map((e) => walkAST(e.type)) as [
        TSchema,
        ...TSchema[],
      ];
      return Type.Tuple(items);
    }
    case "Union":
      return Type.Union(
        node.types.map(walkAST) as [TSchema, TSchema, ...TSchema[]],
      );
    case "TypeLiteral": {
      const properties: TProperties = {};
      for (const prop of node.propertySignatures) {
        // Effect's `Schema.optional(S)` AST-level: PropertySignature with
        // isOptional=true AND `type = Union([S, UndefinedKeyword])`. Strip the
        // UndefinedKeyword wrapper here so the runtime product is `TOptional<T>`
        // instead of `TOptional<TUnion<[T, TUndefined]>>` — the latter would
        // conflict with Type.Object's required-array computation (it sees a
        // non-TOptional property and incorrectly includes the field in
        // `required`).
        const innerType =
          prop.isOptional && prop.type._tag === "Union"
            ? stripUndefined(prop.type as AST.Union)
            : prop.type;
        const valueSchema = walkAST(innerType);
        properties[String(prop.name)] = prop.isOptional
          ? Type.Optional(valueSchema)
          : valueSchema;
      }
      return Type.Object(properties);
    }
    default:
      throw new Error(
        `toToolParameters: unsupported AST node "${node._tag}". See D8-B for the supported node list, or extend the walker.`
      );
  }
}

// ============================================================================
// Public API
// ============================================================================

/** 把 Effect `Schema.Struct` 桥接到 pi-mono `AgentTool` 接受的 TypeBox schema. */
export function toToolParameters<S extends Schema.Struct<any>>(
  schema: S,
): SchemaToTypeBox<S> {
  // Same-shape cast: walker output is already a TSchema that TypeScript
  // resolves to TObject<ShapeToTypeBox<valueShape>>. The cast narrows from
  // the broader TSchema union to the specific SchemaToTypeBox<S> brand —
  // no `unknown` hop (replaces D8-R `as unknown as SchemaToTypeBox<S>`).
  return walkAST(schema.ast) as SchemaToTypeBox<S>;
}