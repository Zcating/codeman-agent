import { describe, it, expect } from "vitest";
import { sandboxHandler } from "./sandbox-handler";

describe("src/main/lib/sandbox-handler.ts", () => {
  it("passes through the wrapped function's return value", async () => {
    const handler = sandboxHandler(async () => "ok");
    await expect(handler(null)).resolves.toBe("ok");
  });

  it("serializes object errors with a kind field to { kind, message }", async () => {
    const handler = sandboxHandler(async () => {
      throw { kind: "NotFound", path: "/x" };
    });
    const err = await handler(null).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("NotFound");
    expect(JSON.parse(err.message).kind).toBe("NotFound");
  });

  it("serializes Effect TaggedError objects (_tag) to { kind, message }", async () => {
    const handler = sandboxHandler(async () => {
      throw { _tag: "Network", message: "net err" };
    });
    const err = await handler(null).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("Network");
    expect(err.message).toContain("net err");
  });

  it("rethrows plain Error instances unchanged", async () => {
    const original = new Error("plain");
    const handler = sandboxHandler(async () => {
      throw original;
    });
    const err = await handler(null).catch((e) => e);
    expect(err).toBe(original);
    expect(err.message).toBe("plain");
  });

  it("rethrows string throws unchanged", async () => {
    const handler = sandboxHandler(async () => {
      throw "string error";
    });
    const err = await handler(null).catch((e) => e);
    expect(err).toBe("string error");
  });
});
