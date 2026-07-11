import { describe, it, expect } from "vitest";
import { NotFound, isAppError } from "./errors";
import { decodeAppError } from "./decode-app-error";

describe("decodeAppError — bridge from {kind, _tag} payloads to Schema.TaggedError leaf", () => {
  it("returns Schema.TaggedError instances unchanged (identity fast-path)", () => {
    const e = new NotFound({ message: "x" });
    expect(decodeAppError(e)).toBe(e);
  });

  it("decodes legacy {kind, _tag, message} JSON shape to matching leaf class", () => {
    const decoded = decodeAppError({ _tag: "NotFound", message: "x" });
    expect(isAppError(decoded)).toBe(true);
    if (isAppError(decoded)) expect(decoded._tag).toBe("NotFound");
  });

  it("falls back to Unknown for unrecognised shapes", () => {
    const decoded = decodeAppError({ totally: "bogus" });
    expect(isAppError(decoded)).toBe(true);
    if (isAppError(decoded)) expect(decoded._tag).toBe("Unknown");
  });

  it("returns Unknown for primitives", () => {
    for (const v of [null, undefined, "string", 42, true]) {
      const decoded = decodeAppError(v);
      expect(isAppError(decoded)).toBe(true);
      if (isAppError(decoded)) expect(decoded._tag).toBe("Unknown");
    }
  });

  it("decodes all 8 leaf classes via _tag routing", () => {
    const cases: Array<{ input: { _tag: string; [key: string]: unknown }; expectedTag: string }> = [
      { input: { _tag: "NotFound", message: "a" }, expectedTag: "NotFound" },
      { input: { _tag: "Unauthorized", message: "a" }, expectedTag: "Unauthorized" },
      { input: { _tag: "Network", message: "a", cause: "timeout" }, expectedTag: "Network" },
      { input: { _tag: "InvalidConfig", message: "a", field: "k" }, expectedTag: "InvalidConfig" },
      { input: { _tag: "Database", message: "a", cause: "io" }, expectedTag: "Database" },
      { input: { _tag: "ToolCall", message: "a", toolCallId: "t1" }, expectedTag: "ToolCall" },
      { input: { _tag: "SandboxViolation", message: "a", path: "/x", workspaceLabel: "w" }, expectedTag: "SandboxViolation" },
      { input: { _tag: "Unknown", message: "a" }, expectedTag: "Unknown" },
    ];
    for (const { input, expectedTag } of cases) {
      const decoded = decodeAppError(input);
      expect(isAppError(decoded)).toBe(true);
      if (isAppError(decoded)) expect(decoded._tag).toBe(expectedTag);
    }
  });
});