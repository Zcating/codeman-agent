import { describe, it, expect } from "vitest";
import {
  sanitize,
  migrationsV0ToV15,
  DEFAULT_SETTINGS,
  type SettingsV15,
  type SettingsV0,
} from "./settings-schema";

const V15: SettingsV15 = {
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
        models: [],
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

describe("T4a — electron/main/settings-schema.ts", () => {
  describe("sanitize() invariants", () => {
    it("clamps auto_archive_after_days to >= 1", () => {
      const r = sanitize({ ...V15, conversations: { auto_archive_after_days: 0, max_history: 1000 } });
      expect(r.conversations.auto_archive_after_days).toBe(1);
    });

    it("clamps max_history to >= 10", () => {
      const r = sanitize({ ...V15, conversations: { auto_archive_after_days: 30, max_history: 5 } });
      expect(r.conversations.max_history).toBe(10);
    });

    it("enforces min_size width >= 100 and height >= 100", () => {
      const r = sanitize({
        ...V15,
        window: { ...V15.window, min_size: { width: 10, height: 10 } },
      });
      expect(r.window.min_size.width).toBeGreaterThanOrEqual(100);
      expect(r.window.min_size.height).toBeGreaterThanOrEqual(100);
    });

    it("clamps default_size to be at least min_size", () => {
      const r = sanitize({
        ...V15,
        window: {
          ...V15.window,
          min_size: { width: 1000, height: 800 },
          default_size: { width: 100, height: 100 },
        },
      });
      expect(r.window.default_size.width).toBeGreaterThanOrEqual(1000);
      expect(r.window.default_size.height).toBeGreaterThanOrEqual(800);
    });

    it("preserves schema_version on valid input", () => {
      const r = sanitize(V15);
      expect(r.schema_version).toBe("1.5");
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
      expect(r.providers[0].llm.api_type).toBe("anthropic-messages");
      expect(r.providers[0].llm.base_url).toContain("minimaxi");
      expect(r.providers[0].billing?.kind).toBe("plan_quota");
    });

    it("preserves default_provider_id migration to default_llm_provider_id", () => {
      const r = migrationsV0ToV15(V0_MINIMAX);
      expect(r.default_llm_provider_id).toBe("minimax");
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
      expect(r.providers[0].llm.api_type).toBe("anthropic-messages");
      expect(r.providers[0].llm.base_url).toContain("deepseek");
      expect(r.providers[0].billing?.kind).toBe("balance");
    });

    it("V1.5 input passes through unchanged (idempotent migration)", () => {
      const r = migrationsV0ToV15(V15 as unknown as SettingsV0);
      expect(r.schema_version).toBe("1.5");
      expect(r.providers[0].id).toBe("minimax");
    });

    it("empty V0 input returns DEFAULT_SETTINGS (fresh install)", () => {
      const r = migrationsV0ToV15({} as SettingsV0);
      expect(r.providers).toEqual(DEFAULT_SETTINGS.providers);
    });

    it("preserves user language in migration when present", () => {
      const V0_WITH_LANG: SettingsV0 & { user_language?: string } = {
        ...V0_MINIMAX,
        user_language: "zh",
      };
      const r = migrationsV0ToV15(V0_WITH_LANG);
      expect(r.user_language).toBe("zh");
    });
  });
});
