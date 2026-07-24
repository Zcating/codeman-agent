//! Pure-function spec for the Mock (dev) template used by createProviderFormDialog().

import { describe, it, expect } from "vitest";
import type { Provider } from "../../../shared/lib/types";
import { buildMockDevTemplate } from "./mock-provider-template";

describe("buildMockDevTemplate", () => {
  it("返回 prefill shape with given id (baseUrl 指向本地 mock server)", () => {
    const result = buildMockDevTemplate("mock-1");
    expect(result).toEqual({
      id: "mock-1",
      label: "Mock",
      enabled: true,
      apiKey: "",
      llm: {
        baseUrl: "http://127.0.0.1:50000/mock/anthropic",
        defaultModel: "mock-default",
        apiType: "anthropic-messages",
        models: [{ id: "mock-default", label: "Mock", deprecated: false, thinking: false }],
        modelsEndpoint: "",
      },
    } satisfies Provider);
  });

  it("不同 id 返回相同默认结构", () => {
    const result = buildMockDevTemplate("mock-foo");
    expect(result.id).toBe("mock-foo");
    expect(result.label).toBe("Mock");
    expect(result.enabled).toBe(true);
    expect(result.apiKey).toBe("");
    expect(result.llm.baseUrl).toBe("http://127.0.0.1:50000/mock/anthropic");
    expect(result.llm.defaultModel).toBe("mock-default");
    expect(result.llm.apiType).toBe("anthropic-messages");
    expect(result.llm.models).toHaveLength(1);
    expect(result.llm.models[0]).toEqual({ id: "mock-default", label: "Mock", deprecated: false, thinking: false });
    expect(result.llm.modelsEndpoint).toBe("");
  });

  it("返回对象结构匹配 Provider interface", () => {
    const result = buildMockDevTemplate("mock-test");
    // Structural check: result satisfies Provider interface
    const _provider: Provider = result;
    expect(_provider).toBeDefined();
    expect(typeof _provider.id).toBe("string");
    expect(typeof _provider.label).toBe("string");
    expect(typeof _provider.enabled).toBe("boolean");
    expect(typeof _provider.apiKey).toBe("string");
    expect(typeof _provider.llm).toBe("object");
  });
});
