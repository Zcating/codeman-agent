// T4a — electron/main/settings-schema.ts: Settings schema + sanitize + V0→V1.5 migration.
//
// Ports src-tauri/src/settings.rs to TypeScript. Settings persist via
// electron-store (T3 wires readSettings/writeSettings to IPC). Snake_case
// field names preserved per ADR-0024 (no V2→V3 schema change for settings
// JSON; existing users' settings.json load transparently).

// ─── Types ────────────────────────────────────────────────────────

export interface ModelMeta {
  id: string;
  label: string;
  context_window?: number;
  deprecated?: boolean;
  thinking?: boolean;
}

export interface ProviderBilling {
  kind: "balance" | "plan_quota";
}

export interface ProviderLlm {
  default_model: string;
  base_url: string;
  api_type: "anthropic-messages";
  models: ModelMeta[];
  models_endpoint: string;
}

export interface Provider {
  id: string;
  label: string;
  enabled: boolean;
  api_key: string;
  llm: ProviderLlm;
  billing?: ProviderBilling;
}

export interface SettingsV15 {
  schema_version: "1.5";
  providers: Provider[];
  default_llm_provider_id?: string;
  user_language: "zh" | "en" | "auto";
  theme: "light" | "dark" | "system";
  start_at_login: boolean;
  window: {
    remember_position: boolean;
    remember_size: boolean;
    default_size: { width: number; height: number };
    min_size: { width: number; height: number };
  };
  system_prompt: { default: string; user_can_edit: boolean };
  conversations: { auto_archive_after_days: number; max_history: number };
}

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
  schema_version: "1.5",
  providers: [
    {
      id: "minimax",
      label: "MiniMax",
      enabled: true,
      api_key: "",
      llm: {
        default_model: MINIMAX_DEFAULT_MODEL,
        base_url: MINIMAX_BASE_URL,
        api_type: "anthropic-messages",
        // Pre-populate with the default model so the LLM picker has at least
        // one option out of the box (matches app.store.ts default).
        models: [
          {
            id: MINIMAX_DEFAULT_MODEL,
            label: MINIMAX_DEFAULT_MODEL,
            context_window: 200_000,
            deprecated: false,
            thinking: false,
          },
        ],
        models_endpoint: MINIMAX_MODELS_ENDPOINT,
      },
      billing: { kind: "plan_quota" },
    },
  ],
  default_llm_provider_id: "minimax",
  user_language: "auto",
  theme: "system",
  start_at_login: false,
  window: {
    remember_position: true,
    remember_size: true,
    default_size: { width: 800, height: 600 },
    min_size: { width: 600, height: 400 },
  },
  system_prompt: { default: "", user_can_edit: true },
  conversations: { auto_archive_after_days: 30, max_history: 1000 },
};

// ─── sanitize() ──────────────────────────────────────────────────

/**
 * Clamp settings to documented invariants. Per ADR-0024 amendment: this
 * matches the Rust Settings::sanitized() logic 1:1.
 */
export function sanitize(input: Partial<SettingsV15>): SettingsV15 {
  const merged: SettingsV15 = {
    ...DEFAULT_SETTINGS,
    ...input,
    window: { ...DEFAULT_SETTINGS.window, ...(input.window ?? {}) },
    system_prompt: {
      ...DEFAULT_SETTINGS.system_prompt,
      ...(input.system_prompt ?? {}),
    },
    conversations: {
      ...DEFAULT_SETTINGS.conversations,
      ...(input.conversations ?? {}),
    },
    providers: input.providers?.length ? input.providers : DEFAULT_SETTINGS.providers,
  };

  merged.conversations.auto_archive_after_days = Math.max(
    MIN_AUTO_ARCHIVE_DAYS,
    merged.conversations.auto_archive_after_days | 0,
  );
  merged.conversations.max_history = Math.max(
    MIN_MAX_HISTORY,
    merged.conversations.max_history | 0,
  );

  merged.window.min_size.width = Math.max(MIN_SIZE_WIDTH, merged.window.min_size.width | 0);
  merged.window.min_size.height = Math.max(MIN_SIZE_HEIGHT, merged.window.min_size.height | 0);

  merged.window.default_size.width = Math.max(
    merged.window.min_size.width,
    merged.window.default_size.width | 0,
  );
  merged.window.default_size.height = Math.max(
    merged.window.min_size.height,
    merged.window.default_size.height | 0,
  );

  merged.schema_version = "1.5";

  return merged;
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
    api_key: v0.api_key,
    llm: {
      default_model: defaultModel,
      base_url: baseUrl,
      api_type: "anthropic-messages",
      models,
      models_endpoint: modelsEndpoint,
    },
    billing,
  };
}

/**
 * Migrate V0 (pre-ADR-0023) settings.json to V1.5. Idempotent: if input
 * already has schema_version 1.5, returns sanitized passthrough.
 */
export function migrationsV0ToV15(input: SettingsV0 | SettingsV15): SettingsV15 {
  // V1.5 passthrough (idempotent).
  if ((input as SettingsV15).schema_version === "1.5") {
    return sanitize(input as SettingsV15);
  }

  const v0 = input as SettingsV0;
  const providers = (v0.providers ?? []).map(v0ProviderToV15);

  return sanitize({
    ...DEFAULT_SETTINGS,
    providers: providers.length ? providers : DEFAULT_SETTINGS.providers,
    default_llm_provider_id: v0.default_provider_id,
    user_language: v0.user_language ?? DEFAULT_SETTINGS.user_language,
  });
}
