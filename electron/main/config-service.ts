//! electron/main/config-service.ts — 类型化的 env 配置访问层。
//!
//! mock-server 的所有 `process.env` 读取统一收敛到这里。设计目标:
//! - 类型安全:每个字段强类型 + 数值/布尔强制转换 + 范围校验 + 越界 fallback
//! - 测试友好:`EnvReader` 接口可注入,单测不需要 mutate `process.env`
//! - 单一入口:加新 env var 只改一个文件 + 一个 `MockServerConfig` 字段
//! - 纯函数:`readMockServerConfig()` 不缓存,每次调用都从 env 重新读
//!   (保持 mock-server 当前 per-request 读取 `STREAM_DELAY_MS`/`DELTA_SIZE` 的语义)
//!
//! 使用:
//!   import { readMockServerConfig } from "./config-service";
//!   const cfg = readMockServerConfig();
//!   cfg.port;             // number, 1..65535, 默认 50000
//!   cfg.isProduction;     // boolean, NODE_ENV === "production"
//!   cfg.forceEnableInProduction; // boolean, CODEMAN_MOCK_FORCE truthy
//!
//! 测试 mock:
//!   const env: EnvReader = { get: (k) => ({ CODEMAN_MOCK_PORT: "60000" })[k] };
//!   readMockServerConfig(env); // → { port: 60000, ... }

import process from "node:process";

// ─── Reader 接口 (测试边界) ──────────────────────────────────────────────────

/** 环境变量读取器。默认实现是 `processEnvReader`,测试里可以注入内存对象。 */
export interface EnvReader {
  get(key: string): string | undefined;
}

/** 默认 reader — 直接读 `process.env`。生产代码使用这个。 */
export const processEnvReader: EnvReader = {
  get: (key) => process.env[key],
};

// ─── Logger 接口 (避免直接依赖 console) ─────────────────────────────────────

export interface ConfigLogger {
  warn(msg: string): void;
}

const consoleLogger: ConfigLogger = {
  warn: (msg) => {
    // eslint-disable-next-line no-console
    console.warn(msg);
  },
};

// ─── Mock-server 配置 shape ─────────────────────────────────────────────────

/** mock-server 关心的全部 env 配置。增加新 env var = 增加一个字段 + 一个读取语句。 */
export interface MockServerConfig {
  /** `CODEMAN_MOCK_PORT` — TCP 端口 (默认 50000, 范围 1..65535)。 */
  port: number;
  /** `CODEMAN_MOCK_HOST` — 绑定地址 (默认 127.0.0.1)。 */
  host: string;
  /** `CODEMAN_MOCK_STREAM_DELAY_MS` — SSE event 间延迟 (默认 1, 范围 0..10000)。 */
  streamDelayMs: number;
  /** `CODEMAN_MOCK_DELTA_SIZE` — 每个 content_block_delta 的字符数 (默认 1, 范围 1..100)。
   *  默认 1 char/event = real Anthropic API 的 per-token 粒度 (真实 LLM streaming
   *  每次 SSE event 也是 1 token ≈ 1 char for 中文)。诊断 streaming 行为更细粒度,
   *  但每次 Solid re-render 也是 1 char,如果 console 出现 per-char log spam 应该
   *  直接删 log,不要把 deltaSize 调大 — 那是 brittle workaround,会破坏现有 SSE
   *  event-shape 测试。 */
  deltaSize: number;
  /** `NODE_ENV === "production"`。 */
  isProduction: boolean;
  /** `CODEMAN_MOCK_FORCE` 任意 truthy 字符串 → 生产环境也启动 server。 */
  forceEnableInProduction: boolean;
}

// ─── 默认值(集中维护,便于审计) ──────────────────────────────────────────────

export const DEFAULTS = {
  port: 50000,
  host: "127.0.0.1",
  streamDelayMs: 1,
  deltaSize: 1,
} as const;

// ─── 内部:数值 env 解析 + 校验 + fallback ────────────────────────────────────

function parseIntEnv(
  env: EnvReader,
  key: string,
  defaultValue: number,
  min: number,
  max: number,
  logger: ConfigLogger,
): number {
  const raw = env.get(key);
  if (raw === undefined || raw === "") {
    return defaultValue;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < min || n > max) {
    logger.warn(`[config-service] invalid ${key}="${raw}", fallback to ${defaultValue}`);
    return defaultValue;
  }
  return n;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** 一次性读取 mock-server 全部 env 配置。纯函数:不缓存,每次调用重新读 env。 */
export function readMockServerConfig(
  env: EnvReader = processEnvReader,
  logger: ConfigLogger = consoleLogger,
): MockServerConfig {
  // String envs: treat both `undefined` (unset) AND `""` (empty) as "use default"
  // — matches the numeric parser's behavior above (no point special-casing).
  const hostRaw = env.get("CODEMAN_MOCK_HOST");
  const forceRaw = env.get("CODEMAN_MOCK_FORCE");
  return {
    port: parseIntEnv(env, "CODEMAN_MOCK_PORT", DEFAULTS.port, 1, 65535, logger),
    host: hostRaw !== undefined && hostRaw !== "" ? hostRaw : DEFAULTS.host,
    streamDelayMs: parseIntEnv(env, "CODEMAN_MOCK_STREAM_DELAY_MS", DEFAULTS.streamDelayMs, 0, 10000, logger),
    deltaSize: parseIntEnv(env, "CODEMAN_MOCK_DELTA_SIZE", DEFAULTS.deltaSize, 1, 100, logger),
    isProduction: env.get("NODE_ENV") === "production",
    forceEnableInProduction: forceRaw !== undefined && forceRaw !== "",
  };
}
