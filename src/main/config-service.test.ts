
import { describe, it, expect } from "vitest";
import {
  readMockServerConfig,
  processEnvReader,
  type EnvReader,
  type ConfigLogger,
} from "./config-service";


function readerFromMap(map: Record<string, string | undefined>): EnvReader {
  return { get: (k) => map[k] };
}

function silentLogger(): { logger: ConfigLogger; warnings: string[] } {
  const warnings: string[] = [];
  return {
    warnings,
    logger: { warn: (msg) => warnings.push(msg) },
  };
}


describe("readMockServerConfig — defaults (empty env)", () => {
  it("空 env → port=50000, host=127.0.0.1, streamDelayMs=1, deltaSize=1", () => {
    const cfg = readMockServerConfig(readerFromMap({}));
    expect(cfg).toEqual({
      port: 50000,
      host: "127.0.0.1",
      streamDelayMs: 1,
      deltaSize: 1,
      isProduction: false,
      forceEnableInProduction: false,
    });
  });

  it("空字符串 env (e.g. CODEMAN_MOCK_PORT='') → fallback to default, no warn", () => {
    const { logger, warnings } = silentLogger();
    const cfg = readMockServerConfig(
      readerFromMap({
        CODEMAN_MOCK_PORT: "",
        CODEMAN_MOCK_STREAM_DELAY_MS: "",
        CODEMAN_MOCK_DELTA_SIZE: "",
        CODEMAN_MOCK_HOST: "",
      }),
      logger,
    );
    expect(cfg.port).toBe(50000);
    expect(cfg.streamDelayMs).toBe(1);
    expect(cfg.deltaSize).toBe(1);
    expect(cfg.host).toBe("127.0.0.1");
    expect(warnings).toEqual([]);
  });
});


describe("readMockServerConfig — CODEMAN_MOCK_PORT", () => {
  it("valid integer → parsed", () => {
    const cfg = readMockServerConfig(readerFromMap({ CODEMAN_MOCK_PORT: "60000" }));
    expect(cfg.port).toBe(60000);
  });

  it("valid range boundary (1) → 1", () => {
    const cfg = readMockServerConfig(readerFromMap({ CODEMAN_MOCK_PORT: "1" }));
    expect(cfg.port).toBe(1);
  });

  it("valid range boundary (65535) → 65535", () => {
    const cfg = readMockServerConfig(readerFromMap({ CODEMAN_MOCK_PORT: "65535" }));
    expect(cfg.port).toBe(65535);
  });

  it("out of range (>65535) → fallback + warn", () => {
    const { logger, warnings } = silentLogger();
    const cfg = readMockServerConfig(readerFromMap({ CODEMAN_MOCK_PORT: "70000" }), logger);
    expect(cfg.port).toBe(50000);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("CODEMAN_MOCK_PORT");
    expect(warnings[0]).toContain("70000");
    expect(warnings[0]).toContain("50000");
  });

  it("out of range (0) → fallback + warn", () => {
    const { logger, warnings } = silentLogger();
    const cfg = readMockServerConfig(readerFromMap({ CODEMAN_MOCK_PORT: "0" }), logger);
    expect(cfg.port).toBe(50000);
    expect(warnings).toHaveLength(1);
  });

  it("non-numeric (NaN) → fallback + warn", () => {
    const { logger, warnings } = silentLogger();
    const cfg = readMockServerConfig(readerFromMap({ CODEMAN_MOCK_PORT: "abc" }), logger);
    expect(cfg.port).toBe(50000);
    expect(warnings).toHaveLength(1);
  });

  it("negative → fallback + warn", () => {
    const { logger, warnings } = silentLogger();
    const cfg = readMockServerConfig(readerFromMap({ CODEMAN_MOCK_PORT: "-1" }), logger);
    expect(cfg.port).toBe(50000);
    expect(warnings).toHaveLength(1);
  });
});

describe("readMockServerConfig — CODEMAN_MOCK_STREAM_DELAY_MS", () => {
  it("valid (0..10000) → parsed", () => {
    expect(readMockServerConfig(readerFromMap({ CODEMAN_MOCK_STREAM_DELAY_MS: "0" })).streamDelayMs).toBe(0);
    expect(readMockServerConfig(readerFromMap({ CODEMAN_MOCK_STREAM_DELAY_MS: "100" })).streamDelayMs).toBe(100);
    expect(readMockServerConfig(readerFromMap({ CODEMAN_MOCK_STREAM_DELAY_MS: "10000" })).streamDelayMs).toBe(10000);
  });

  it("0 是合法值 (mock-server 把 0 解析为 'no setTimeout, use setImmediate')", () => {
    const cfg = readMockServerConfig(readerFromMap({ CODEMAN_MOCK_STREAM_DELAY_MS: "0" }));
    expect(cfg.streamDelayMs).toBe(0);
  });

  it("out of range (>10000) → fallback + warn", () => {
    const { logger, warnings } = silentLogger();
    const cfg = readMockServerConfig(readerFromMap({ CODEMAN_MOCK_STREAM_DELAY_MS: "20000" }), logger);
    expect(cfg.streamDelayMs).toBe(1);
    expect(warnings[0]).toContain("CODEMAN_MOCK_STREAM_DELAY_MS");
  });

  it("negative → fallback + warn", () => {
    const { logger, warnings } = silentLogger();
    const cfg = readMockServerConfig(readerFromMap({ CODEMAN_MOCK_STREAM_DELAY_MS: "-5" }), logger);
    expect(cfg.streamDelayMs).toBe(1);
    expect(warnings).toHaveLength(1);
  });
});

describe("readMockServerConfig — CODEMAN_MOCK_DELTA_SIZE", () => {
  it("valid (1..100) → parsed", () => {
    expect(readMockServerConfig(readerFromMap({ CODEMAN_MOCK_DELTA_SIZE: "1" })).deltaSize).toBe(1);
    expect(readMockServerConfig(readerFromMap({ CODEMAN_MOCK_DELTA_SIZE: "10" })).deltaSize).toBe(10);
    expect(readMockServerConfig(readerFromMap({ CODEMAN_MOCK_DELTA_SIZE: "100" })).deltaSize).toBe(100);
  });

  it("0 → fallback + warn (下界是 1,不是 0)", () => {
    const { logger, warnings } = silentLogger();
    const cfg = readMockServerConfig(readerFromMap({ CODEMAN_MOCK_DELTA_SIZE: "0" }), logger);
    expect(cfg.deltaSize).toBe(1);
    expect(warnings).toHaveLength(1);
  });

  it("out of range (>100) → fallback + warn", () => {
    const { logger, warnings } = silentLogger();
    const cfg = readMockServerConfig(readerFromMap({ CODEMAN_MOCK_DELTA_SIZE: "200" }), logger);
    expect(cfg.deltaSize).toBe(1);
    expect(warnings).toHaveLength(1);
  });
});


describe("readMockServerConfig — CODEMAN_MOCK_HOST", () => {
  it("valid IP → parsed", () => {
    expect(readMockServerConfig(readerFromMap({ CODEMAN_MOCK_HOST: "0.0.0.0" })).host).toBe("0.0.0.0");
  });

  it("undefined → default 127.0.0.1", () => {
    expect(readMockServerConfig(readerFromMap({})).host).toBe("127.0.0.1");
  });

  it("空字符串 → default 127.0.0.1 (?? treats '' as nullish)", () => {
    expect(readMockServerConfig(readerFromMap({ CODEMAN_MOCK_HOST: "" })).host).toBe("127.0.0.1");
  });
});


describe("readMockServerConfig — isProduction", () => {
  it("NODE_ENV=production → true", () => {
    expect(readMockServerConfig(readerFromMap({ NODE_ENV: "production" })).isProduction).toBe(true);
  });

  it("NODE_ENV=development → false", () => {
    expect(readMockServerConfig(readerFromMap({ NODE_ENV: "development" })).isProduction).toBe(false);
  });

  it("NODE_ENV undefined → false", () => {
    expect(readMockServerConfig(readerFromMap({})).isProduction).toBe(false);
  });

  it("NODE_ENV=staging (or any non-production) → false (严格 === 比较)", () => {
    expect(readMockServerConfig(readerFromMap({ NODE_ENV: "staging" })).isProduction).toBe(false);
    expect(readMockServerConfig(readerFromMap({ NODE_ENV: "PRODUCTION" })).isProduction).toBe(false);
  });
});

describe("readMockServerConfig — forceEnableInProduction", () => {
  it("undefined → false", () => {
    expect(readMockServerConfig(readerFromMap({})).forceEnableInProduction).toBe(false);
  });

  it("空字符串 → false (空 ≠ truthy)", () => {
    expect(readMockServerConfig(readerFromMap({ CODEMAN_MOCK_FORCE: "" })).forceEnableInProduction).toBe(false);
  });

  it("任意 truthy 值 ('1' / 'true' / 'yes' / 'anything') → true", () => {
    expect(readMockServerConfig(readerFromMap({ CODEMAN_MOCK_FORCE: "1" })).forceEnableInProduction).toBe(true);
    expect(readMockServerConfig(readerFromMap({ CODEMAN_MOCK_FORCE: "true" })).forceEnableInProduction).toBe(true);
    expect(readMockServerConfig(readerFromMap({ CODEMAN_MOCK_FORCE: "yes" })).forceEnableInProduction).toBe(true);
    expect(readMockServerConfig(readerFromMap({ CODEMAN_MOCK_FORCE: "anything" })).forceEnableInProduction).toBe(true);
  });
});


describe("processEnvReader — wires to real process.env", () => {
  it("get(key) returns process.env[key]", () => {
    expect(processEnvReader.get("PATH")).toBe(process.env["PATH"]);
    expect(processEnvReader.get("__DEFINITELY_NOT_SET_XYZ__")).toBeUndefined();
  });

  it("readMockServerConfig() with no args uses processEnvReader", () => {
    const cfg = readMockServerConfig();
    expect(typeof cfg.port).toBe("number");
    expect(typeof cfg.host).toBe("string");
    expect(typeof cfg.streamDelayMs).toBe("number");
    expect(typeof cfg.deltaSize).toBe("number");
    expect(typeof cfg.isProduction).toBe("boolean");
    expect(typeof cfg.forceEnableInProduction).toBe("boolean");
  });
});


describe("readMockServerConfig — purity", () => {
  it("同一 reader 调用两次 → 同样结果 (无内部缓存副作用)", () => {
    const env = readerFromMap({ CODEMAN_MOCK_PORT: "12345" });
    const cfg1 = readMockServerConfig(env);
    const cfg2 = readMockServerConfig(env);
    expect(cfg1).toEqual(cfg2);
  });

  it("不同 env 对象 → 不同结果 (验证 reader 真的被调用)", () => {
    const cfg1 = readMockServerConfig(readerFromMap({ CODEMAN_MOCK_PORT: "10000" }));
    const cfg2 = readMockServerConfig(readerFromMap({ CODEMAN_MOCK_PORT: "20000" }));
    expect(cfg1.port).toBe(10000);
    expect(cfg2.port).toBe(20000);
  });
});
