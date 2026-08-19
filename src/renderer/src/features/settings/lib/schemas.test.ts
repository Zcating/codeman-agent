import { describe, it, expect } from "vitest";
import { Schema } from "effect";
import { ProviderSchema, SettingsSchema } from "@codeman-frontend/features/settings/lib/schemas";

describe("settings schemas (ADR-0025 PR 4)", () => {
  it("ProviderSchema decodes a valid Provider", () => {
    const valid = {
      id: "minimax",
      label: "MiniMax",
      apiKey: "sk-xxx",
      llm: {
        defaultModel: "claude-opus",
        baseUrl: "https://api.example.com/v1",
        apiType: "anthropic-messages" as const,
        models: [],
        modelsEndpoint: "https://api.example.com/v1/models",
      },
    };
    const decoded = ProviderSchema.make(valid);
    expect(decoded.id).toBe("minimax");
    expect(decoded.llm.defaultModel).toBe("claude-opus");
  });

  it("SettingsSchema decodes a minimal valid Settings", () => {
    const minimal = {
      userLanguage: "auto" as const,
      theme: "system" as const,
      startAtLogin: false,
      window: {
        rememberPosition: true,
        rememberSize: true,
        defaultSize: { width: 800, height: 600 },
        minSize: { width: 400, height: 300 },
      },
      systemPrompt: { default: "", userCanEdit: true },
      conversations: { autoArchiveAfterDays: 30, maxHistory: 1000 },
    };
    const decoded = SettingsSchema.make(minimal);
    expect(decoded.userLanguage).toBe("auto");
  });

  it("SettingsSchema rejects missing required field", () => {
    const invalid = {
      theme: "system" as const,
      startAtLogin: false,
      window: {},
      systemPrompt: {},
      conversations: {},
    };
    expect(() => SettingsSchema.make(invalid as never)).toThrow();
  });
});

describe("ProviderSchema decodes camelCase fields ", () => {
  it("decodes a Provider with camelCase fields matching types.ts Provider interface", () => {
    const camelProvider = {
      id: "minimax",
      label: "MiniMax",
      apiKey: "sk-xxx",
      llm: {
        defaultModel: "claude-opus",
        baseUrl: "https://api.example.com/v1",
        apiType: "anthropic-messages" as const,
        models: [],
        modelsEndpoint: "https://api.example.com/v1/models",
      },
    };
    const decoded = ProviderSchema.make(camelProvider);
    expect(decoded.id).toBe("minimax");
    expect(decoded.llm.defaultModel).toBe("claude-opus");
  });
});

describe("SettingsSchema — opaque sub-schemas typed (ADR-0025 review J1)", () => {
  it("rejects partial settings when window is missing required fields", () => {
    const partialSettings = {
      providers: [],
      userLanguage: "auto" as const,
      theme: "system" as const,
      startAtLogin: false,
      window: { rememberPosition: true },
      systemPrompt: { default: "", userCanEdit: true },
      conversations: { autoArchiveAfterDays: 30, maxHistory: 1000 },
    };
    const decoded = Schema.decodeUnknownEither(SettingsSchema)(partialSettings);
    expect(decoded._tag).toBe("Left");
  });

  it("accepts a full settings blob matching WindowSettings / SystemPromptSettings / ConversationSettings", () => {
    const fullSettings = {
      providers: [],
      userLanguage: "auto" as const,
      theme: "system" as const,
      startAtLogin: false,
      window: {
        rememberPosition: true,
        rememberSize: true,
        defaultSize: { width: 800, height: 600 },
        minSize: { width: 400, height: 300 },
      },
      systemPrompt: { default: "", userCanEdit: true },
      conversations: { autoArchiveAfterDays: 30, maxHistory: 1000 },
    };
    const decoded = Schema.decodeUnknownEither(SettingsSchema)(fullSettings);
    expect(decoded._tag).toBe("Right");
  });
});
