//! buildModel — 从 V1.5 Provider 配置构建 pi-ai Model 对象。
//!
//! T14: 接受 Provider + modelId，从 provider.llm.models 查找 ModelMeta 获取
//! context_window / thinking 标志，并验证 api_key 存在。
//!
//! NOTE: pi-ai 的 getModel() 仅适用于内置注册表 providers (openai/anthropic/google 等)。
//! V1.5 自定义 providers (minimax/deepseek) 需要手动构造 Model 对象。
import type { Model } from "@earendil-works/pi-ai";
import type { Provider, ModelMeta } from "../../../shared/lib/types";

export class BuildModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuildModelError";
  }
}

/**
 * 从 V1.5 Provider 配置构建 pi-ai Model 对象。
 *
 * @param provider - V1.5 Provider 对象（包含 llm 配置）
 * @param modelId - 要使用的模型 ID（必须存在于 provider.llm.models 中）
 * @returns Model<'anthropic-messages'> 对象
 * @throws BuildModelError - 当模型不存在或 API key ref 缺失时
 *
 * T14: 使用 provider.llm.base_url 作为 baseUrl，
 * provider.api_key 做 API key 存在性验证（实际 key 由 runtime 运行时从 Provider.api_key 读取），
 * provider.llm.api_type 固定为 "anthropic-messages" (ADR-0011)。
 */
export function buildModel(provider: Provider, modelId: string): Model<"anthropic-messages"> {
  // 1. 验证 apiKey 存在
  if (!provider.apiKey) {
    throw new BuildModelError(`No API key configured for provider '${provider.id}'`);
  }

  // 2. 在 provider.llm.models 中查找 ModelMeta
  const meta: ModelMeta | undefined = provider.llm.models.find((m) => m.id === modelId);

  if (!meta) {
    const available = provider.llm.models.map((m) => m.id).join(", ");
    throw new BuildModelError(
      `Model '${modelId}' not found in provider '${provider.id}'. Available: ${available || "none"}`,
    );
  }

  // 3. 构造 Model 对象
  // ADR-0011: api_type 固定为 "anthropic-messages"
  // NOTE: API key 实际值由 runtime 运行时从 Provider.api_key 读取（ADR-0015 后明文进 Settings JSON），
  // 此处仅返回 Model 对象结构，apiKey 字段由 ProviderTransport.getApiKey 回调填充。
  const model: Model<"anthropic-messages"> = {
    id: meta.id,
    name: meta.label,
    api: "anthropic-messages",
    provider: provider.id,
    baseUrl: provider.llm.baseUrl ?? "",
    reasoning: meta.thinking,
    input: ["text"], // V1.5 models 目前仅支持文本输入
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: meta.contextWindow ?? 128000,
    maxTokens: 8192,
  };

  return model;
}
