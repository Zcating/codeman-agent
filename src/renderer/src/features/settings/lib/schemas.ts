//! ADR-0025 Phase 3 PR 4 — settings domain schemas.
//!
//! Mirror of `Provider` / `Settings` interfaces in `src/shared/lib/types.ts` (TS 镜像）。
//! 校验逻辑：src/main/settings-schema.ts 在 Rust-IPC 边界把关；本文件提供
//! TS 层入口（外部 JSON 反序列化、runtime validation）的 Schema。
//!
//! 拒绝理由（"electron-side Zod 镜像对齐" 的 ADR-0025 误解修正）：
//! electron 侧只有 `src/main/settings-schema.ts`（普通 JSON schema），
//! 无 Zod。本文件与该 JSON schema 字段一一对齐即可，不假设存在跨进程 Zod bridge。
import { Schema } from "effect";

// ============================================================================
// Provider (TS mirror of types.ts:26-32)
// ============================================================================

const ProviderLlmSchema = Schema.Struct({
  default_model: Schema.String,
  base_url: Schema.String,
  api_type: Schema.Literal("anthropic-messages", "openai-chat"),
  models: Schema.Array(Schema.Struct({
    id: Schema.String,
    label: Schema.String,
    deprecated: Schema.Boolean,
    thinking: Schema.optional(Schema.Boolean),
  })),
  models_endpoint: Schema.optional(Schema.String),
});

export const ProviderSchema = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  enabled: Schema.Boolean,
  api_key: Schema.String,
  llm: ProviderLlmSchema,
});

export type Provider = Schema.Schema.Type<typeof ProviderSchema>;

// ============================================================================
// Settings (TS mirror of types.ts:38-52; field-by-field with optional defaults)
// ============================================================================

export const SettingsSchema = Schema.Struct({
  providers: Schema.optional(Schema.Array(ProviderSchema)),
  schema_version: Schema.optional(Schema.Literal("1.5")),
  default_llm_provider_id: Schema.optional(Schema.String),
  user_language: Schema.Literal("zh", "en", "auto"),
  theme: Schema.Literal("light", "dark", "system"),
  start_at_login: Schema.Boolean,
  // WindowSettings / SystemPromptSettings / ConversationSettings shapes mirrored
  // from `src/shared/lib/types.ts`. Each is a typed Schema.Struct so partial /
  // malformed entries fail at decode time (was `Schema.Struct({})`).
  window: Schema.Struct({
    remember_position: Schema.Boolean,
    remember_size: Schema.Boolean,
    default_size: Schema.Struct({ width: Schema.Number, height: Schema.Number }),
    min_size: Schema.Struct({ width: Schema.Number, height: Schema.Number }),
  }),
  system_prompt: Schema.Struct({
    default: Schema.String,
    user_can_edit: Schema.Boolean,
  }),
  conversations: Schema.Struct({
    auto_archive_after_days: Schema.Number,
    max_history: Schema.Number,
  }),
  llm_providers: Schema.Array(Schema.Unknown), // deprecated, kept for back-compat
});

export type Settings = Schema.Schema.Type<typeof SettingsSchema>;

// ─── Per-field validation schemas (for ProviderCard's @tanstack/solid-form) ─────
// Originally inline in provider-card.tsx:56-66. Moved here so that
// "domain config (Provider / Settings) 在 features/settings/lib/schemas.ts".

/**
 * Attach a custom error message to any Schema via the standard message annotation.
 *
 * Uses the canonical `.annotations({ message: () => "..." })` method form — this is
 * the typed-clean way to attach a custom error message to a refinement. Effect's
 * TS signature requires a function `() => string`, which is also the runtime shape
 * `SchemaAST.getMessageAnnotation(ast)` expects (per our adapter's `resolveMessage`
 * which already handles both string and function forms at runtime).
 *
 * Replaces the prior `{ message: "..." } as never` cast that hid the type gap.
 */
export const withMessage = <A, I, R>(
  schema: Schema.Schema<A, I, R>,
  message: string,
): Schema.Schema<A, I, R> =>
  schema.annotations({ message: () => message });

export const BaseUrlSchema = withMessage(
  Schema.String.pipe(Schema.pattern(/^https?:\/\/.+/)),
  "Base URL must start with http:// or https://",
);

export const ModelSchema = withMessage(
  Schema.String.pipe(Schema.minLength(1)),
  "Model is required",
);

export const ApiKeySchema = Schema.String; // 不强校验 (mock provider 可空)
