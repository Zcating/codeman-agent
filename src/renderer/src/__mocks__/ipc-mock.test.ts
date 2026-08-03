
import { describe, it, expect, beforeEach } from "vitest";
import { invoke, mockState, mockMinimaxProvider, mockDeepseekProvider, mockProvider } from "@codeman-frontend/__mocks__/ipc-mock";

describe("IPC Mock - V1.5+ Schema", () => {
  beforeEach(() => {
    mockState.rejected = undefined;
    mockState.calls = [];
    mockState.settings = {
      providers: [mockMinimaxProvider],
      schemaVersion: "1.5",
      defaultLlmProviderId: "minimax",
      userLanguage: "en",
      theme: "system",
      startAtLogin: false,
      window: {
        rememberPosition: false,
        rememberSize: false,
        defaultSize: { width: 800, height: 600 },
        minSize: { width: 400, height: 300 },
      },
      systemPrompt: { default: "You are a helpful assistant.", userCanEdit: true },
      conversations: { autoArchiveAfterDays: 30, maxHistory: 1000 },
      llmProviders: [],
    };
    mockState.store = {};
    mockState.v0FixtureActive = false;
  });

  describe("getSettings", () => {
    it("returns V1.5+ shape with providers array", async () => {
      const settings = await invoke("getSettings");

      expect(settings).toHaveProperty("providers");
      expect(settings).toHaveProperty("schemaVersion", "1.5");
      expect(Array.isArray((settings as any).providers)).toBe(true);
    });

    it("returns minimax provider by default", async () => {
      const settings = await invoke("getSettings");

      expect((settings as any).providers).toHaveLength(1);
      expect((settings as any).providers[0].id).toBe("minimax");
    });

    it("returns preserved V1 fields (theme, userLanguage, etc.)", async () => {
      const settings = await invoke("getSettings");

      expect((settings as any).theme).toBe("system");
      expect((settings as any).userLanguage).toBe("en");
      expect((settings as any).startAtLogin).toBe(false);
    });
  });

  describe("updateSettings", () => {
    it("accepts V1.5+ shape and persists to mock store", async () => {
      const newSettings = {
        theme: "dark" as const,
        providers: [mockDeepseekProvider, mockMinimaxProvider],
      };

      const result = await invoke("updateSettings", { newSettings: newSettings });

      expect((result as any).theme).toBe("dark");
      expect((result as any).providers).toHaveLength(2);
      expect((result as any).schemaVersion).toBe("1.5");
    });

    it("preserves existing settings when updating partial", async () => {
      const newSettings = { theme: "light" as const };

      const result = await invoke("updateSettings", { newSettings: newSettings });

      expect((result as any).theme).toBe("light");
      expect((result as any).userLanguage).toBe("en"); 
      expect((result as any).providers).toHaveLength(1); 
    });

    it("always sets schemaVersion to 1.5", async () => {
      const result = await invoke("updateSettings", {
        newSettings: { schemaVersion: "1.0" as any },
      });

      expect((result as any).schemaVersion).toBe("1.5");
    });
  });

  describe("unknown IPC command", () => {
    it("throws helpful error with available commands list", async () => {
      await expect(invoke("nonexistent_command")).rejects.toThrow(
        '[mock] Unknown IPC command: "nonexistent_command"',
      );
    });

    it("includes actual command name in error message", async () => {
      await expect(invoke("get_something_weird")).rejects.toThrow("get_something_weird");
    });
  });

  describe("mockProvider factory", () => {
    it("creates provider with default values", () => {
      const provider = mockProvider({ id: "test", label: "Test" });

      expect(provider.id).toBe("test");
      expect(provider.label).toBe("Test");
      expect(provider.llm.apiType).toBe("anthropic-messages");
      expect(Array.isArray(provider.llm.models)).toBe(true);
    });

    it("allows overriding default values", () => {
      const provider = mockProvider({
        id: "custom",
        label: "Custom",
        apiKey: "",
        llm: {
          defaultModel: "custom-model",
          baseUrl: "https://custom.example.com",
          apiType: "anthropic-messages",
          models: [],
          modelsEndpoint: "https://custom.example.com/models",
        },
      });

      expect(provider.id).toBe("custom");
      expect(provider.llm.defaultModel).toBe("custom-model");
    });
  });

  describe("clearAllHistory", () => {
    it("is a no-op and does not throw", async () => {
      await expect(invoke("clearAllHistory")).resolves.toBeUndefined();
    });
  });

  describe("V0 → V1.5 migration", () => {
    it("migrates V0 fixture on getSettings when v0FixtureActive is true", async () => {
      mockState.v0FixtureActive = true;
      mockState.resolved = {
        llmProviders: [
          {
            id: "deepseek",
            label: "DeepSeek",
            enabled: true,
            defaultModel: "deepseek-chat",
            baseUrl: "https://api.deepseek.com",
            apiType: "anthropic-messages",
            apiKeyRef: "llm_providers/deepseek/api_key",
          },
        ],
        defaultLlmProviderId: "deepseek",
        userLanguage: "en",
        theme: "dark",
        startAtLogin: true,
        window: {
          rememberPosition: true,
          rememberSize: true,
          defaultSize: { width: 1024, height: 768 },
          minSize: { width: 400, height: 300 },
        },
        systemPrompt: { default: "You are a coding assistant.", userCanEdit: false },
        conversations: { autoArchiveAfterDays: 60, maxHistory: 500 },
      };

      const settings = await invoke("getSettings");

      expect((settings as any).schemaVersion).toBe("1.5");
      expect((settings as any).providers).toHaveLength(1);
      expect((settings as any).providers[0].id).toBe("deepseek");
      expect((settings as any).providers[0].llm.defaultModel).toBe("deepseek-chat");
      expect((settings as any).theme).toBe("dark");
    });
  });

  describe("mockState.calls tracking", () => {
    it("records all IPC calls", async () => {
      await invoke("getSettings");
      await invoke("fetchModels", { providerId: "minimax" });

      expect(mockState.calls).toEqual(["getSettings", "fetchModels"]);
    });
  });
});
