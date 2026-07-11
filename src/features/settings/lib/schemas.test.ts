import { describe, it, expect } from "vitest";
import { ProviderSchema, SettingsSchema } from "./schemas";

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
      window: {},
      system_prompt: {},
      conversations: {},
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
