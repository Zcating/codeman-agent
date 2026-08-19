import { describe, it, expect } from "vitest";
import {
  sanitize,
  DEFAULT_SETTINGS,
  type Settings,
} from "./settings-schema";

// V15 without enabled -
const V15: Settings = {
  schemaVersion: "1.5",
  providers: [
    {
      id: "minimax",
      label: "MiniMax",
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
  compaction: { enabled: true, reserveTokens: 16384, prune: true, preserveRecentTokens: 2000, tailTurns: 2 },
};

describe("T4a — src/main/settings-schema.ts", () => {
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

    it("rejects malformed schemaVersion → falls back to DEFAULT_SETTINGS", () => {
      const r = sanitize({ schemaVersion: "garbage" } as unknown as Settings);
      expect(r.schemaVersion).toBe("1.5");
    });

    it("rejects providers: not-array → falls back to DEFAULT_SETTINGS.providers", () => {
      const r = sanitize({ providers: "not-an-array" } as unknown as Settings);
      expect(r.providers).toEqual(DEFAULT_SETTINGS.providers);
    });

    it("preserves defaultLlmProviderId from input", () => {
      const r = sanitize({ ...V15, defaultLlmProviderId: "minimax" });
      expect(r.defaultLlmProviderId).toBe("minimax");
    });

    it("preserves defaultLlmProviderId even when other fields fall back to defaults", () => {
      const r = sanitize({
        providers: "not-an-array",
        defaultLlmProviderId: "minimax",
      } as unknown as Partial<Settings>);
      expect(r.defaultLlmProviderId).toBe("minimax");
    });

    it("strips legacy enabled field from providers ", () => {
      // Use type assertion to simulate legacy data with enabled field
      const legacyWithEnabled = {
        ...V15,
        providers: [
          {
            ...V15.providers[0],
            enabled: true as const, // legacy field that should be stripped
          },
        ],
      };
      const r = sanitize(legacyWithEnabled as unknown as Partial<Settings>);
      expect(r.providers[0]).not.toHaveProperty("enabled");
    });

    it("preserves comment field when present ", () => {
      const withComment: Settings = {
        ...V15,
        providers: [
          {
            ...V15.providers[0],
            comment: "my comment",
          },
        ],
      };
      const r = sanitize(withComment);
      expect(r.providers[0].comment).toBe("my comment");
    });
  });

});
