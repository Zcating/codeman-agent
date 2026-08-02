import { Schema } from "effect";


const ThinkingLevelStruct = Schema.Literal("off", "minimal", "low", "medium", "high", "xhigh");

const SubAgentConfigStruct = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  systemPrompt: Schema.String,
  modelId: Schema.String,
  thinkingLevel: ThinkingLevelStruct,
  allowedTools: Schema.Array(Schema.String),
  enabled: Schema.Boolean,
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
});

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
  subAgents: Schema.optional(Schema.Array(SubAgentConfigStruct)),
});


export type ModelMeta = Schema.Schema.Type<typeof ModelMetaStruct>;
export type ProviderBilling = Schema.Schema.Type<typeof ProviderBillingStruct>;
export type ProviderLlm = Schema.Schema.Type<typeof ProviderLlmStruct>;
export type Provider = Schema.Schema.Type<typeof ProviderStruct>;
export type Settings = Schema.Schema.Type<typeof SettingStruct>;
export type SubAgentConfig = Schema.Schema.Type<typeof SubAgentConfigStruct>;
export type ThinkingLevel = Schema.Schema.Type<typeof ThinkingLevelStruct>;