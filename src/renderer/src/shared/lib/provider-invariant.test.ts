import { describe, it, expect } from "vitest";
import { enforceDefaultModelInvariant } from "./provider-invariant";
import type { ProviderLlm } from "@codeman-frontend/shared/lib/types";

describe("enforceDefaultModelInvariant", () => {
  it("empty models -> defaultModel = ''", () => {
    const llm = { defaultModel: "x", models: [] } as unknown as ProviderLlm;
    expect(enforceDefaultModelInvariant(llm).defaultModel).toBe("");
  });
  it("defaultModel in models -> unchanged", () => {
    const llm = { defaultModel: "m1", models: [{ id: "m1", label: "m1", thinking: false }] } as unknown as ProviderLlm;
    expect(enforceDefaultModelInvariant(llm).defaultModel).toBe("m1");
  });
  it("defaultModel not in models -> fallback to models[0].id", () => {
    const llm = { defaultModel: "gone", models: [{ id: "m1", label: "m1", thinking: false }, { id: "m2", label: "m2", thinking: false }] } as unknown as ProviderLlm;
    expect(enforceDefaultModelInvariant(llm).defaultModel).toBe("m1");
  });
  it("multiple matches -> keep original (existence check only)", () => {
    const llm = { defaultModel: "m1", models: [{ id: "m1", label: "a", thinking: false }, { id: "m1", label: "b", thinking: false }] } as unknown as ProviderLlm;
    expect(enforceDefaultModelInvariant(llm).defaultModel).toBe("m1");
  });
  it("explicit '' with non-empty models -> keep ''", () => {
    const llm = { defaultModel: "", models: [{ id: "m1", label: "m1", thinking: false }] } as unknown as ProviderLlm;
    expect(enforceDefaultModelInvariant(llm).defaultModel).toBe("");
  });
});
