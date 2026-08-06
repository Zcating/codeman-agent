import { describe, it, expect } from "vitest";
import { lookupContextWindow } from "./context-window-fallback";
import type { ModelMeta, Provider } from "@codeman-frontend/shared/lib/types";

function makeModel(overrides: Partial<ModelMeta> = {}): ModelMeta {
  return { id: "test-model", label: "Test Model", contextWindow: undefined, thinking: false, ...overrides };
}

function makeProvider(llmOverrides: Partial<Provider["llm"]> = {}): Provider {
  return {
    id: "test-provider",
    label: "Test",
    apiKey: "",
    llm: {
      defaultModel: "test-model",
      baseUrl: "",
      apiType: "anthropic-messages",
      models: [],
      modelsEndpoint: "",
      contextWindow: undefined,
      ...llmOverrides,
    },
  };
}

describe("lookupContextWindow", () => {
  it("uses model.contextWindow when set", () => {
    const model = makeModel({ contextWindow: 128_000 });
    const provider = makeProvider();
    expect(lookupContextWindow(model, provider)).toBe(128_000);
  });

  it("falls back to provider.llm.contextWindow when model has none", () => {
    const model = makeModel();
    const provider = makeProvider({ contextWindow: 200_000 });
    expect(lookupContextWindow(model, provider)).toBe(200_000);
  });

  it("falls back to family table when model starts with MiniMax-M", () => {
    const model = makeModel({ id: "MiniMax-M2.7-highspeed" });
    const provider = makeProvider();
    expect(lookupContextWindow(model, provider)).toBe(200_000);
  });

  it("returns 0 when nothing matches", () => {
    const model = makeModel({ id: "unknown-model" });
    const provider = makeProvider();
    expect(lookupContextWindow(model, provider)).toBe(0);
  });

  it("model.contextWindow takes priority over provider", () => {
    const model = makeModel({ contextWindow: 64_000 });
    const provider = makeProvider({ contextWindow: 200_000 });
    expect(lookupContextWindow(model, provider)).toBe(64_000);
  });

  it("DeepSeek models have no family match, go to provider", () => {
    const model = makeModel({ id: "deepseek-chat" });
    const provider = makeProvider({ contextWindow: 64_000 });
    expect(lookupContextWindow(model, provider)).toBe(64_000);
  });
});
