
import {
  createProvider,
  type Provider as PiProvider,
  type Model as PiModel,
  type ApiKeyAuth,
  type ProviderAuth,
} from "@earendil-works/pi-ai";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { parseModelsApiResponse } from "@codeman-frontend/shared/lib/parse-models-api-response";
import type { ModelMeta } from "@codeman-frontend/shared/lib/types";

/** 运行时向 adapter 提供的 provider 片段(非完整 settings Provider;runtime 只持有 ProviderConfig) */
export interface PiProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: ModelMeta[];
  modelsEndpoint?: string;
}

function modelMetaToPiModel(meta: ModelMeta, baseUrl: string, providerId: string): PiModel<"anthropic-messages"> {
  return {
    id: meta.id,
    name: meta.label,
    api: "anthropic-messages",
    provider: providerId,
    baseUrl,
    reasoning: meta.thinking ?? false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: meta.contextWindow ?? 200_000,
    maxTokens: 8192,
  };
}

function buildApiKeyAuth(apiKey: string): ApiKeyAuth {
  return {
    name: "API key",
    resolve: async () => ({ auth: { apiKey } }),
  };
}

export function createProviderFromConfig(cfg: PiProviderConfig): PiProvider<"anthropic-messages"> {
  const piModels: PiModel<"anthropic-messages">[] = cfg.models.map((m) =>
    modelMetaToPiModel(m, cfg.baseUrl, cfg.id),
  );
  const auth: ProviderAuth = { apiKey: buildApiKeyAuth(cfg.apiKey) };
  return createProvider<"anthropic-messages">({
    id: cfg.id,
    name: cfg.name,
    baseUrl: cfg.baseUrl,
    auth,
    models: piModels,
    ...(cfg.modelsEndpoint
      ? {
          refreshModels: async () => {
            const res = await fetch(cfg.modelsEndpoint!, {
              headers: { Authorization: `Bearer ${cfg.apiKey}` },
            });
            if (!res.ok) { throw new Error(`HTTP ${res.status}`); }
            const json = await res.json();
            return parseModelsApiResponse(json).map((m) =>
              modelMetaToPiModel(m, cfg.baseUrl, cfg.id),
            );
          },
        }
      : {}),
    api: anthropicMessagesApi(),
  });
}

export function findDefaultModel(
  provider: PiProvider<"anthropic-messages">,
  defaultModelId: string,
): PiModel<"anthropic-messages"> {
  const models = provider.getModels();
  const found = models.find((m) => m.id === defaultModelId);
  if (found) { return found; }
  return {
    id: defaultModelId || "auto",
    name: defaultModelId || "auto",
    api: "anthropic-messages",
    provider: provider.id,
    baseUrl: provider.baseUrl ?? "",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
  };
}
