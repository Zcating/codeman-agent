








import { describe, it, expect } from "vitest";
import { buildModel, BuildModelError } from "@codeman-frontend/features/chat/lib/build-model";
import type { Provider } from "@codeman-frontend/shared/lib/types";



const mockProvider: Provider = {
  id: "minimax",
  label: "MiniMax",
  enabled: true,
  apiKey: "test-api-key", 
  llm: {
    defaultModel: "MiniMax-M2.5-highspeed",
    baseUrl: "https://api.minimaxi.com/anthropic",
    apiType: "anthropic-messages",
    models: [
      {
        id: "MiniMax-M2.5-highspeed",
        label: "MiniMax-M2.5-highspeed",
        contextWindow: 200000,
        deprecated: false,
        thinking: false,
      },
      {
        id: "MiniMax-M2.1-highspeed",
        label: "MiniMax-M2.1-highspeed",
        contextWindow: 128000,
        deprecated: false,
        thinking: false,
      },
    ],
    modelsEndpoint: "https://api.minimaxi.com/anthropic/v1/models",
  },
};



describe("buildModel", () => {
  it("returns valid Model for valid provider and model id", () => {
    const model = buildModel(mockProvider, "MiniMax-M2.5-highspeed");

    
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
    
    const model1 = buildModel(mockProvider, "MiniMax-M2.5-highspeed");
    expect(model1.contextWindow).toBe(200000);

    const model2 = buildModel(mockProvider, "MiniMax-M2.1-highspeed");
    expect(model2.contextWindow).toBe(128000);
  });

  it("uses ModelMeta thinking flag from provider models", () => {
    
    const thinkingProvider: Provider = {
      ...mockProvider,
      llm: {
        ...mockProvider.llm,
        models: [
          {
            id: "test-reasoning",
            label: "Test Reasoning",
            contextWindow: 100000,
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

  it("throws BuildModelError on missing api_key", () => {
    const noKeyProvider: Provider = {
      ...mockProvider,
      apiKey: "",
    };

    expect(() => buildModel(noKeyProvider, "MiniMax-M2.5-highspeed")).toThrow(BuildModelError);
  });

  it("throws BuildModelError with provider id in message when key missing", () => {
    const noKeyProvider: Provider = {
      ...mockProvider,
      apiKey: "",
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
            
            deprecated: false,
            thinking: false,
          },
        ],
      },
    };

    const model = buildModel(providerNoContextWindow, "no-context-window");
    
    expect(model.contextWindow).toBe(128000);
  });
});
