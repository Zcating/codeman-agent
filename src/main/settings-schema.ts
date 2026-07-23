// T4a — src/main/settings-schema.ts: Settings schema (canonical V1.5 / camelCase) + sanitize.
//
// Ports src-tauri/src/settings.rs to TypeScript. Settings persist via
// electron-store (T3 wires readSettings/writeSettings to IPC). Per
// ADR-0024 D10 (V3.1 amend): V15 fields use camelCase on disk and in IPC
// payload.
//
// V0 historical shape is no longer supported — disk must contain V1.5
// camelCase or loadSettings() falls back to DEFAULT_SETTINGS.

import { Schema } from "effect";

// ─── V15 Schema definitions (per src/AGENTS.md:52) ────────────────

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
  /** ADR-0011: V1 only supports anthropic-messages protocol */
  apiType: Schema.Literal("anthropic-messages"),
  models: Schema.Array(ModelMetaStruct),
  modelsEndpoint: Schema.String,
});

const ProviderStruct = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  enabled: Schema.Boolean,
  /** ADR-0015: plaintext in Settings JSON */
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
  // V3.1 ADR-0031: 已启用的 skill 名字列表 (按名字, 不含整个 manifest)。
  // 用于 runtime 在 system prompt 注入 <available_skills>...</available_skills> 段。
  enabledSkills: Schema.optional(Schema.Array(Schema.String)),
});

// ─── Derived types (preserves downstream `import type { Settings }`) ──

export type ModelMeta = Schema.Schema.Type<typeof ModelMetaStruct>;
export type ProviderBilling = Schema.Schema.Type<typeof ProviderBillingStruct>;
export type ProviderLlm = Schema.Schema.Type<typeof ProviderLlmStruct>;
export type Provider = Schema.Schema.Type<typeof ProviderStruct>;
export type Settings = Schema.Schema.Type<typeof SettingStruct>;

// ─── Constants ──────────────────────────────────────────────────

const MIN_SIZE_WIDTH = 100;
const MIN_SIZE_HEIGHT = 100;
const MIN_AUTO_ARCHIVE_DAYS = 1;
const MIN_MAX_HISTORY = 10;
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
        // Pre-populate with the default model so the LLM picker has at least
        // one option out of the box (matches app.store.ts default).
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
  // V3.1 ADR-0031: 默认启用全部 4 个 ship-with-app Skills
  enabledSkills: ["commit-helper", "code-review", "explain-error", "summarize"],
};

// ─── sanitize() ──────────────────────────────────────────────────

/**
 * Clamp settings to documented invariants. Per ADR-0024 amendment: V15 fields
 * use camelCase on disk and in IPC payload.
 * Uses Schema.decodeUnknownEither for input validation — falls back to
 * DEFAULT_SETTINGS on parse failure.
 */
export function sanitize(input: Partial<Settings>): Settings {
  // Validate input via Schema. Falls back to DEFAULT_SETTINGS on Left.
  const decoded = Schema.decodeUnknownEither(SettingStruct)(input);
  const safe: Settings =
    decoded._tag === "Right"
      ? (decoded.right as Settings)
      : DEFAULT_SETTINGS;

  const mergedWindow = {
    ...DEFAULT_SETTINGS.window,
    ...(safe.window ?? {}),
    minSize: {
      ...DEFAULT_SETTINGS.window.minSize,
      ...((safe.window ?? {}).minSize ?? {}),
    },
    defaultSize: {
      ...DEFAULT_SETTINGS.window.defaultSize,
      ...((safe.window ?? {}).defaultSize ?? {}),
    },
  };

  const mergedConversations = {
    ...DEFAULT_SETTINGS.conversations,
    ...(safe.conversations ?? {}),
  };

  const rawSchemaVersion = (safe.schemaVersion ?? "1.5") as Settings["schemaVersion"];
  const rawProviders = safe.providers?.length ? safe.providers : DEFAULT_SETTINGS.providers;
  const rawUserLanguage = safe.userLanguage ?? DEFAULT_SETTINGS.userLanguage;
  const rawTheme = safe.theme ?? DEFAULT_SETTINGS.theme;
  const rawStartAtLogin = safe.startAtLogin ?? DEFAULT_SETTINGS.startAtLogin;
  const rawSystemPrompt = {
    ...DEFAULT_SETTINGS.systemPrompt,
    ...(safe.systemPrompt ?? {}),
  };

  const clampedConversations = {
    ...mergedConversations,
    autoArchiveAfterDays: Math.max(MIN_AUTO_ARCHIVE_DAYS, mergedConversations.autoArchiveAfterDays | 0),
    maxHistory: Math.max(MIN_MAX_HISTORY, mergedConversations.maxHistory | 0),
  };

  const clampedMinSize = {
    width: Math.max(MIN_SIZE_WIDTH, mergedWindow.minSize.width | 0),
    height: Math.max(MIN_SIZE_HEIGHT, mergedWindow.minSize.height | 0),
  };

  const clampedDefaultSize = {
    width: Math.max(clampedMinSize.width, mergedWindow.defaultSize.width | 0),
    height: Math.max(clampedMinSize.height, mergedWindow.defaultSize.height | 0),
  };

  return {
    schemaVersion: rawSchemaVersion,
    providers: rawProviders,
    userLanguage: rawUserLanguage,
    theme: rawTheme,
    startAtLogin: rawStartAtLogin,
    window: {
      ...mergedWindow,
      minSize: clampedMinSize,
      defaultSize: clampedDefaultSize,
    },
    systemPrompt: rawSystemPrompt,
    conversations: clampedConversations,
  };
}
