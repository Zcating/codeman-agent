import { Schema } from "effect";


const ModelMetaStruct = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  contextWindow: Schema.optional(Schema.Number),
  deprecated: Schema.optional(Schema.Boolean),
  thinking: Schema.optional(Schema.Boolean),
});

const ProviderBillingStruct = Schema.Struct({
  kind: Schema.Literal("balance", "plan_quota"),
});

const ProviderLlmStruct = Schema.Struct({
  defaultModel: Schema.String,
  baseUrl: Schema.String,
  apiType: Schema.Literal("anthropic-messages"),
  contextWindow: Schema.optional(Schema.Number),
  models: Schema.Array(ModelMetaStruct),
  modelsEndpoint: Schema.String,
});

const ProviderStruct = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  enabled: Schema.Boolean,
  apiKey: Schema.String,
  llm: ProviderLlmStruct,
  billing: Schema.optional(ProviderBillingStruct),
});

export const SettingStruct = Schema.Struct({
  schemaVersion: Schema.Literal("1.5"),
  providers: Schema.Array(ProviderStruct),
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
  enabledSkills: Schema.optional(Schema.Array(Schema.String)),
});


export type ModelMeta = Schema.Schema.Type<typeof ModelMetaStruct>;
export type ProviderBilling = Schema.Schema.Type<typeof ProviderBillingStruct>;
export type ProviderLlm = Schema.Schema.Type<typeof ProviderLlmStruct>;
export type Provider = Schema.Schema.Type<typeof ProviderStruct>;
export type Settings = Schema.Schema.Type<typeof SettingStruct>;


const MINIMAX_BASE_URL = "https://api.minimaxi.com/anthropic";
const MINIMAX_MODELS_ENDPOINT = "https://api.minimaxi.com/v1/models";

const MINIMAX_DEFAULT_MODEL = "MiniMax-M2.5-highspeed";

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: "1.5",
  providers: [
    {
      id: "minimax",
      label: "MiniMax",
      enabled: true,
      apiKey: "",
      llm: {
        defaultModel: MINIMAX_DEFAULT_MODEL,
        baseUrl: MINIMAX_BASE_URL,
        apiType: "anthropic-messages",
        contextWindow: 200_000,
        models: [
          {
            id: MINIMAX_DEFAULT_MODEL,
            label: MINIMAX_DEFAULT_MODEL,
            contextWindow: 200_000,
            deprecated: false,
            thinking: false,
          },
        ],
        modelsEndpoint: MINIMAX_MODELS_ENDPOINT,
      },
      billing: { kind: "plan_quota" },
    },
  ],
  defaultLlmProviderId: "minimax",
  userLanguage: "auto",
  theme: "system",
  startAtLogin: false,
  window: {
    rememberPosition: true,
    rememberSize: true,
    defaultSize: { width: 800, height: 600 },
    minSize: { width: 600, height: 400 },
  },
  systemPrompt: { default: "", userCanEdit: true },
  conversations: { autoArchiveAfterDays: 30, maxHistory: 1000 },
  enabledSkills: ["commit-helper", "code-review", "explain-error", "summarize"],
};

export { sanitize } from "./sanitize";
