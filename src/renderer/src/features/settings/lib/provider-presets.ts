// Provider preset for settings provider library .
//
// 数据来自 models.dev（本地 .repos/models.dev），由 scripts/extract-providers.mjs
// 生成 providers.json（勿手改该文件）。providers.json 校验失败时回退到 FALLBACK_PRESETS。

import providersJson from "./providers.json";
import type { ModelMeta } from "@codeman-frontend/shared/lib/types";

/**
 * Provider preset for settings provider library .
 * 数据由 scripts/extract-providers.mjs 从 models.dev 提取。
 */
export interface ProviderPreset {
  /** Unique identifier, e.g. "deepseek" */
  id: string;
  /** Display name, e.g. "DeepSeek" */
  label: string;
  /** Anthropic 兼容 Base URL */
  baseUrl: string;
  /** Default model ID */
  defaultModel: string;
  /** Extracted list of available models */
  models: ModelMeta[];
  /** Optional: known models endpoint. If unknown, leave undefined */
  modelsEndpoint?: string;
  /** Provider category */
  category: "official" | "cn_official" | "third_party" | "aggregator";
}

const makeModel = (id: string, label: string): ModelMeta => ({
  id,
  label,
  thinking: false,
});

// 兜底预设：providers.json 缺失或校验失败时使用（极简，仅保证可用）。
const FALLBACK_PRESETS: ProviderPreset[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/anthropic",
    defaultModel: "deepseek-v4-flash",
    models: [makeModel("deepseek-v4-flash", "DeepSeek V4 Flash")],
    modelsEndpoint: "https://api.deepseek.com/models",
    category: "cn_official",
  },
  {
    id: "kimi",
    label: "Kimi (Moonshot)",
    baseUrl: "https://api.moonshot.cn/anthropic",
    defaultModel: "kimi-k3",
    models: [makeModel("kimi-k3", "Kimi K3")],
    category: "cn_official",
  },
  {
    id: "minimax",
    label: "MiniMax",
    baseUrl: "https://api.minimaxi.com/anthropic",
    defaultModel: "MiniMax-M3",
    models: [makeModel("MiniMax-M3", "MiniMax-M3")],
    category: "cn_official",
  },
  {
    id: "zhipu",
    label: "Zhipu GLM",
    baseUrl: "https://open.bigmodel.cn/api/anthropic",
    defaultModel: "glm-5.2",
    models: [makeModel("glm-5.2", "GLM-5.2")],
    category: "cn_official",
  },
];

const VALID_CATEGORIES: ReadonlyArray<ProviderPreset["category"]> = [
  "official",
  "cn_official",
  "third_party",
  "aggregator",
];

function isModelMeta(v: unknown): v is ModelMeta {
  if (typeof v !== "object" || v === null) {return false;}
  const m = v as Record<string, unknown>;
  return (
    typeof m.id === "string" &&
    typeof m.label === "string" &&
    (m.contextWindow === undefined || typeof m.contextWindow === "number") &&
    typeof m.deprecated === "boolean" &&
    typeof m.thinking === "boolean"
  );
}

function isProviderPreset(v: unknown): v is ProviderPreset {
  if (typeof v !== "object" || v === null) {return false;}
  const p = v as Record<string, unknown>;
  return (
    typeof p.id === "string" &&
    typeof p.label === "string" &&
    typeof p.baseUrl === "string" &&
    p.baseUrl.startsWith("http") &&
    typeof p.defaultModel === "string" &&
    Array.isArray(p.models) &&
    p.models.length > 0 &&
    p.models.every(isModelMeta) &&
    (p.modelsEndpoint === undefined || typeof p.modelsEndpoint === "string") &&
    typeof p.category === "string" &&
    VALID_CATEGORIES.includes(p.category as ProviderPreset["category"])
  );
}

const isProviderPresets = (v: unknown): v is ProviderPreset[] =>
  Array.isArray(v) && v.length > 0 && v.every(isProviderPreset);

const raw: unknown = providersJson;
const data = (raw as { providers?: unknown } | null)?.providers;

export const PROVIDER_PRESETS: ProviderPreset[] = isProviderPresets(data)
  ? data
  : FALLBACK_PRESETS;
