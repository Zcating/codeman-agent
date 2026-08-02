import type { ProviderLlm } from "./schemas.js";

export function enforceDefaultModelInvariant(llm: ProviderLlm): ProviderLlm {
  if (llm.models.length === 0) {
    return { ...llm, defaultModel: "" };
  }
  if (llm.defaultModel === "" || llm.models.some((m) => m.id === llm.defaultModel)) {
    return llm;
  }
  return { ...llm, defaultModel: llm.models[0].id };
}
