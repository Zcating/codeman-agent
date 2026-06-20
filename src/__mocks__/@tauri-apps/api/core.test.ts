//! Tests for the Tauri API mock (src/__mocks__/@tauri-apps/api/core.ts).
//! These tests verify the V1.5+ mock implementation.

import { describe, it, expect, beforeEach } from "vitest";
import { invoke, mockState, mockMinimaxProvider, mockDeepseekProvider, mockProvider } from "./core";

describe("Tauri API Mock - V1.5+ Schema", () => {
  beforeEach(() => {
    // Reset mock state before each test
    mockState.rejected = undefined;
    mockState.calls = [];
    mockState.settings = {
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
      llm_providers: [],
      billing_providers: [],
    };
    mockState.store = {};
    mockState.v0FixtureActive = false;
  });

  describe("get_settings", () => {
    it("returns V1.5+ shape with providers array", async () => {
      const settings = await invoke("get_settings");

      expect(settings).toHaveProperty("providers");
      expect(settings).toHaveProperty("schema_version", "1.5");
      expect(Array.isArray((settings as any).providers)).toBe(true);
    });

    it("returns minimax provider by default", async () => {
      const settings = await invoke("get_settings");

      expect((settings as any).providers).toHaveLength(1);
      expect((settings as any).providers[0].id).toBe("minimax");
    });

    it("returns preserved V1 fields (theme, user_language, etc.)", async () => {
      const settings = await invoke("get_settings");

      expect((settings as any).theme).toBe("system");
      expect((settings as any).user_language).toBe("en");
      expect((settings as any).start_at_login).toBe(false);
    });
  });

  describe("update_settings", () => {
    it("accepts V1.5+ shape and persists to mock store", async () => {
      const newSettings = {
        theme: "dark" as const,
        providers: [mockDeepseekProvider, mockMinimaxProvider],
      };

      const result = await invoke("update_settings", { new_settings: newSettings });

      expect((result as any).theme).toBe("dark");
      expect((result as any).providers).toHaveLength(2);
      expect((result as any).schema_version).toBe("1.5");
    });

    it("preserves existing settings when updating partial", async () => {
      const newSettings = { theme: "light" as const };

      const result = await invoke("update_settings", { new_settings: newSettings });

      expect((result as any).theme).toBe("light");
      expect((result as any).user_language).toBe("en"); // preserved
      expect((result as any).providers).toHaveLength(1); // preserved
    });

    it("always sets schema_version to 1.5", async () => {
      const result = await invoke("update_settings", {
        new_settings: { schema_version: "1.0" as any },
      });

      expect((result as any).schema_version).toBe("1.5");
    });
  });

  describe("list_billing_providers", () => {
    it("derives from settings.providers.filter(p => p.billing)", async () => {
      mockState.settings.providers = [mockMinimaxProvider, mockDeepseekProvider];

      const result = await invoke("list_billing_providers");

      expect(Array.isArray(result)).toBe(true);
      const providers = result as any[];
      expect(providers.length).toBe(2);
      expect(providers.map((p) => p.id).sort()).toEqual(["deepseek", "minimax"]);
    });

    it("returns empty array when no providers have billing", async () => {
      mockState.settings.providers = [
        {
          ...mockMinimaxProvider,
          billing: undefined,
        },
      ];

      const result = await invoke("list_billing_providers");

      expect(result).toEqual([]);
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
      expect(provider.enabled).toBe(true);
      expect(provider.llm.api_type).toBe("anthropic-messages");
      expect(Array.isArray(provider.llm.models)).toBe(true);
    });

    it("allows overriding default values", () => {
      const provider = mockProvider({
        id: "custom",
        label: "Custom",
        enabled: false,
        api_key: "",
        llm: {
          default_model: "custom-model",
          base_url: "https://custom.example.com",
          api_type: "anthropic-messages",
          models: [],
          models_endpoint: "https://custom.example.com/models",
        },
      });

      expect(provider.id).toBe("custom");
      expect(provider.enabled).toBe(false);
      expect(provider.llm.default_model).toBe("custom-model");
    });

    it("allows omitting optional billing", () => {
      const provider = mockProvider({
        id: "llm-only",
        label: "LLM Only",
        billing: undefined,
      });

      expect(provider.billing).toBeUndefined();
    });
  });

  describe("clear_all_history", () => {
    it("is a no-op and does not throw", async () => {
      await expect(invoke("clear_all_history")).resolves.toBeUndefined();
    });
  });

  describe("V0 → V1.5 migration", () => {
    it("migrates V0 fixture on get_settings when v0FixtureActive is true", async () => {
      mockState.v0FixtureActive = true;
      mockState.resolved = {
        llm_providers: [
          {
            id: "deepseek",
            label: "DeepSeek",
            enabled: true,
            default_model: "deepseek-chat",
            base_url: "https://api.deepseek.com",
            api_type: "anthropic-messages",
            api_key_ref: "llm_providers/deepseek/api_key",
          },
        ],
        billing_providers: [
          {
            id: "deepseek",
            enabled: true,
            refresh_interval_secs: 300,
            api_key_ref: "billing/deepseek/api_key",
          },
        ],
        default_llm_provider_id: "deepseek",
        user_language: "en",
        theme: "dark",
        start_at_login: true,
        window: {
          remember_position: true,
          remember_size: true,
          default_size: { width: 1024, height: 768 },
          min_size: { width: 400, height: 300 },
        },
        system_prompt: { default: "You are a coding assistant.", user_can_edit: false },
        conversations: { auto_archive_after_days: 60, max_history: 500 },
      };

      const settings = await invoke("get_settings");

      expect((settings as any).schema_version).toBe("1.5");
      expect((settings as any).providers).toHaveLength(1);
      expect((settings as any).providers[0].id).toBe("deepseek");
      expect((settings as any).providers[0].llm.default_model).toBe("deepseek-chat");
      expect((settings as any).providers[0].billing.kind).toBe("balance");
      expect((settings as any).theme).toBe("dark");
    });
  });

  describe("mockState.calls tracking", () => {
    it("records all IPC calls", async () => {
      await invoke("get_settings");
      await invoke("list_billing_providers");
      await invoke("fetch_models", { providerId: "minimax" });

      expect(mockState.calls).toEqual(["get_settings", "list_billing_providers", "fetch_models"]);
    });
  });
});
