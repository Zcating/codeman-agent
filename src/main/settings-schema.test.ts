import { describe, it, expect } from "vitest";
import {
  sanitize,
  DEFAULT_SETTINGS,
  type Settings,
} from "./settings-schema";

const V15: Settings = {
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

    it("rejects malformed schemaVersion → falls back to DEFAULT_SETTINGS", () => {
      const r = sanitize({ schemaVersion: "garbage" } as unknown as Settings);
      expect(r.schemaVersion).toBe("1.5");
    });

    it("rejects providers: not-array → falls back to DEFAULT_SETTINGS.providers", () => {
      const r = sanitize({ providers: "not-an-array" } as unknown as Settings);
      expect(r.providers).toEqual(DEFAULT_SETTINGS.providers);
    });
  });

});
