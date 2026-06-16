//! buildModel 单元测试（V1.5+）。
//!
//! T14: 测试 buildModel 函数正确性。
//!
//! 测试场景：
//! 1. buildModel returns valid Model for valid provider and model id (positive)
//! 2. buildModel throws on unknown model id (negative)
//! 3. buildModel throws on missing llm_api_key_ref (negative)

import { describe, it, expect } from "vitest";
import { buildModel, BuildModelError } from "./build-model";
import type { Provider } from "../../../shared/lib/types";

// ─── Test Fixtures ─────────────────────────────────────────────

const mockProvider: Provider = {
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
        context_window: 200000,
        deprecated: false,
        thinking: false,
      },
      {
        id: "MiniMax-M2.1-highspeed",
        label: "MiniMax-M2.1-highspeed",
        context_window: 128000,
        deprecated: false,
        thinking: false,
      },
    ],
    models_endpoint: "https://api.minimaxi.com/anthropic/v1/models",
  },
};

// ─── Tests ─────────────────────────────────────────────────────

describe("buildModel", () => {
  it("returns valid Model for valid provider and model id", () => {
    const model = buildModel(mockProvider, "MiniMax-M2.5-highspeed");

    // 验证 Model 对象结构
    expect(model).toBeDefined();
    expect(model.id).toBe("MiniMax-M2.5-highspeed");
    expect(model.name).toBe("MiniMax-M2.5-highspeed");
    expect(model.api).toBe("anthropic-messages");
    expect(model.provider).toBe("minimax");
    expect(model.baseUrl).toBe("https://api.minimaxi.com/anthropic");
    expect(model.reasoning).toBe(false);
    expect(model.input).toEqual(["text"]);
    expect(model.contextWindow).toBe(200000);
    expect(model.maxTokens).toBe(8192);
    expect(model.cost).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
  });

  it("uses ModelMeta context_window from provider models", () => {
    // 不同模型有不同 context_window
    const model1 = buildModel(mockProvider, "MiniMax-M2.5-highspeed");
    expect(model1.contextWindow).toBe(200000);

    const model2 = buildModel(mockProvider, "MiniMax-M2.1-highspeed");
    expect(model2.contextWindow).toBe(128000);
  });

  it("uses ModelMeta thinking flag from provider models", () => {
    // 查找具有 thinking: true 的模型来测试
    const thinkingProvider: Provider = {
      ...mockProvider,
      llm: {
        ...mockProvider.llm,
        models: [
          {
            id: "test-reasoning",
            label: "Test Reasoning",
            context_window: 100000,
            deprecated: false,
            thinking: true,
          },
        ],
      },
    };

    const model = buildModel(thinkingProvider, "test-reasoning");
    expect(model.reasoning).toBe(true);
  });

  it("throws BuildModelError on unknown model id", () => {
    expect(() => buildModel(mockProvider, "nonexistent-model")).toThrow(BuildModelError);
  });

  it("throws BuildModelError with available models in error message", () => {
    try {
      buildModel(mockProvider, "nonexistent-model");
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(BuildModelError);
      expect((e as BuildModelError).message).toContain("nonexistent-model");
      expect((e as BuildModelError).message).toContain("MiniMax-M2.5-highspeed");
      expect((e as BuildModelError).message).toContain("MiniMax-M2.1-highspeed");
    }
  });

  it("throws BuildModelError on missing llm_api_key_ref", () => {
    const noKeyProvider: Provider = {
      ...mockProvider,
      llm: {
        ...mockProvider.llm,
        llm_api_key_ref: "",
      },
    };

    expect(() => buildModel(noKeyProvider, "MiniMax-M2.5-highspeed")).toThrow(BuildModelError);
  });

  it("throws BuildModelError with provider id in message when key missing", () => {
    const noKeyProvider: Provider = {
      ...mockProvider,
      llm: {
        ...mockProvider.llm,
        llm_api_key_ref: "",
      },
    };

    try {
      buildModel(noKeyProvider, "MiniMax-M2.5-highspeed");
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(BuildModelError);
      expect((e as BuildModelError).message).toContain("minimax");
    }
  });

  it("uses default context_window when ModelMeta.context_window is undefined", () => {
    const providerNoContextWindow: Provider = {
      ...mockProvider,
      llm: {
        ...mockProvider.llm,
        models: [
          {
            id: "no-context-window",
            label: "No Context Window",
            // context_window 未定义
            deprecated: false,
            thinking: false,
          },
        ],
      },
    };

    const model = buildModel(providerNoContextWindow, "no-context-window");
    // 默认值 128000
    expect(model.contextWindow).toBe(128000);
  });
});
