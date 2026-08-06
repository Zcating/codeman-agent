// 从 .repos/models.dev（models.dev 本地镜像）提取 provider 预设数据，
// 生成 src/renderer/src/features/settings/lib/providers.json。
//
// 用法: node scripts/extract-providers.mjs
// 数据源: https://github.com/sst/models.dev (local clone at .repos/models.dev)
//
// 说明:
// - 每个预设的 baseUrl 使用 codeman-agent 已验证的 Anthropic 兼容端点（models.dev
//   的 api 字段多为 OpenAI 兼容端点，不能直接使用）。
// - 模型元数据来自 providers/<id>/models/*.toml，支持 base_model 继承
//   （provider 文件缺省字段从 models/<lab>/<id>.toml 读取）。
// - defaultModel 取 release_date 最新的模型。

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MODELS_DEV = join(ROOT, ".repos", "models.dev");
const OUT_FILE = join(
  ROOT,
  "src",
  "renderer",
  "src",
  "features",
  "settings",
  "lib",
  "providers.json",
);

/**
 * 提取清单：models.dev provider 目录 -> codeman-agent 预设。
 * baseUrl 为已验证的 Anthropic 兼容端点（勿从 models.dev 直接抄 api 字段）。
 */
const PRESET_SOURCES = [
  {
    id: "deepseek",
    label: "DeepSeek",
    source: "deepseek",
    baseUrl: "https://api.deepseek.com/anthropic",
    modelsEndpoint: "https://api.deepseek.com/models",
    category: "cn_official",
  },
  {
    id: "kimi",
    label: "Kimi (Moonshot)",
    source: "moonshotai",
    baseUrl: "https://api.moonshot.cn/anthropic",
    category: "cn_official",
  },
  {
    id: "minimax",
    label: "MiniMax",
    source: "minimax",
    baseUrl: "https://api.minimaxi.com/anthropic",
    category: "cn_official",
  },
  {
    id: "zhipu",
    label: "Zhipu GLM",
    source: "zhipuai",
    baseUrl: "https://open.bigmodel.cn/api/anthropic",
    category: "cn_official",
  },
];

// ---- 极简 TOML 解析（仅覆盖 models.dev 使用的子集）----

function parseValue(raw) {
  const v = raw.trim();
  if (v.startsWith('"')) {
    return v.replace(/^"|"$/g, "").replace(/\\"/g, '"');
  }
  if (v === "true") {return true;}
  if (v === "false") {return false;}
  const num = Number(v.replace(/_/g, ""));
  return Number.isNaN(num) ? v : num;
}

/**
 * 返回 { __top: {...}, <section>: {...} }。
 * 顶层 key 进 __top；[section] 下 key 进对应 section；数组表（[[x]]）忽略。
 */
function parseToml(text) {
  const doc = { __top: {} };
  let section = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {continue;}
    if (line.startsWith("[")) {
      const m = line.match(/^\[\[?([a-zA-Z0-9_.-]+)\]\]?$/);
      section = m ? m[1] : null;
      continue;
    }
    const eq = line.indexOf("=");
    if (eq < 0) {continue;}
    const key = line.slice(0, eq).trim();
    const target = section === null ? doc.__top : (doc[section] ??= {});
    target[key] = parseValue(line.slice(eq + 1));
  }
  return doc;
}

// ---- 模型元数据读取（含 base_model 继承）----

function readModelFile(relPath) {
  const abs = join(MODELS_DEV, ...relPath.split("/"));
  return parseToml(readFileSync(abs, "utf8"));
}

function resolveModelMeta(sourceId, fileName) {
  const providerDoc = readModelFile(`providers/${sourceId}/models/${fileName}`);
  const top = { ...providerDoc.__top };
  const limit = providerDoc.limit ? { ...providerDoc.limit } : {};

  // base_model 继承：缺省字段从 models/<lab>/<id>.toml 补齐
  const base = providerDoc.__top.base_model;
  if (typeof base === "string") {
    const baseDoc = readModelFile(`models/${base}.toml`);
    for (const key of ["name", "reasoning", "status", "release_date"]) {
      if (top[key] === undefined) {top[key] = baseDoc.__top[key];}
    }
    if (limit.context === undefined && baseDoc.limit?.context !== undefined) {
      limit.context = baseDoc.limit.context;
    }
  }

  return { top, limit };
}

function extractModels(sourceId) {
  const modelsDir = join(MODELS_DEV, "providers", sourceId, "models");
  const files = readdirSync(modelsDir).filter((f) => f.endsWith(".toml"));
  return files.map((fileName) => {
    const { top, limit } = resolveModelMeta(sourceId, fileName);
    const id = fileName.slice(0, -".toml".length);
    return {
      id,
      label: typeof top.name === "string" ? top.name : id,
      contextWindow: typeof limit.context === "number" ? limit.context : undefined,
      deprecated: top.status === "deprecated",
      thinking: top.reasoning === true,
      releaseDate: typeof top.release_date === "string" ? top.release_date : "",
    };
  });
}

function pickDefaultModel(models) {
  const withDate = models
    .filter((m) => m.releaseDate)
    .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
  if (withDate.length > 0) {return withDate[0].id;}
  return [...models].sort((a, b) => a.id.localeCompare(b.id))[0]?.id;
}

// ---- 生成 ----

function buildPreset(source) {
  const extracted = extractModels(source.source);
  const defaultModel = pickDefaultModel(extracted);
  const models = extracted.map(({ id, label, contextWindow, deprecated, thinking }) => ({
    id,
    label,
    ...(contextWindow !== undefined ? { contextWindow } : {}),
    deprecated,
    thinking,
  }));
  if (models.length === 0) {
    throw new Error(`[extract-providers] ${source.id}: models 目录为空`);
  }
  const preset = {
    id: source.id,
    label: source.label,
    baseUrl: source.baseUrl,
    defaultModel,
    models,
    category: source.category,
  };
  if (source.modelsEndpoint) {
    preset.modelsEndpoint = source.modelsEndpoint;
  }
  if (!models.some((m) => m.id === defaultModel)) {
    throw new Error(`[extract-providers] ${source.id}: defaultModel ${defaultModel} 不在 models 中`);
  }
  return preset;
}

const providers = PRESET_SOURCES.map(buildPreset);
const out = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: "https://github.com/sst/models.dev (local clone at .repos/models.dev)",
  providers,
};

writeFileSync(OUT_FILE, `${JSON.stringify(out, null, 2)}\n`);
console.log(`[extract-providers] wrote ${OUT_FILE} (${providers.length} presets, ${providers.reduce((n, p) => n + p.models.length, 0)} models)`);
