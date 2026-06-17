//! Manual mock for @tauri-apps/api/core — used by Effect service tests.
//! vitest automatically uses __mocks__ when the module is imported.
//! Configure return values via the exported mockState object.
//!
//! V1.5+ schema: Settings.providers[] (llm required, billing optional)
//! V0 schema: Settings.llm_providers[] + Settings.billing_providers[] (dual arrays)

import { vi } from "vitest";

// ─── V1.5+ Types ───────────────────────────────────────────────

export interface ModelMeta {
  id: string;
  label: string;
  context_window?: number;
  deprecated?: boolean;
  thinking?: boolean;
}

export interface ProviderLlm {
  default_model: string;
  base_url: string;
  api_type: "anthropic-messages";
  llm_api_key_ref: string;
  models: ModelMeta[];
  models_endpoint: string;
}

export interface ProviderBilling {
  kind: "balance" | "plan_quota";
  billing_api_key_ref: string;
}

export interface Provider {
  id: string;
  label: string;
  enabled: boolean;
  llm: ProviderLlm;
  billing?: ProviderBilling;
}

// V1.5+ Settings shape
export interface SettingsV15 {
  providers: Provider[];
  schema_version: "1.5";
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
  // V0 legacy fields (cleared after migration, mirrors Rust behavior)
  llm_providers: Array<{
    id: string;
    label: string;
    enabled: boolean;
    default_model?: string;
    base_url?: string;
    api_type: "anthropic-messages";
    api_key_ref: string;
  }>;
  billing_providers: Array<{
    id: "deepseek" | "minimax";
    enabled: boolean;
    refresh_interval_secs: number;
    api_key_ref: string;
  }>;
}

// V0 Settings shape (for migration testing)
export interface SettingsV0 {
  schema_version?: string;
  llm_providers: Array<{
    id: string;
    label: string;
    enabled: boolean;
    default_model?: string;
    base_url?: string;
    api_type: "anthropic-messages";
    api_key_ref: string;
  }>;
  billing_providers: Array<{
    id: "deepseek" | "minimax";
    enabled: boolean;
    refresh_interval_secs: number;
    api_key_ref: string;
  }>;
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

// ─── Mock Factory ───────────────────────────────────────────────

export const mockProvider = (
  overrides: Partial<Provider> & { id: string; label: string },
): Provider => {
  const billing =
    "billing" in overrides
      ? overrides.billing
      : { kind: "plan_quota" as const, billing_api_key_ref: "billing/minimax/api_key" };

  return {
    id: overrides.id ?? "minimax",
    label: overrides.label ?? "MiniMax",
    enabled: overrides.enabled ?? true,
    llm: overrides.llm ?? {
      default_model: "MiniMax-M2.5-highspeed",
      base_url: "https://api.minimaxi.com/anthropic",
      api_type: "anthropic-messages",
      llm_api_key_ref: "llm_providers/minimax/api_key",
      models: [
        {
          id: "MiniMax-M2.5-highspeed",
          label: "MiniMax-M2.5-highspeed",
          context_window: 200000,
          deprecated: false,
          thinking: false,
        },
      ],
      models_endpoint: "https://api.minimaxi.com/anthropic/v1/models",
    },
    ...(billing !== undefined ? { billing } : {}),
  };
};

export const mockMinimaxProvider: Provider = mockProvider({
  id: "minimax",
  label: "MiniMax",
});

export const mockDeepseekProvider: Provider = mockProvider({
  id: "deepseek",
  label: "DeepSeek",
  llm: {
    default_model: "deepseek-chat",
    base_url: "https://api.deepseek.com/anthropic",
    api_type: "anthropic-messages",
    llm_api_key_ref: "llm_providers/deepseek/api_key",
    models: [
      {
        id: "deepseek-chat",
        label: "deepseek-chat",
        context_window: 64000,
        deprecated: false,
        thinking: false,
      },
    ],
    models_endpoint: "https://api.deepseek.com/models",
  },
  billing: {
    kind: "balance",
    billing_api_key_ref: "billing/deepseek/api_key",
  },
});

const defaultSettingsV15: SettingsV15 = {
  providers: [mockMinimaxProvider],
  schema_version: "1.5",
  default_llm_provider_id: "minimax",
  user_language: "en",
  theme: "system",
  start_at_login: false,
  window: {
    remember_position: false,
    remember_size: false,
    default_size: { width: 800, height: 600 },
    min_size: { width: 400, height: 300 },
  },
  system_prompt: { default: "You are a helpful assistant.", user_can_edit: true },
  conversations: { auto_archive_after_days: 30, max_history: 1000 },
  // V0 legacy fields (empty for V1.5 default)
  llm_providers: [],
  billing_providers: [],
};

// ─── Mock State ────────────────────────────────────────────────

export const mockState = {
  resolved: undefined as unknown,
  rejected: undefined as Error | undefined,
  calls: [] as string[],
  // TDD 增强：跟踪每次 IPC 调用的 (command, args) 用于桥接函数参数断言。
  // 增量为追加数组，每条 = `{ name, args }`；旧 `calls` 保留向后兼容。
  callArgs: [] as Array<{ name: string; args: Record<string, unknown> | undefined }>,
  // V1.5+ settings store
  settings: { ...defaultSettingsV15 } as SettingsV15,
  // Tauri store mock (namespace -> key -> value)
  store: {} as Record<string, Record<string, string>>,
  // V0 migration flag
  v0FixtureActive: false,
};

// ─── Store helpers ─────────────────────────────────────────────

function getStoreValue(namespace: string, key: string): string | undefined {
  return mockState.store[namespace]?.[key];
}

function setStoreValue(namespace: string, key: string, value: string): void {
  if (!mockState.store[namespace]) {
    mockState.store[namespace] = {};
  }
  mockState.store[namespace][key] = value;
}

// ─── V0 → V1.5 Migration ───────────────────────────────────────

// Default MiniMax provider for V0.5 fresh install
const DEFAULT_MINIMAX_PROVIDER: Provider = {
  id: "minimax",
  label: "MiniMax",
  enabled: true,
  llm: {
    default_model: "MiniMax-M2.5-highspeed",
    base_url: "https://api.minimaxi.com/anthropic",
    api_type: "anthropic-messages",
    llm_api_key_ref: "llm_providers/minimax/api_key",
    models: [
      {
        id: "MiniMax-M2.5-highspeed",
        label: "MiniMax-M2.5-highspeed",
        context_window: 200_000,
        deprecated: false,
        thinking: false,
      },
    ],
    models_endpoint: "https://api.minimaxi.com/anthropic/v1/models",
  },
  billing: {
    kind: "plan_quota",
    billing_api_key_ref: "billing/minimax/api_key",
  },
};

function migrateV0toV15(v0: SettingsV0): SettingsV15 {
  // V0.5 detection: both arrays empty → fresh install, pre-fill MiniMax
  if (v0.llm_providers.length === 0 && v0.billing_providers.length === 0) {
    return {
      providers: [DEFAULT_MINIMAX_PROVIDER],
      schema_version: "1.5",
      default_llm_provider_id: "minimax",
      user_language: v0.user_language,
      theme: v0.theme,
      start_at_login: v0.start_at_login,
      window: v0.window,
      system_prompt: v0.system_prompt,
      conversations: v0.conversations,
      llm_providers: [],
      billing_providers: [],
    };
  }

  const providers: Provider[] = [];

  // Migrate each LLM provider
  for (const llm of v0.llm_providers) {
    const billing = v0.billing_providers.find((b) => b.id === llm.id);
    // Per ADR-0012: minimax uses plan_quota, deepseek uses balance
    const billingKind = llm.id === "deepseek" ? "balance" : "plan_quota";
    providers.push({
      id: llm.id,
      label: llm.label,
      enabled: llm.enabled,
      llm: {
        default_model: llm.default_model ?? "auto",
        base_url: llm.base_url ?? "",
        api_type: "anthropic-messages",
        llm_api_key_ref: llm.api_key_ref,
        models: [],
        models_endpoint: "",
      },
      billing: billing
        ? {
            kind: billingKind,
            billing_api_key_ref: billing.api_key_ref,
          }
        : undefined,
    });
  }

  // Migrate billing-only providers (those without LLM)
  for (const billing of v0.billing_providers) {
    if (!providers.find((p) => p.id === billing.id)) {
      const billingKind = billing.id === "deepseek" ? "balance" : "plan_quota";
      providers.push({
        id: billing.id,
        label: billing.id === "deepseek" ? "DeepSeek" : "MiniMax",
        enabled: billing.enabled,
        llm: {
          default_model: "",
          base_url: "",
          api_type: "anthropic-messages",
          llm_api_key_ref: "",
          models: [],
          models_endpoint: "",
        },
        billing: {
          kind: billingKind,
          billing_api_key_ref: billing.api_key_ref,
        },
      });
    }
  }

  return {
    providers,
    schema_version: "1.5",
    default_llm_provider_id: v0.default_llm_provider_id,
    user_language: v0.user_language,
    theme: v0.theme,
    start_at_login: v0.start_at_login,
    window: v0.window,
    system_prompt: v0.system_prompt,
    conversations: v0.conversations,
    // V0 legacy fields cleared after migration (mirrors Rust behavior)
    llm_providers: [],
    billing_providers: [],
  };
}

// ─── IPC Command Handlers ───────────────────────────────────────

type IPCCommand = string;
type IPCArgs = Record<string, unknown> | undefined;

const commandHandlers: Record<IPCCommand, (args?: IPCArgs) => unknown> = {
  get_settings(): unknown {
    // If V0 fixture is active, migrate on read
    if (mockState.v0FixtureActive) {
      const v0Settings = mockState.resolved as SettingsV0 | undefined;
      if (v0Settings && !v0Settings.schema_version) {
        mockState.settings = migrateV0toV15(v0Settings);
      }
    }
    return { ...mockState.settings };
  },

  update_settings(args?: IPCArgs): unknown {
    const newSettings = args?.new_settings as Partial<SettingsV15>;
    if (newSettings) {
      // Merge with existing settings
      mockState.settings = {
        ...mockState.settings,
        ...newSettings,
        // Always preserve schema_version
        schema_version: "1.5",
      };
    }
    return { ...mockState.settings };
  },

  list_billing_providers(): unknown {
    return mockState.settings.providers
      .filter((p) => p.billing !== undefined)
      .map((p) => ({
        id: p.id,
        label: p.label,
        enabled: p.enabled,
      }));
  },

  has_billing_key(args?: IPCArgs): boolean {
    const id = args?.provider_id as string;
    const key = getStoreValue("billing", `${id}/api_key`);
    return key !== undefined && key.length > 0;
  },

  set_billing_key(args?: IPCArgs): void {
    const id = args?.provider_id as string;
    const key = args?.api_key as string;
    if (id && key !== undefined) {
      setStoreValue("billing", `${id}/api_key`, key);
    }
  },

  has_llm_key(args?: IPCArgs): boolean {
    const id = (args?.providerId ?? args?.provider_id) as string;
    const key = getStoreValue("llm_providers", `${id}/api_key`);
    return key !== undefined && key.length > 0;
  },

  set_llm_key(args?: IPCArgs): void {
    const id = (args?.providerId ?? args?.provider_id) as string;
    const key = (args?.key ?? args?.api_key) as string;
    if (id && key !== undefined) {
      setStoreValue("llm_providers", `${id}/api_key`, key);
    }
  },

  get_llm_key(args?: IPCArgs): string | null {
    const id = (args?.providerId ?? args?.provider_id) as string;
    return getStoreValue("llm_providers", `${id}/api_key`) ?? null;
  },

  clear_all_history(): void {
    // No-op in mock
  },

  delete_provider_keys(args?: IPCArgs): void {
    const id = args?.id as string;
    if (!id) return;
    // Wipe both LLM and billing keys from Tauri store mock
    delete mockState.store["llm_providers"]?.[`${id}/api_key`];
    delete mockState.store["billing"]?.[`${id}/api_key`];
  },

  fetch_models(args?: IPCArgs): unknown {
    // Returns current models from settings for the given provider
    const providerId = args?.providerId as string;
    const provider = mockState.settings.providers.find((p) => p.id === providerId);
    return provider?.llm.models ?? [];
  },
};

// ─── Invoke Mock ────────────────────────────────────────────────

export const invoke = vi.fn().mockImplementation((name: string, args?: IPCArgs) => {
  mockState.calls.push(name);
  mockState.callArgs.push({ name, args: args as Record<string, unknown> | undefined });

  if (mockState.rejected) {
    return Promise.reject(mockState.rejected);
  }

  // Backward compatibility: if mockState.resolved is set AND v0FixtureActive is false,
  // return it directly. This preserves existing test behavior where tests set mockState.resolved.
  // But if v0FixtureActive is true, we need to run the handler to apply migration.
  if (mockState.resolved !== undefined && !mockState.v0FixtureActive) {
    return Promise.resolve(mockState.resolved);
  }

  const handler = commandHandlers[name];
  if (!handler) {
    return Promise.reject(
      new Error(
        `[mock] Unknown IPC command: "${name}". Available: ${Object.keys(commandHandlers).join(", ")}`,
      ),
    );
  }

  try {
    const result = handler(args);
    return Promise.resolve(result);
  } catch (e) {
    return Promise.reject(e);
  }
});

export { invoke as TauriInvoke };
export default { invoke };
