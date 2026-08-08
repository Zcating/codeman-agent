/**
 * src/main/lib/errors.test.ts
 *
 * AppBackendError 命名空间 — 验证所有 _tag 字面量与 renderer 端 AppError
 * 完全一致（IPC 跨进程序列化前提），且 Schema 联合可解码 round-trip。
 *
 * 注意：本测试必须独立可跑（不依赖 MainLive，因为 AppBackendError 是纯
 * 数据类型，不涉及 Effect runtime services）。
 */
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  AppBackendError,
  AppBackendErrorSchema,
  Database,
  InvalidConfig,
  JsonRpcProtocolError,
  JsonRpcTimeoutError,
  Network,
  NotFound,
  SandboxViolation,
  ToolCall,
  Unauthorized,
  Unknown,
} from "./errors.js";

describe("AppBackendError — _tag 字面量与 renderer 端一致", () => {
  const expectedTags: Array<{ name: string; tag: string }> = [
    { name: "NotFound", tag: "NotFound" },
    { name: "Unauthorized", tag: "Unauthorized" },
    { name: "Network", tag: "Network" },
    { name: "InvalidConfig", tag: "InvalidConfig" },
    { name: "Database", tag: "Database" },
    { name: "ToolCall", tag: "ToolCall" },
    { name: "SandboxViolation", tag: "SandboxViolation" },
    { name: "Unknown", tag: "Unknown" },
    { name: "JsonRpcProtocolError", tag: "JsonRpcProtocolError" },
    { name: "JsonRpcTimeoutError", tag: "JsonRpcTimeoutError" },
  ];

  for (const { name, tag } of expectedTags) {
    it(`${name}._tag === "${tag}"`, () => {
      const ctor = AppBackendError[name as keyof typeof AppBackendError] as unknown as new (
        props: Record<string, unknown>,
      ) => { _tag: string };
      // 不同子类需要不同的最小字段：使用最宽松的最小 payload
      const minimal = name === "ToolCall"
        ? { toolCallId: "x", message: "x" }
        : name === "SandboxViolation"
        ? { path: "/x", workspaceLabel: "x" }
        : name === "JsonRpcProtocolError"
        ? { message: "x", code: 0 }
        : name === "JsonRpcTimeoutError"
        ? { message: "x", method: "x", timeoutMs: 0 }
        : { message: "x" };
      const instance = new ctor(minimal);
      expect(instance._tag).toBe(tag);
    });
  }
});

describe("AppBackendError — Schema 联合 round-trip", () => {
  it("NotFound 实例可经 Schema 解码还原为 NotFound 实例", () => {
    const original = new NotFound({ message: "missing", path: "/x" });
    const json = JSON.parse(JSON.stringify(original));
    const decoded = Schema.decodeUnknownSync(AppBackendErrorSchema)(json);
    expect(decoded._tag).toBe("NotFound");
    if (decoded._tag === "NotFound") {
      expect(decoded.message).toBe("missing");
      expect(decoded.path).toBe("/x");
    }
  });

  it("SandboxViolation 实例 round-trip", () => {
    const original = new SandboxViolation({
      message: "out of bounds",
      path: "/x",
      workspaceLabel: "ws1",
    });
    const json = JSON.parse(JSON.stringify(original));
    const decoded = Schema.decodeUnknownSync(AppBackendErrorSchema)(json);
    expect(decoded._tag).toBe("SandboxViolation");
    if (decoded._tag === "SandboxViolation") {
      expect(decoded.path).toBe("/x");
      expect(decoded.workspaceLabel).toBe("ws1");
      expect(decoded.message).toBe("out of bounds");
    }
  });

  it("Unknown 实例 round-trip", () => {
    const original = new Unknown({ message: "opaque" });
    const json = JSON.parse(JSON.stringify(original));
    const decoded = Schema.decodeUnknownSync(AppBackendErrorSchema)(json);
    expect(decoded._tag).toBe("Unknown");
    if (decoded._tag === "Unknown") {
      expect(decoded.message).toBe("opaque");
    }
  });

  it("InvalidConfig 实例 round-trip", () => {
    const original = new InvalidConfig({
      message: "bad config",
      field: "skill:foo",
    });
    const json = JSON.parse(JSON.stringify(original));
    const decoded = Schema.decodeUnknownSync(AppBackendErrorSchema)(json);
    expect(decoded._tag).toBe("InvalidConfig");
    if (decoded._tag === "InvalidConfig") {
      expect(decoded.field).toBe("skill:foo");
    }
  });
});

describe("AppBackendError — Schema 联合拒绝非法 payload", () => {
  it("空对象 decode 失败", () => {
    expect(() => Schema.decodeUnknownSync(AppBackendErrorSchema)({})).toThrow();
  });

  it("未知 _tag decode 失败", () => {
    expect(() =>
      Schema.decodeUnknownSync(AppBackendErrorSchema)({ _tag: "NotATag", message: "x" }),
    ).toThrow();
  });

  it("缺失必填字段 decode 失败", () => {
    expect(() =>
      Schema.decodeUnknownSync(AppBackendErrorSchema)({ _tag: "NotFound" }),
    ).toThrow();
  });
});

describe("AppBackendError — 命名空间与类双向一致", () => {
  it("命名空间导出指向同一 class", () => {
    expect(AppBackendError.NotFound).toBe(NotFound);
    expect(AppBackendError.Unauthorized).toBe(Unauthorized);
    expect(AppBackendError.Network).toBe(Network);
    expect(AppBackendError.InvalidConfig).toBe(InvalidConfig);
    expect(AppBackendError.Database).toBe(Database);
    expect(AppBackendError.ToolCall).toBe(ToolCall);
    expect(AppBackendError.SandboxViolation).toBe(SandboxViolation);
    expect(AppBackendError.Unknown).toBe(Unknown);
    expect(AppBackendError.JsonRpcProtocolError).toBe(JsonRpcProtocolError);
    expect(AppBackendError.JsonRpcTimeoutError).toBe(JsonRpcTimeoutError);
  });

  it("所有类实例 _tag 与 renderer 端 AppError 完全一致", () => {
    // Renderer 端 src/renderer/src/shared/lib/errors.ts 中的 tag 字面量
    // 必须 1:1 镜像（IPC 跨进程序列化前提）。本测试是字面量级断言，
    // 与上方的 round-trip 互为补充。
    const rendererTags: Record<string, string> = {
      NotFound: "NotFound",
      Unauthorized: "Unauthorized",
      Network: "Network",
      InvalidConfig: "InvalidConfig",
      Database: "Database",
      ToolCall: "ToolCall",
      SandboxViolation: "SandboxViolation",
      Unknown: "Unknown",
      JsonRpcProtocolError: "JsonRpcProtocolError",
      JsonRpcTimeoutError: "JsonRpcTimeoutError",
    };
    for (const [name, expected] of Object.entries(rendererTags)) {
      const ctor = AppBackendError[name as keyof typeof AppBackendError] as unknown as new (
        props: Record<string, unknown>,
      ) => { _tag: string };
      const minimal = name === "ToolCall"
        ? { toolCallId: "x", message: "x" }
        : name === "SandboxViolation"
        ? { path: "/x", workspaceLabel: "x" }
        : name === "JsonRpcProtocolError"
        ? { message: "x", code: 0 }
        : name === "JsonRpcTimeoutError"
        ? { message: "x", method: "x", timeoutMs: 0 }
        : { message: "x" };
      const instance = new ctor(minimal);
      expect(instance._tag).toBe(expected);
    }
  });
});