



import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger, type LogLevel } from "@codeman-frontend/shared/lib/logger";

describe("logger", () => {
  let debugSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    debugSpy.mockRestore();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  
  function spyFor(method: LogLevel): ReturnType<typeof vi.spyOn> {
    switch (method) {
      case "debug":
        return debugSpy;
      case "info":
        return infoSpy;
      case "warn":
        return warnSpy;
      case "error":
        return errorSpy;
    }
  }

  describe("level 路由", () => {
    const cases: Array<{ method: keyof typeof logger; level: LogLevel; prefix: string }> = [
      { method: "debug", level: "debug", prefix: "[DEBUG]" },
      { method: "info", level: "info", prefix: "[INFO]" },
      { method: "warn", level: "warn", prefix: "[WARN]" },
      { method: "error", level: "error", prefix: "[ERROR]" },
    ];

    cases.forEach(({ method, level, prefix }) => {
      it(`${method} → console.${level} with ${prefix} prefix`, () => {
        logger[method]("测试消息", 1, { foo: "bar" });
        const spy = spyFor(level);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(`${prefix} 测试消息`, 1, { foo: "bar" });
      });
    });
  });

  describe("args 透传", () => {
    it("debug 多 args 全部透传", () => {
      const obj = { a: 1 };
      const err = new Error("boom");
      logger.debug("msg", "string", 42, obj, err);
      expect(debugSpy).toHaveBeenCalledWith("[DEBUG] msg", "string", 42, obj, err);
    });

    it("info 单 arg", () => {
      logger.info("msg", "single");
      expect(infoSpy).toHaveBeenCalledWith("[INFO] msg", "single");
    });

    it("warn 无额外 args（仅 msg）", () => {
      logger.warn("仅消息");
      expect(warnSpy).toHaveBeenCalledWith("[WARN] 仅消息");
    });

    it("error 接受 Error 实例（console.error 原生展开）", () => {
      const err = new Error("panic");
      logger.error("发生错误", err);
      expect(errorSpy).toHaveBeenCalledWith("[ERROR] 发生错误", err);
    });
  });

  describe("prefix 大写", () => {
    it("level 字符串大写", () => {
      logger.debug("x");
      logger.info("x");
      logger.warn("x");
      logger.error("x");
      expect(debugSpy.mock.calls[0][0]).toBe("[DEBUG] x");
      expect(infoSpy.mock.calls[0][0]).toBe("[INFO] x");
      expect(warnSpy.mock.calls[0][0]).toBe("[WARN] x");
      expect(errorSpy.mock.calls[0][0]).toBe("[ERROR] x");
    });
  });

  describe("非 string 首参 / 零 args", () => {
    it("第一参数不是 string：prefix 单独一个 console 参数", () => {
      const obj = { a: 1 };
      logger.info(obj);
      expect(infoSpy).toHaveBeenCalledTimes(1);
      expect(infoSpy).toHaveBeenCalledWith("[INFO]", obj);
    });

    it("第一参数是数字：prefix 单独一个 console 参数", () => {
      logger.warn(42);
      expect(warnSpy).toHaveBeenCalledWith("[WARN]", 42);
    });

    it("零 args：仅 prefix", () => {
      logger.debug();
      expect(debugSpy).toHaveBeenCalledTimes(1);
      expect(debugSpy.mock.calls[0]).toHaveLength(1);
      expect(debugSpy.mock.calls[0][0]).toBe("[DEBUG]");
    });
  });
});
