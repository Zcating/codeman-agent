import { Schema } from "effect";

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

export const SettingsSchema = Schema.Struct({
  providers: Schema.optional(Schema.Array(ProviderSchema)),
  schema_version: Schema.optional(Schema.Literal("1.5")),
  default_llm_provider_id: Schema.optional(Schema.String),
  user_language: Schema.Literal("zh", "en", "auto"),
  theme: Schema.Literal("light", "dark", "system"),
  start_at_login: Schema.Boolean,
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
  llm_providers: Schema.Array(Schema.Unknown), 
});

export type Settings = Schema.Schema.Type<typeof SettingsSchema>;

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

export const ApiKeySchema = Schema.String; 
