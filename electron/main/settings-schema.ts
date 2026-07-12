// T4a — electron/main/settings-schema.ts: Settings schema + sanitize + V0→V15
// migration + V15-snake→V15-camel migration.
//
// Ports src-tauri/src/settings.rs to TypeScript. Settings persist via
// electron-store (T3 wires readSettings/writeSettings to IPC). Per
// ADR-0024 D10 (V3.1 amend): V15 fields use camelCase on disk and in IPC
// payload; legacy V3 users' snake_case settings.json are auto-upgraded by
// `migrateV15SnakeToCamel()` at load time. V0 historical snake fields are
// consumed upstream by `migrationsV0ToV15()` and not touched by the V15
// rename pass.

// ─── Types (V0 historical snake; V15 canonical camel) ────────────

export interface ModelMeta {
  id: string;
  label: string;
  contextWindow?: number;
  deprecated?: boolean;
  thinking?: boolean;
}

export interface ProviderBilling {
  kind: "balance" | "plan_quota";
}

export interface ProviderLlm {
  defaultModel: string;
  baseUrl: string;
  /** ADR-0011: V1 only supports anthropic-messages protocol */
  apiType: "anthropic-messages";
  models: ModelMeta[];
  modelsEndpoint: string;
}

export interface Provider {
  id: string;
  label: string;
  enabled: boolean;
  /** ADR-0015: plaintext in Settings JSON */
  apiKey: string;
  llm: ProviderLlm;
  billing?: ProviderBilling;
}

export interface SettingsV15 {
  schemaVersion: "1.5";
  providers: Provider[];
  defaultLlmProviderId?: string;
  userLanguage: "zh" | "en" | "auto";
  theme: "light" | "dark" | "system";
  startAtLogin: boolean;
  window: {
    rememberPosition: boolean;
    rememberSize: boolean;
    defaultSize: { width: number; height: number };
    minSize: { width: number; height: number };
  };
  systemPrompt: { default: string; userCanEdit: boolean };
  conversations: { autoArchiveAfterDays: number; maxHistory: number };
}

// V0 (historical pre-ADR-0023) — kept snake for back-compat reasons
// (deprecation chain upstream of V1.5 / V15).
export interface SettingsV0Provider {
  id: string;
  label: string;
  api_key: string;
  billing_kind: "balance" | "plan_quota" | "none";
  models: string[];
}

export interface SettingsV0 {
  providers?: SettingsV0Provider[];
  default_provider_id?: string;
  window?: { width: number; height: number };
  user_language?: "zh" | "en" | "auto";
}

// ─── Constants ──────────────────────────────────────────────────

const MIN_SIZE_WIDTH = 100;
const MIN_SIZE_HEIGHT = 100;
const MIN_AUTO_ARCHIVE_DAYS = 1;
const MIN_MAX_HISTORY = 10;
const MINIMAX_BASE_URL = "https://api.minimaxi.com/anthropic";
const DEEPSEEK_BASE_URL = "https://api.deepseek.com/anthropic";
const MINIMAX_MODELS_ENDPOINT = "https://api.minimaxi.com/v1/models";
const DEEPSEEK_MODELS_ENDPOINT = "https://api.deepseek.com/v1/models";

const MINIMAX_DEFAULT_MODEL = "MiniMax-M2.5-highspeed";
const DEEPSEEK_DEFAULT_MODEL = "deepseek-chat";

const KNOWN_V0_BASE_URLS: Record<string, string> = {
  minimax: MINIMAX_BASE_URL,
  deepseek: DEEPSEEK_BASE_URL,
  "minimax-m2": MINIMAX_BASE_URL,
};

const KNOWN_V0_MODELS_ENDPOINTS: Record<string, string> = {
  minimax: MINIMAX_MODELS_ENDPOINT,
  deepseek: DEEPSEEK_MODELS_ENDPOINT,
  "minimax-m2": MINIMAX_MODELS_ENDPOINT,
};

const KNOWN_V0_DEFAULT_MODELS: Record<string, string> = {
  minimax: MINIMAX_DEFAULT_MODEL,
  deepseek: DEEPSEEK_DEFAULT_MODEL,
  "minimax-m2": MINIMAX_DEFAULT_MODEL,
};

export const DEFAULT_SETTINGS: SettingsV15 = {
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
};

// ─── sanitize() ──────────────────────────────────────────────────

/**
 * Clamp settings to documented invariants. Per ADR-0024 amendment: this
 * matches the Rust Settings::sanitized() logic 1:1, with V3.1 (D10) field
 * names in camelCase.
 */
export function sanitize(input: Partial<SettingsV15>): SettingsV15 {
  const merged: SettingsV15 = {
    ...DEFAULT_SETTINGS,
    ...input,
    window: { ...DEFAULT_SETTINGS.window, ...(input.window ?? {}) },
    systemPrompt: {
      ...DEFAULT_SETTINGS.systemPrompt,
      ...(input.systemPrompt ?? {}),
    },
    conversations: {
      ...DEFAULT_SETTINGS.conversations,
      ...(input.conversations ?? {}),
    },
    providers: input.providers?.length ? input.providers : DEFAULT_SETTINGS.providers,
  };

  merged.conversations.autoArchiveAfterDays = Math.max(
    MIN_AUTO_ARCHIVE_DAYS,
    merged.conversations.autoArchiveAfterDays | 0,
  );
  merged.conversations.maxHistory = Math.max(
    MIN_MAX_HISTORY,
    merged.conversations.maxHistory | 0,
  );

  merged.window.minSize.width = Math.max(MIN_SIZE_WIDTH, merged.window.minSize.width | 0);
  merged.window.minSize.height = Math.max(MIN_SIZE_HEIGHT, merged.window.minSize.height | 0);

  merged.window.defaultSize.width = Math.max(
    merged.window.minSize.width,
    merged.window.defaultSize.width | 0,
  );
  merged.window.defaultSize.height = Math.max(
    merged.window.minSize.height,
    merged.window.defaultSize.height | 0,
  );

  merged.schemaVersion = "1.5";

  return merged;
}

// ─── V15 snake → V15 camel migration (ADR-0024 D10) ──────────────

/**
 * Specific V15 snake→camel key renames. NOT a generic regex — V0 keys
 * (default_provider_id, billing_kind, etc.) are intentionally left
 * untouched so migrationsV0ToV15() can consume them upstream.
 */
const V15_SNAKE_TO_CAMEL: Record<string, string> = {
  schema_version: "schemaVersion",
  default_llm_provider_id: "defaultLlmProviderId",
  user_language: "userLanguage",
  start_at_login: "startAtLogin",
  system_prompt: "systemPrompt",
  user_can_edit: "userCanEdit",
  remember_position: "rememberPosition",
  remember_size: "rememberSize",
  default_size: "defaultSize",
  min_size: "minSize",
  auto_archive_after_days: "autoArchiveAfterDays",
  max_history: "maxHistory",
  api_key: "apiKey",
  default_model: "defaultModel",
  base_url: "baseUrl",
  api_type: "apiType",
  models_endpoint: "modelsEndpoint",
  context_window: "contextWindow",
};

function renameKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(renameKeysDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const camelKey = V15_SNAKE_TO_CAMEL[k] ?? k;
      out[camelKey] = renameKeysDeep(v);
    }
    return out;
  }
  return value;
}

/**
 * ADR-0024 D10: Migrate V15 settings.json on-disk format from V3 pre-D10
 * snake_case to V3.1 canonical camelCase. Idempotent on already-camel input.
 * V0 legacy keys (e.g. default_provider_id) are NOT renamed — they are
 * consumed upstream by `migrationsV0ToV15()`.
 *
 * Called from `loadSettings()` in ipc.ts BEFORE migrationsV0ToV15().
 */
export function migrateV15SnakeToCamel(raw: unknown): unknown {
  return renameKeysDeep(raw);
}

// ─── V0 → V1.5 migration ─────────────────────────────────────────

function v0ProviderToV15(v0: SettingsV0Provider): Provider {
  const id = (v0.id ?? "").toLowerCase();
  const baseUrl = KNOWN_V0_BASE_URLS[id] ?? MINIMAX_BASE_URL;
  const modelsEndpoint = KNOWN_V0_MODELS_ENDPOINTS[id] ?? MINIMAX_MODELS_ENDPOINT;
  const defaultModel = KNOWN_V0_DEFAULT_MODELS[id] ?? v0.models?.[0] ?? MINIMAX_DEFAULT_MODEL;

  const models: ModelMeta[] = (v0.models ?? []).map((m) => ({
    id: m,
    label: m,
  }));

  const billing: ProviderBilling | undefined =
    v0.billing_kind === "balance" || v0.billing_kind === "plan_quota"
      ? { kind: v0.billing_kind }
      : undefined;

  return {
    id: v0.id,
    label: v0.label,
    enabled: true,
    apiKey: v0.api_key,
    llm: {
      defaultModel,
      baseUrl,
      apiType: "anthropic-messages",
      models,
      modelsEndpoint,
    },
    billing,
  };
}

/**
 * Migrate V0 (pre-ADR-0023) settings.json to V1.5. Idempotent: if input
 * already has schemaVersion "1.5" (canonical post-D10), returns sanitized
 * passthrough. Caller is expected to run migrateV15SnakeToCamel() FIRST so
 * V3-pre-D10 snake inputs are normalized to canonical camel before this
 * passthrough check.
 */
export function migrationsV0ToV15(input: SettingsV0 | SettingsV15): SettingsV15 {
  // V1.5 passthrough (idempotent).
  if ((input as SettingsV15).schemaVersion === "1.5") {
    return sanitize(input as SettingsV15);
  }

  const v0 = input as SettingsV0;
  const providers = (v0.providers ?? []).map(v0ProviderToV15);

  return sanitize({
    ...DEFAULT_SETTINGS,
    providers: providers.length ? providers : DEFAULT_SETTINGS.providers,
    defaultLlmProviderId: v0.default_provider_id,
    userLanguage: v0.user_language ?? DEFAULT_SETTINGS.userLanguage,
  });
}
