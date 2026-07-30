import type { Model } from "@earendil-works/pi-ai";
import type { Provider, ModelMeta } from "@codeman-frontend/shared/lib/types";

export class BuildModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuildModelError";
  }
}

export function buildModel(provider: Provider, modelId: string): Model<"anthropic-messages"> {
  if (!provider.apiKey) {
    throw new BuildModelError(`No API key configured for provider '${provider.id}'`);
  }

  const meta: ModelMeta | undefined = provider.llm.models.find((m) => m.id === modelId);

  if (!meta) {
    const available = provider.llm.models.map((m) => m.id).join(", ");
    throw new BuildModelError(
      `Model '${modelId}' not found in provider '${provider.id}'. Available: ${available || "none"}`,
    );
  }

  const model: Model<"anthropic-messages"> = {
    id: meta.id,
    name: meta.label,
    api: "anthropic-messages",
    provider: provider.id,
    baseUrl: provider.llm.baseUrl ?? "",
    reasoning: meta.thinking,
    input: ["text"], 
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: meta.contextWindow ?? 128000,
    maxTokens: 8192,
  };

  return model;
}
