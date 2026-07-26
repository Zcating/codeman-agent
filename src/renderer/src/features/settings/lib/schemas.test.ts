import { describe, it, expect } from "vitest";
import { Schema } from "effect";
import { ProviderSchema, SettingsSchema } from "@codeman-frontend/features/settings/lib/schemas";

describe("settings schemas (ADR-0025 PR 4)", () => {
  it("ProviderSchema decodes a valid Provider", () => {
    const valid = {
      id: "minimax",
      label: "MiniMax",
      enabled: true,
      api_key: "sk-xxx",
      llm: {
        default_model: "claude-opus",
        base_url: "https://api.example.com/v1",
        api_type: "anthropic-messages" as const,
        models: [],
        models_endpoint: "https://api.example.com/v1/models",
      },
    };
    const decoded = ProviderSchema.make(valid);
    expect(decoded.id).toBe("minimax");
    expect(decoded.llm.default_model).toBe("claude-opus");
  });

  it("SettingsSchema decodes a minimal valid Settings", () => {
    const minimal = {
      user_language: "auto" as const,
      theme: "system" as const,
      start_at_login: false,
      window: {
        remember_position: true,
        remember_size: true,
        default_size: { width: 800, height: 600 },
        min_size: { width: 400, height: 300 },
      },
      system_prompt: { default: "", user_can_edit: true },
      conversations: { auto_archive_after_days: 30, max_history: 1000 },
      llm_providers: [],
    };
    const decoded = SettingsSchema.make(minimal);
    expect(decoded.user_language).toBe("auto");
    expect(decoded.llm_providers).toEqual([]);
  });

  it("SettingsSchema rejects missing required field", () => {
    const invalid = {
      // missing user_language
      theme: "system" as const,
      start_at_login: false,
      window: {},
      system_prompt: {},
      conversations: {},
      llm_providers: [],
    };
    expect(() => SettingsSchema.make(invalid as never)).toThrow();
  });
});

// Task 9 (Phase-3 review J1): SettingsSchema's `window`, `system_prompt`,
// `conversations` fields are typed against WindowSettings /
// SystemPromptSettings / ConversationSettings from src/shared/lib/types.ts.
// Partial / malformed entries reject at decode time.
describe("SettingsSchema — opaque sub-schemas typed (ADR-0025 review J1)", () => {
  it("rejects partial settings when window is missing required fields", () => {
    const partialSettings = {
      providers: [],
      user_language: "auto" as const,
      theme: "system" as const,
      start_at_login: false,
      // missing remember_size / default_size / min_size
      window: { remember_position: true },
      system_prompt: { default: "", user_can_edit: true },
      conversations: { auto_archive_after_days: 30, max_history: 1000 },
      llm_providers: [],
    };
    const decoded = Schema.decodeUnknownEither(SettingsSchema)(partialSettings);
    expect(decoded._tag).toBe("Left");
  });

  it("accepts a full settings blob matching WindowSettings / SystemPromptSettings / ConversationSettings", () => {
    const fullSettings = {
      providers: [],
      user_language: "auto" as const,
      theme: "system" as const,
      start_at_login: false,
      window: {
        remember_position: true,
        remember_size: true,
        default_size: { width: 800, height: 600 },
        min_size: { width: 400, height: 300 },
      },
      system_prompt: { default: "", user_can_edit: true },
      conversations: { auto_archive_after_days: 30, max_history: 1000 },
      llm_providers: [],
    };
    const decoded = Schema.decodeUnknownEither(SettingsSchema)(fullSettings);
    expect(decoded._tag).toBe("Right");
  });
});
