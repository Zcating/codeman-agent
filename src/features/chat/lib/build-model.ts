//! buildModel — 从 LLMProvider 配置构建 pi-ai Model 对象。
//! 这是内部 helper，不通过 barrel (index.ts) 导出。
import type { Model } from "@mariozechner/pi-ai";
import type { LLMProvider } from "../../../shared/lib/types";

export function buildModel(activeProvider: LLMProvider): Model<any> {
  return {
    id: activeProvider.default_model ?? "auto",
    name: activeProvider.label,
    api: activeProvider.api_type,
    provider: activeProvider.id as any,
    baseUrl: activeProvider.base_url ?? "",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
  };
}
