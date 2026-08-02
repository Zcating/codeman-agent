
import { describe, it, expect } from "vitest";
import { createProviderFromConfig, findDefaultModel } from "./pi-provider-adapter";
import type { ModelMeta } from "@codeman-frontend/shared/lib/types";

const models: ModelMeta[] = [
  { id: "m1", label: "Model 1", contextWindow: 1000, deprecated: false, thinking: false },
  { id: "m2", label: "Model 2", contextWindow: 2000, deprecated: true, thinking: true },
];

describe("createProviderFromConfig", () => {
  it("produces a PI provider whose getModels() maps id/name/baseUrl/provider", () => {
    const provider = createProviderFromConfig({
      id: "test-provider", name: "Test Provider", baseUrl: "https://api.example.com",
      apiKey: "sk-test", models,
    });
    const got = provider.getModels();
    expect(got).toHaveLength(2);
    expect(got[0]).toMatchObject({ id: "m1", name: "Model 1", api: "anthropic-messages", provider: "test-provider", baseUrl: "https://api.example.com" });
    expect(got[0].reasoning).toBe(false);
    expect(got[0].contextWindow).toBe(1000);
    expect(got[1].reasoning).toBe(true);
  });
  it("exposes auth.apiKey with resolve returning the apiKey", async () => {
    const provider = createProviderFromConfig({ id: "p", name: "P", baseUrl: "u", apiKey: "sk-abc", models });
    expect(provider.auth.apiKey).toBeDefined();
    expect(provider.auth.oauth).toBeUndefined();
    const result = await provider.auth.apiKey!.resolve({
      model: provider.getModels()[0],
      ctx: { env: async () => undefined, fileExists: async () => false },
      credential: undefined,
    });
    expect(result?.auth.apiKey).toBe("sk-abc");
  });
  it("omits refreshModels when modelsEndpoint is absent", () => {
    const provider = createProviderFromConfig({ id: "p", name: "P", baseUrl: "u", apiKey: "k", models });
    expect(provider.refreshModels).toBeUndefined();
  });
  it("provides refreshModels when modelsEndpoint is present", async () => {
    const provider = createProviderFromConfig({ id: "p", name: "P", baseUrl: "u", apiKey: "k", models, modelsEndpoint: "https://api.example.com/v1/models" });
    expect(provider.refreshModels).toBeDefined();
  });
});

describe("findDefaultModel", () => {
  it("returns the matching model", () => {
    const provider = createProviderFromConfig({ id: "p", name: "P", baseUrl: "u", apiKey: "k", models });
    expect(findDefaultModel(provider, "m2").id).toBe("m2");
  });
  it("falls back to synthetic auto model when not found", () => {
    const provider = createProviderFromConfig({ id: "p", name: "P", baseUrl: "u", apiKey: "k", models });
    const model = findDefaultModel(provider, "missing-model");
    expect(model.id).toBe("missing-model");
    expect(model.provider).toBe("p");
  });
  it("falls back to 'auto' id when defaultModelId is empty", () => {
    const provider = createProviderFromConfig({ id: "p", name: "P", baseUrl: "u", apiKey: "k", models: [] });
    expect(findDefaultModel(provider, "").id).toBe("auto");
  });
});
