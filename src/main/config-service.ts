
import process from "node:process";


export interface EnvReader {
  get(key: string): string | undefined;
}

export const processEnvReader: EnvReader = {
  get: (key) => process.env[key],
};


export interface ConfigLogger {
  warn(msg: string): void;
}

const consoleLogger: ConfigLogger = {
  warn: (msg) => {
    console.warn(msg);
  },
};


export interface MockServerConfig {
  port: number;
  host: string;
  streamDelayMs: number;
  deltaSize: number;
  isProduction: boolean;
  forceEnableInProduction: boolean;
}


export const DEFAULTS = {
  port: 50000,
  host: "127.0.0.1",
  streamDelayMs: 1,
  deltaSize: 1,
} as const;


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


export function readMockServerConfig(
  env: EnvReader = processEnvReader,
  logger: ConfigLogger = consoleLogger,
): MockServerConfig {
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
