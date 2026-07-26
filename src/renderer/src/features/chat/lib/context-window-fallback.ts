//! context-window-fallback — three-layer context window resolution.
//!
//! Priority: model.contextWindow → provider.llm.contextWindow → family table → 0.
//! Used by ringInfo (chat-view) and parseModelsApiResponse to fill missing
//! context window data from API responses that don't include context_window.

import type { ModelMeta, Provider } from "@codeman-frontend/shared/lib/types";

/** Provider-family → known context window. Key is a prefix match against model id. */
const FAMILY_CONTEXT_WINDOW: Record<string, number> = {
  "MiniMax-M": 200_000,
};

/**
 * Resolve context window for a model using three layers:
 * 1. model.contextWindow — set by API if provider returns context_window
 * 2. provider.llm.contextWindow — user-configured provider-wide window
 * 3. FAMILY_CONTEXT_WINDOW[prefix] — hardcoded fallback per known model family
 * 4. 0 — nothing matched
 */
export function lookupContextWindow(model: ModelMeta, provider: Provider): number {
  // Layer 1: model-level
  if (model.contextWindow != null && model.contextWindow > 0) {
    return model.contextWindow;
  }

  // Layer 2: provider-level
  if (provider.llm.contextWindow != null && provider.llm.contextWindow > 0) {
    return provider.llm.contextWindow;
  }

  // Layer 3: family prefix match
  const modelId = model.id;
  for (const prefix of Object.keys(FAMILY_CONTEXT_WINDOW)) {
    if (modelId.startsWith(prefix)) {
      return FAMILY_CONTEXT_WINDOW[prefix];
    }
  }

  return 0;
}
