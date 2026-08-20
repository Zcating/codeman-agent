import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  AppBackendError,
  AppBackendErrorSchema,
  Compaction,
  CredentialStore,
  Database,
  ExtensionLoad,
  InvalidConfig,
  JsonRpcProtocolError,
  JsonRpcTimeoutError,
  ModelAuth,
  ModelContextLength,
  ModelProtocol,
  ModelProvider,
  ModelRateLimit,
  ModelTimeout,
  Network,
  NotFound,
  PiRuntime,
  ResourceLoad,
  SessionFilesystem,
  SessionNotFound,
  SessionPermission,
  ToolArgument,
  ToolCall,
  ToolExecute,
  ToolUnavailable,
  Unauthorized,
  Unknown,
} from "./errors.js";

describe("AppBackendError — _tag 字面量一致性", () => {
  const expectedTags: Array<{ name: string; tag: string }> = [
    { name: "NotFound", tag: "NotFound" },
    { name: "Unauthorized", tag: "Unauthorized" },
    { name: "Network", tag: "Network" },
    { name: "InvalidConfig", tag: "InvalidConfig" },
    { name: "Database", tag: "Database" },
    { name: "ToolCall", tag: "ToolCall" },
    { name: "Unknown", tag: "Unknown" },
    { name: "JsonRpcProtocolError", tag: "JsonRpcProtocolError" },
    { name: "JsonRpcTimeoutError", tag: "JsonRpcTimeoutError" },
    { name: "ModelProvider", tag: "ModelProvider" },
    { name: "ModelAuth", tag: "ModelAuth" },
    { name: "ModelRateLimit", tag: "ModelRateLimit" },
    { name: "ModelContextLength", tag: "ModelContextLength" },
    { name: "ModelTimeout", tag: "ModelTimeout" },
    { name: "ModelProtocol", tag: "ModelProtocol" },
    { name: "SessionNotFound", tag: "SessionNotFound" },
    { name: "SessionPermission", tag: "SessionPermission" },
    { name: "SessionFilesystem", tag: "SessionFilesystem" },
    { name: "ToolExecute", tag: "ToolExecute" },
    { name: "ToolArgument", tag: "ToolArgument" },
    { name: "ToolUnavailable", tag: "ToolUnavailable" },
    { name: "Compaction", tag: "Compaction" },
    { name: "ExtensionLoad", tag: "ExtensionLoad" },
    { name: "CredentialStore", tag: "CredentialStore" },
    { name: "ResourceLoad", tag: "ResourceLoad" },
    { name: "PiRuntime", tag: "PiRuntime" },
  ];

  for (const { name, tag } of expectedTags) {
    it(`${name}._tag === "${tag}"`, () => {
      const ctor = AppBackendError[name as keyof typeof AppBackendError] as unknown as new (
        props: Record<string, unknown>,
      ) => { _tag: string };
      const minimal =
        name === "ToolCall"
          ? { toolCallId: "x", message: "x" }
          : name === "JsonRpcProtocolError"
            ? { message: "x", code: 0 }
            : name === "JsonRpcTimeoutError"
              ? { message: "x", method: "x", timeoutMs: 0 }
              : name === "ModelProvider"
                ? { message: "x" }
                : name === "ModelAuth"
                  ? { message: "x" }
                  : name === "ModelRateLimit"
                    ? { message: "x" }
                    : name === "ModelContextLength"
                      ? { message: "x" }
                      : name === "ModelTimeout"
                        ? { message: "x" }
                        : name === "ModelProtocol"
                          ? { message: "x" }
                          : name === "SessionNotFound"
                            ? { message: "x" }
                            : name === "SessionPermission"
                              ? { message: "x" }
                              : name === "SessionFilesystem"
                                ? { message: "x" }
                                : name === "ToolExecute"
                                  ? { toolName: "x", message: "x" }
                                  : name === "ToolArgument"
                                    ? { toolName: "x", message: "x" }
                                    : name === "ToolUnavailable"
                                      ? { toolName: "x", message: "x" }
                                      : name === "Compaction"
                                        ? { message: "x" }
                                        : name === "ExtensionLoad"
                                          ? { extensionPath: "x", message: "x" }
                                          : name === "CredentialStore"
                                            ? { message: "x" }
                                            : name === "ResourceLoad"
                                              ? { message: "x" }
                                              : name === "PiRuntime"
                                                ? { message: "x" }
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

  it("ModelProvider 实例 round-trip", () => {
    const original = new ModelProvider({ message: "provider failed" });
    const json = JSON.parse(JSON.stringify(original));
    const decoded = Schema.decodeUnknownSync(AppBackendErrorSchema)(json);
    expect(decoded._tag).toBe("ModelProvider");
  });

  it("SessionPermission 实例 round-trip", () => {
    const original = new SessionPermission({ message: "permission denied", path: "/x" });
    const json = JSON.parse(JSON.stringify(original));
    const decoded = Schema.decodeUnknownSync(AppBackendErrorSchema)(json);
    expect(decoded._tag).toBe("SessionPermission");
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
    expect(() => Schema.decodeUnknownSync(AppBackendErrorSchema)({ _tag: "NotFound" })).toThrow();
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
    expect(AppBackendError.Unknown).toBe(Unknown);
    expect(AppBackendError.JsonRpcProtocolError).toBe(JsonRpcProtocolError);
    expect(AppBackendError.JsonRpcTimeoutError).toBe(JsonRpcTimeoutError);
    expect(AppBackendError.ModelProvider).toBe(ModelProvider);
    expect(AppBackendError.ModelAuth).toBe(ModelAuth);
    expect(AppBackendError.ModelRateLimit).toBe(ModelRateLimit);
    expect(AppBackendError.ModelContextLength).toBe(ModelContextLength);
    expect(AppBackendError.ModelTimeout).toBe(ModelTimeout);
    expect(AppBackendError.ModelProtocol).toBe(ModelProtocol);
    expect(AppBackendError.SessionNotFound).toBe(SessionNotFound);
    expect(AppBackendError.SessionPermission).toBe(SessionPermission);
    expect(AppBackendError.SessionFilesystem).toBe(SessionFilesystem);
    expect(AppBackendError.ToolExecute).toBe(ToolExecute);
    expect(AppBackendError.ToolArgument).toBe(ToolArgument);
    expect(AppBackendError.ToolUnavailable).toBe(ToolUnavailable);
    expect(AppBackendError.Compaction).toBe(Compaction);
    expect(AppBackendError.ExtensionLoad).toBe(ExtensionLoad);
    expect(AppBackendError.CredentialStore).toBe(CredentialStore);
    expect(AppBackendError.ResourceLoad).toBe(ResourceLoad);
    expect(AppBackendError.PiRuntime).toBe(PiRuntime);
  });
});
