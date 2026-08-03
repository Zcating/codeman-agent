// Adapted from CC-Switch (https://github.com/farion1231/cc-switch), MIT License, Copyright (c) 2025 Jason Young

import type { ModelMeta } from "@codeman-frontend/shared/lib/types";

/**
 * Provider preset for settings provider library (ADR-0050 D1).
 * This is a static hardcoded list - no runtime fetching.
 */
export interface ProviderPreset {
  /** Unique identifier, e.g. "deepseek" */
  id: string;
  /** Display name, e.g. "DeepSeek" */
  label: string;
  /** Base URL for API requests */
  baseUrl: string;
  /** Default model ID */
  defaultModel: string;
  /** Hardcoded list of available models */
  models: ModelMeta[];
  /** Optional: known models endpoint. If unknown, leave undefined */
  modelsEndpoint?: string;
  /** Provider category */
  category: "official" | "cn_official" | "third_party" | "aggregator";
}

const makeModel = (id: string, label: string): ModelMeta => ({
  id,
  label,
  deprecated: false,
  thinking: false,
});

export const PROVIDER_PRESETS: ProviderPreset[] = [
  // ===== official =====
  {
    id: "claude",
    label: "Claude Official",
    baseUrl: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-5",
    models: [
      makeModel("claude-sonnet-5", "Claude Sonnet 5"),
      makeModel("claude-haiku-4.5", "Claude Haiku 4.5"),
      makeModel("claude-opus-5", "Claude Opus 5"),
    ],
    modelsEndpoint: "https://api.anthropic.com/v1/models",
    category: "official",
  },

  // ===== cn_official (Chinese official providers) =====
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/anthropic",
    defaultModel: "deepseek-v4-pro",
    models: [
      makeModel("deepseek-v4-pro", "DeepSeek V4 Pro"),
      makeModel("deepseek-v4-flash", "DeepSeek V4 Flash"),
    ],
    modelsEndpoint: "https://api.deepseek.com/models",
    category: "cn_official",
  },
  {
    id: "kimi",
    label: "Kimi (Moonshot)",
    baseUrl: "https://api.moonshot.cn/anthropic",
    defaultModel: "kimi-k2.7-code",
    models: [makeModel("kimi-k2.7-code", "Kimi K2.7 Code")],
    category: "cn_official",
  },
  {
    id: "minimax",
    label: "MiniMax",
    baseUrl: "https://api.minimaxi.com/anthropic",
    defaultModel: "MiniMax-M2.7",
    models: [makeModel("MiniMax-M2.7", "MiniMax M2.7")],
    category: "cn_official",
  },
  {
    id: "zhipu",
    label: "Zhipu GLM",
    baseUrl: "https://open.bigmodel.cn/api/anthropic",
    defaultModel: "glm-5.1",
    models: [makeModel("glm-5.1", "GLM-5.1")],
    category: "cn_official",
  },
  {
    id: "bailian",
    label: "Bailian (Alibaba)",
    baseUrl: "https://dashscope.aliyuncs.com/apps/anthropic",
    defaultModel: "qwen-turbo",
    models: [makeModel("qwen-turbo", "Qwen Turbo")],
    category: "cn_official",
  },
  {
    id: "bailian-coding",
    label: "Bailian For Coding",
    baseUrl: "https://coding.dashscope.aliyuncs.com/apps/anthropic",
    defaultModel: "qwen-coder-turbo",
    models: [makeModel("qwen-coder-turbo", "Qwen Coder Turbo")],
    category: "cn_official",
  },
  {
    id: "baidu-qianfan",
    label: "Baidu Qianfan",
    baseUrl: "https://qianfan.baidubce.com/anthropic/coding",
    defaultModel: "qianfan-code-latest",
    models: [makeModel("qianfan-code-latest", "Qianfan Code Latest")],
    category: "cn_official",
  },
  {
    id: "stepfun",
    label: "StepFun",
    baseUrl: "https://api.stepfun.com/step_plan",
    defaultModel: "step-3.5-flash-2603",
    models: [makeModel("step-3.5-flash-2603", "Step 3.5 Flash 2603")],
    category: "cn_official",
  },
  {
    id: "volcengine",
    label: "火山Agentplan (Volcengine)",
    baseUrl: "https://ark.cn-beijing.volces.com/api/coding",
    defaultModel: "ark-code-latest",
    models: [makeModel("ark-code-latest", "Ark Code Latest")],
    category: "cn_official",
  },
  {
    id: "doubao-seed",
    label: "豆包Seed (DouBao)",
    baseUrl: "https://ark.cn-beijing.volces.com/api/compatible",
    defaultModel: "doubao-seed-2-1-pro-260628",
    models: [makeModel("doubao-seed-2-1-pro-260628", "DouBao Seed 2.1 Pro")],
    category: "cn_official",
  },
  {
    id: "longcat",
    label: "Longcat",
    baseUrl: "https://api.longcat.chat/anthropic",
    defaultModel: "LongCat-2.0",
    models: [makeModel("LongCat-2.0", "LongCat 2.0")],
    category: "cn_official",
  },
  {
    id: "bailing",
    label: "BaiLing",
    baseUrl: "https://api.tbox.cn/api/anthropic",
    defaultModel: "Ling-2.5-1T",
    models: [makeModel("Ling-2.5-1T", "Ling 2.5 1T")],
    category: "cn_official",
  },

  // ===== aggregator =====
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api",
    defaultModel: "anthropic/claude-sonnet-5",
    models: [
      makeModel("anthropic/claude-sonnet-5", "Claude Sonnet 5"),
      makeModel("anthropic/claude-haiku-4.5", "Claude Haiku 4.5"),
      makeModel("anthropic/claude-opus-5", "Claude Opus 5"),
    ],
    category: "aggregator",
  },
  {
    id: "siliconflow",
    label: "SiliconFlow",
    baseUrl: "https://api.siliconflow.cn",
    defaultModel: "Pro/MiniMaxAI/MiniMax-M2.7",
    models: [makeModel("Pro/MiniMaxAI/MiniMax-M2.7", "MiniMax M2.7")],
    category: "aggregator",
  },
  {
    id: "siliconflow-en",
    label: "SiliconFlow (EN)",
    baseUrl: "https://api.siliconflow.com",
    defaultModel: "MiniMaxAI/MiniMax-M2.7",
    models: [makeModel("MiniMaxAI/MiniMax-M2.7", "MiniMax M2.7")],
    category: "aggregator",
  },
  {
    id: "modelscope",
    label: "ModelScope",
    baseUrl: "https://api-inference.modelscope.cn",
    defaultModel: "ZhipuAI/GLM-5.1",
    models: [makeModel("ZhipuAI/GLM-5.1", "GLM-5.1")],
    category: "aggregator",
  },
  {
    id: "zetaapi",
    label: "ZetaAPI",
    baseUrl: "https://api.zetaapi.ai",
    defaultModel: "anthropic/claude-sonnet-5",
    models: [makeModel("anthropic/claude-sonnet-5", "Claude Sonnet 5")],
    category: "aggregator",
  },
  {
    id: "shengsuanyun",
    label: "盛算云 (Shengsuanyun)",
    baseUrl: "https://router.shengsuanyun.com/api",
    defaultModel: "anthropic/claude-sonnet-5",
    models: [
      makeModel("anthropic/claude-sonnet-5", "Claude Sonnet 5"),
      makeModel("anthropic/claude-haiku-4.5", "Claude Haiku 4.5"),
      makeModel("anthropic/claude-opus-5", "Claude Opus 5"),
    ],
    category: "aggregator",
  },

  // ===== third_party =====
  {
    id: "gemini",
    label: "Gemini Native",
    baseUrl: "https://generativelanguage.googleapis.com",
    defaultModel: "gemini-3.6-flash",
    models: [makeModel("gemini-3.6-flash", "Gemini 3.6 Flash")],
    category: "third_party",
  },
  {
    id: "grok",
    label: "Grok",
    baseUrl: "https://api.x.ai/anthropic",
    defaultModel: "grok-4",
    models: [makeModel("grok-4", "Grok 4")],
    category: "third_party",
  },
];
