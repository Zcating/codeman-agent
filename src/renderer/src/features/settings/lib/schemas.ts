import { Schema } from "effect";

const ProviderLlmSchema = Schema.Struct({
  defaultModel: Schema.String,
  baseUrl: Schema.String,
  apiType: Schema.Literal("anthropic-messages", "openai-chat"),
  models: Schema.Array(Schema.Struct({
    id: Schema.String,
    label: Schema.String,
    contextWindow: Schema.optional(Schema.Number),
    deprecated: Schema.Boolean,
    thinking: Schema.optional(Schema.Boolean),
  })),
  modelsEndpoint: Schema.optional(Schema.String),
});

export const ProviderSchema = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  comment: Schema.optional(Schema.String),
  apiKey: Schema.String,
  llm: ProviderLlmSchema,
});

export type Provider = Schema.Schema.Type<typeof ProviderSchema>;

export const SettingsSchema = Schema.Struct({
  providers: Schema.optional(Schema.Array(ProviderSchema)),
  schemaVersion: Schema.optional(Schema.Literal("1.5")),
  defaultLlmProviderId: Schema.optional(Schema.String),
  userLanguage: Schema.Literal("zh", "en", "auto"),
  theme: Schema.Literal("light", "dark", "system"),
  startAtLogin: Schema.Boolean,
  window: Schema.Struct({
    rememberPosition: Schema.Boolean,
    rememberSize: Schema.Boolean,
    defaultSize: Schema.Struct({ width: Schema.Number, height: Schema.Number }),
    minSize: Schema.Struct({ width: Schema.Number, height: Schema.Number }),
  }),
  systemPrompt: Schema.Struct({
    default: Schema.String,
    userCanEdit: Schema.Boolean,
  }),
  conversations: Schema.Struct({
    autoArchiveAfterDays: Schema.Number,
    maxHistory: Schema.Number,
  }),
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
