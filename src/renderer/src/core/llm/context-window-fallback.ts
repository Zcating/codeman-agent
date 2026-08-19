import type { ModelMeta, Provider } from "@codeman-frontend/shared/lib/types";

const FAMILY_CONTEXT_WINDOW: Record<string, number> = {
  "MiniMax-M": 200_000,
};

export function lookupContextWindow(model: ModelMeta, provider: Provider): number {
  if (model.contextWindow != null && model.contextWindow > 0) {
    return model.contextWindow;
  }

  if (provider.llm.contextWindow != null && provider.llm.contextWindow > 0) {
    return provider.llm.contextWindow;
  }

  const modelId = model.id;
  for (const prefix of Object.keys(FAMILY_CONTEXT_WINDOW)) {
    if (modelId.startsWith(prefix)) {
      return FAMILY_CONTEXT_WINDOW[prefix];
    }
  }

  return 0;
}
