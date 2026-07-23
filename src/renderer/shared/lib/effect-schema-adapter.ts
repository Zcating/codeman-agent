//! effect-schema-adapter.ts — Effect Schema → Standard Schema V1 adapter
//! (per `@tanstack/solid-form` validators spec, see
//!  node_modules/.pnpm/@tanstack+form-core@*/dist/esm/standardSchemaValidator.d.ts).
//!
//! ## Why
//!
//! `@tanstack/solid-form` 的 `validators` 走
//! [Standard Schema V1](https://github.com/standard-schema/standard-schema) —
//! 官方支持 Zod / Valibot / ArkType / Yup,但 **Effect Schema 不实现 Standard Schema**。
//! 本文件提供 ~60 行的薄适配,让 Effect Schema 也能直接喂进 `form.Field` 的
//! `validators` slot。
//!
//! ## 用法
//!
//! ```tsx
//! import { effectSchema } from "@/shared/lib/effect-schema-adapter";
//! import { Schema } from "effect";
//!
//! const BaseUrlSchema = Schema.String.pipe(
//!   Schema.pattern(/^https?:\/\/.+/, { message: "Must be a valid URL" }),
//! );
//!
//! <form.Field
//!   name="baseUrl"
//   validators={{ onBlur: effectSchema(BaseUrlSchema) }}
//!   children={(field) => (
//!     <CodemanInput
//!       value={field().state.value}
//!       onValueChange={field().handleChange}
//!       onBlur={field().handleBlur}
//!       error={field().state.meta.errors[0]?.toString()}
//!     />
//!   )}
//! />
//! ```
//!
//! ## 设计
//!
//! - `Schema.validateEither(..., { errors: "all" })` — Either 不会 throw,`errors: "all"`
//!   让 `Schema.Struct` 收集每个 field 的 error 而不是默认的 "first",这对表单 UX 是
//!   关键 (否则用户改完 baseUrl 后 age 的 error 一直显示)。
//! - 递归扁平化 `Composite` + `Pointer` + `Refinement` + `Transformation` 节点 —
//!   Effect 校验失败时 Left 是单个 `ParseIssue`,但 `ParseIssue._tag === "Composite"`
//!   时 `.issues` 是 `SingleOrNonEmpty<ParseIssue>`,`Pointer` 携带 `path`,
//!   `Refinement` 携带内层 `issue`。
//! - Message 提取:Effect 的 `Refinement` / `Type` 节点本身不携带 `message` 字段 —
//!   message 注解在 `ast.annotations[MessageAnnotationId]`。用
//!   `AST.getMessageAnnotation(issue.ast)` 拿到 message 工厂函数,然后用 issue 实例
//!   调用,fallback 到 `issue.message` 字段 (Missing/Unexpected 才有) 或默认文案。
//! - 类型签名 `StandardSchemaV1<I, A>` 对齐 `Schema.Schema<A, I, R>` 的 I=input / A=output。

import { Either, ParseResult, Schema, SchemaAST, Option } from "effect";
type ParseIssue = ParseResult.ParseIssue;

// ─── Standard Schema V1 types (mirror from @tanstack/form-core/standardSchemaValidator) ───

/** Re-declared locally to avoid pulling internal types into our public API. */
export interface StandardSchemaV1Issue {
  readonly message: string;
  readonly path?:
    | ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>
    | undefined;
}

export type StandardSchemaV1Result<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<StandardSchemaV1Issue> };

export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: "effect";
    readonly validate: (
      value: unknown,
    ) => StandardSchemaV1Result<Output> | Promise<StandardSchemaV1Result<Output>>;
    readonly types?: { readonly input: Input; readonly output: Output };
  };
}

/**
 * Wrap an Effect Schema as a Standard Schema V1 validator.
 *
 * - `A` = output type (decoded)
 * - `I` = input type (encoded)
 * - `R` = requirements (we ignore; Standard Schema is sync-only)
 */
export function effectSchema<A, I, R>(
  schema: Schema.Schema<A, I, R>,
): StandardSchemaV1<I, A> {
  return {
    "~standard": {
      version: 1,
      vendor: "effect",
      validate: (value: unknown): StandardSchemaV1Result<A> => {
        // errors: "all" — collect every field error from a Struct, not just the first.
        const result: Either.Either<A, ParseIssue> = ParseResult.validateEither(
          schema,
          { errors: "all" },
        )(value);
        if (Either.isRight(result)) {
          return { value: result.right };
        }
        return { issues: flattenIssue(result.left, []) };
      },
      types: { input: undefined as unknown as I, output: undefined as unknown as A },
    },
  };
}

/**
 * Extract the first user-facing message from a Standard Schema V1 issues array.
 *
 * TanStack Form stores field errors as `unknown[]` (the `state.meta.errors` slot).
 * Our `effectSchema` adapter returns `StandardSchemaV1Issue` (`{ message: string; path? }`)
 * objects, but raw custom validators may return strings or arbitrary shapes.
 *
 * Tolerates:
 *   - `undefined` / empty array → returns `undefined`
 *   - plain string error → returns it
 *   - `{ message: string }` object → returns `.message`
 *   - anything else (number, null, object without `message`) → returns `undefined`
 *
 * @example
 *   firstErrorMessage([])                          // → undefined
 *   firstErrorMessage(["too short"])              // → "too short"
 *   firstErrorMessage([{ message: "bad url" }])   // → "bad url"
 */
export function firstErrorMessage(errors: ReadonlyArray<unknown>): string | undefined {
  const first = errors[0];
  if (typeof first === "string") {return first;}
  if (first && typeof first === "object" && "message" in first) {
    const m = (first as StandardSchemaV1Issue).message;
    if (typeof m === "string") {return m;}
  }
  return undefined;
}

// ─── Internal: flatten ParseIssue tree into flat StandardSchemaV1Issue[] ───

/**
 * Evaluate the message annotation result. Effect's runtime accepts both string
 * and function annotations; the function may return a string or a { message } object.
 * Returns undefined if the annotation shape is unrecognized.
 */
const evalAnnotation = (
  annotation: unknown,
  issue: ParseIssue,
): string | undefined => {
  if (typeof annotation === "string") {return annotation;}
  if (typeof annotation !== "function") {return undefined;}
  const result = annotation(issue);
  if (typeof result === "string") {return result;}
  if (typeof result === "object" && result !== null && "message" in result) {
    const m = (result as { message: unknown }).message;
    if (typeof m === "string") {return m;}
  }
  return undefined;
};

const fallbackMessage = (issue: ParseIssue): string =>
  `Invalid value (${issue._tag})`;

/**
 * Resolve the user-facing message for a ParseIssue.
 *
 * Priority:
 *   1. The AST's `MessageAnnotation` — what the user passed via `{ message: "..." }`
 *      on the schema. Only Type / Missing / Forbidden carry `.ast`; other leaf
 *      variants (e.g. Unexpected) use their direct `.message` field instead.
 *   2. The issue's own `message` field.
 *   3. Fallback: `"Invalid value (${_tag})"`.
 */
function resolveMessage(issue: ParseIssue): string {
  // 1. AST annotation (only for leaf variants that carry .ast).
  const ast: SchemaAST.AST | undefined = (() => {
    switch (issue._tag) {
      case "Type":
      case "Missing":
      case "Forbidden":
        return issue.ast as SchemaAST.AST;
      default:
        return undefined;
    }
  })();
  if (ast !== undefined) {
    const annotation = Option.getOrUndefined(SchemaAST.getMessageAnnotation(ast));
    if (annotation !== undefined) {
      const evaluated = evalAnnotation(annotation, issue);
      if (evaluated !== undefined) {return evaluated;}
    }
  }
  // 2. Issue's own message field
  const direct = (issue as { message?: unknown }).message;
  if (typeof direct === "string") {
    return direct;
  }
  // 3. Fallback
  return fallbackMessage(issue);
}

/**
 * Recursively walk a ParseIssue tree.
 * - Composite → descend into `.issues`
 * - Pointer → prefix `.path`, descend into `.issue`
 * - Refinement / Transformation → descend into `.issue`
 * - Leaf (Type / Missing / Unexpected / Forbidden) → emit one StandardSchemaV1Issue
 */
function flattenIssue(
  issue: ParseIssue,
  prefix: ReadonlyArray<PropertyKey>,
): StandardSchemaV1Issue[] {
  if (issue._tag === "Composite") {
    // `.issues` is `SingleOrNonEmpty<ParseIssue>` = ParseIssue | readonly NonEmptyArray<ParseIssue>.
    const issues = issue.issues;
    const children: ReadonlyArray<ParseIssue> = Array.isArray(issues)
      ? (issues as ReadonlyArray<ParseIssue>)
      : [issues as ParseIssue];
    return children.flatMap((child) => flattenIssue(child, prefix));
  }
  if (issue._tag === "Pointer") {
    const segs = Array.isArray(issue.path) ? issue.path : [issue.path];
    return flattenIssue(issue.issue, [...prefix, ...segs]);
  }
  if (issue._tag === "Refinement") {
    return flattenIssue(issue.issue, prefix);
  }
  if (issue._tag === "Transformation") {
    // Transformation wraps a child issue; no path or message of its own.
    return flattenIssue(issue.issue, prefix);
  }
  // Leaf: Type | Missing | Unexpected | Forbidden
  return [
    {
      message: resolveMessage(issue),
      path: prefix.length > 0 ? prefix : undefined,
    },
  ];
}