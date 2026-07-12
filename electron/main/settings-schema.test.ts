import { describe, it, expect } from "vitest";
import {
  sanitize,
  migrationsV0ToV15,
  migrateV15SnakeToCamel,
  DEFAULT_SETTINGS,
  type SettingsV15,
  type SettingsV0,
} from "./settings-schema";

const V15: SettingsV15 = {
  schemaVersion: "1.5",
  providers: [
    {
      id: "minimax",
      label: "MiniMax",
      enabled: true,
      apiKey: "sk-test",
      llm: {
        defaultModel: "MiniMax-M2.5-highspeed",
        baseUrl: "https://api.minimaxi.com/anthropic",
        apiType: "anthropic-messages",
        models: [],
        modelsEndpoint: "https://api.minimaxi.com/v1/models",
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

describe("T4a — electron/main/settings-schema.ts", () => {
  describe("sanitize() invariants", () => {
    it("clamps autoArchiveAfterDays to >= 1", () => {
      const r = sanitize({ ...V15, conversations: { autoArchiveAfterDays: 0, maxHistory: 1000 } });
      expect(r.conversations.autoArchiveAfterDays).toBe(1);
    });

    it("clamps maxHistory to >= 10", () => {
      const r = sanitize({ ...V15, conversations: { autoArchiveAfterDays: 30, maxHistory: 5 } });
      expect(r.conversations.maxHistory).toBe(10);
    });

    it("enforces minSize width >= 100 and height >= 100", () => {
      const r = sanitize({
        ...V15,
        window: { ...V15.window, minSize: { width: 10, height: 10 } },
      });
      expect(r.window.minSize.width).toBeGreaterThanOrEqual(100);
      expect(r.window.minSize.height).toBeGreaterThanOrEqual(100);
    });

    it("clamps defaultSize to be at least minSize", () => {
      const r = sanitize({
        ...V15,
        window: {
          ...V15.window,
          minSize: { width: 1000, height: 800 },
          defaultSize: { width: 100, height: 100 },
        },
      });
      expect(r.window.defaultSize.width).toBeGreaterThanOrEqual(1000);
      expect(r.window.defaultSize.height).toBeGreaterThanOrEqual(800);
    });

    it("preserves schemaVersion on valid input", () => {
      const r = sanitize(V15);
      expect(r.schemaVersion).toBe("1.5");
    });
  });

  describe("V0 → V1.5 migrations", () => {
    const V0_MINIMAX: SettingsV0 = {
      providers: [
        {
          id: "minimax",
          label: "MiniMax",
          api_key: "sk-v0",
          billing_kind: "plan_quota",
          models: ["MiniMax-M2.5-highspeed"],
        },
      ],
      default_provider_id: "minimax",
      window: { width: 800, height: 600 },
    };

    it("migrates V0 minimax provider to V1.5 with anthropic-messages API", () => {
      const r = migrationsV0ToV15(V0_MINIMAX);
      expect(r.providers[0].llm.apiType).toBe("anthropic-messages");
      expect(r.providers[0].llm.baseUrl).toContain("minimaxi");
      expect(r.providers[0].billing?.kind).toBe("plan_quota");
    });

    it("preserves default_provider_id migration to defaultLlmProviderId", () => {
      const r = migrationsV0ToV15(V0_MINIMAX);
      expect(r.defaultLlmProviderId).toBe("minimax");
    });

    it("migrates deepseek-style V0 provider", () => {
      const V0_DEEPSEEK: SettingsV0 = {
        providers: [
          {
            id: "deepseek",
            label: "DeepSeek",
            api_key: "sk-ds",
            billing_kind: "balance",
            models: ["deepseek-chat"],
          },
        ],
        default_provider_id: "deepseek",
        window: { width: 800, height: 600 },
      };
      const r = migrationsV0ToV15(V0_DEEPSEEK);
      expect(r.providers[0].llm.apiType).toBe("anthropic-messages");
      expect(r.providers[0].llm.baseUrl).toContain("deepseek");
      expect(r.providers[0].billing?.kind).toBe("balance");
    });

    it("V1.5 input passes through unchanged (idempotent migration)", () => {
      const r = migrationsV0ToV15(V15 as unknown as SettingsV0);
      expect(r.schemaVersion).toBe("1.5");
      expect(r.providers[0].id).toBe("minimax");
    });

    it("empty V0 input returns DEFAULT_SETTINGS (fresh install)", () => {
      const r = migrationsV0ToV15({} as SettingsV0);
      expect(r.providers).toEqual(DEFAULT_SETTINGS.providers);
    });

    it("preserves userLanguage in migration when present", () => {
      const V0_WITH_LANG: SettingsV0 & { user_language?: string } = {
        ...V0_MINIMAX,
        user_language: "zh",
      };
      const r = migrationsV0ToV15(V0_WITH_LANG);
      expect(r.userLanguage).toBe("zh");
    });
  });

  describe("ADR-0024 D10: V15 snake → camel migration", () => {
    const V15_SNAKE = {
      schema_version: "1.5",
      providers: [
        {
          id: "minimax",
          label: "MiniMax",
          enabled: true,
          api_key: "sk-test",
          llm: {
            default_model: "MiniMax-M2.5-highspeed",
            base_url: "https://api.minimaxi.com/anthropic",
            api_type: "anthropic-messages",
            models: [
              {
                id: "MiniMax-M2.5-highspeed",
                label: "MiniMax-M2.5-highspeed",
                context_window: 200_000,
                deprecated: false,
                thinking: false,
              },
            ],
            models_endpoint: "https://api.minimaxi.com/v1/models",
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

    it("converts V15 snake keys to camelCase recursively", () => {
      const r = migrateV15SnakeToCamel(V15_SNAKE) as Record<string, unknown>;
      expect(r.schemaVersion).toBe("1.5");
      expect(r.defaultLlmProviderId).toBe("minimax");
      expect(r.userLanguage).toBe("auto");
      expect(r.startAtLogin).toBe(false);
      expect(r.systemPrompt).toEqual({ default: "", userCanEdit: true });
      const window = r.window as Record<string, unknown>;
      expect(window.rememberPosition).toBe(true);
      expect(window.defaultSize).toEqual({ width: 800, height: 600 });
      const conversations = r.conversations as Record<string, unknown>;
      expect(conversations.autoArchiveAfterDays).toBe(30);
      expect(conversations.maxHistory).toBe(1000);
      const provider = (r.providers as Array<Record<string, unknown>>)[0];
      expect(provider.apiKey).toBe("sk-test");
      const llm = provider.llm as Record<string, unknown>;
      expect(llm.defaultModel).toBe("MiniMax-M2.5-highspeed");
      expect(llm.baseUrl).toBe("https://api.minimaxi.com/anthropic");
      expect(llm.modelsEndpoint).toBe("https://api.minimaxi.com/v1/models");
      const model = (llm.models as Array<Record<string, unknown>>)[0];
      expect(model.contextWindow).toBe(200_000);
    });

    it("V15-snake → migrateV15SnakeToCamel → migrationsV0ToV15 → sanitize chain", () => {
      // Mimics loadSettings() pipeline exactly.
      const camel = migrateV15SnakeToCamel(V15_SNAKE);
      const r = migrationsV0ToV15(camel as Parameters<typeof migrationsV0ToV15>[0]);
      expect(r.schemaVersion).toBe("1.5");
      expect(r.providers[0].apiKey).toBe("sk-test");
      expect(r.defaultLlmProviderId).toBe("minimax");
      expect(r.conversations.maxHistory).toBe(1000);
    });

    it("is idempotent on already-camel input", () => {
      const a = migrateV15SnakeToCamel(V15) as unknown;
      const b = migrateV15SnakeToCamel(a);
      expect(b).toEqual(a);
    });

    it("V0 keys (default_provider_id, billing_kind) are NOT renamed — left for migrationsV0ToV15()", () => {
      const V0_SNAKE = {
        providers: [{ id: "x", label: "X", api_key: "k", billing_kind: "balance", models: ["m"] }],
        default_provider_id: "x",
      };
      const r = migrateV15SnakeToCamel(V0_SNAKE) as Record<string, unknown>;
      // V0 inputs must remain readable by migrationsV0ToV15() which looks up
      // snake default_provider_id. We pass-through these keys unchanged.
      expect(r.default_provider_id).toBe("x");
      const provider = (r.providers as Array<Record<string, unknown>>)[0];
      expect(provider.billing_kind).toBe("balance");
    });

    it("empty/null input returns clean object", () => {
      expect(migrateV15SnakeToCamel({})).toEqual({});
      expect(migrateV15SnakeToCamel(null)).toBe(null);
      expect(migrateV15SnakeToCamel(undefined)).toBe(undefined);
    });
  });
});
