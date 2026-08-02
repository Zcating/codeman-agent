import { describe, it, expect, vi } from "vitest";
import { JsonRpcProtocolError } from "../../../renderer/src/shared/lib/errors";
import { performHandshake, HandshakeError } from "./mcp-handshake";


function fakeConnection(handlers: {
  request: (method: string, params?: unknown) => Promise<unknown>;
  notify?: (method: string, params?: unknown) => void;
}): unknown {
  return {
    request: vi.fn(handlers.request),
    notify: vi.fn(handlers.notify ?? (() => {})),
  };
}

describe("performHandshake", () => {
  it("calls initialize â†?notifications/initialized â†?tools/list in order", async () => {
    const order: string[] = [];
    const fake = fakeConnection({
      request: async (method) => {
        order.push(method);
        if (method === "initialize") {
          return {
            protocolVersion: "2024-11-05",
            capabilities: {},
            serverInfo: { name: "test-server", version: "1.0" },
          };
        }
        if (method === "tools/list") {
          return { tools: [{ name: "echo" }] };
        }
        return {};
      },
      notify: (method) => { order.push(method); },
    });

    const tools = await performHandshake(fake as never, "test-server");

    expect(order).toEqual(["initialize", "notifications/initialized", "tools/list"]);
    expect(tools).toEqual([{ name: "echo", description: "", inputSchema: {} }]);
  });

  it("sends protocolVersion + clientInfo on initialize", async () => {
    let initParams: unknown;
    const fake = fakeConnection({
      request: async (method, params) => {
        if (method === "initialize") {
          initParams = params;
          return {
            protocolVersion: "2024-11-05",
            capabilities: {},
            serverInfo: { name: "x", version: "0" },
          };
        }
        if (method === "tools/list") {
          return { tools: [] };
        }
        return {};
      },
    });

    await performHandshake(fake as never, "x");

    expect(initParams).toEqual({
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "codeman-agent", version: "0.3.0" },
    });
  });

  it("returns mapped tools with description/inputSchema defaults", async () => {
    const fake = fakeConnection({
      request: async (method) => {
        if (method === "initialize") {
          return { protocolVersion: "x", capabilities: {}, serverInfo: { name: "x", version: "0" } };
        }
        if (method === "tools/list") {
          return {
            tools: [
              { name: "no-desc" },
              { name: "with-desc", description: "d", inputSchema: { type: "object" } },
            ],
          };
        }
        return {};
      },
    });

    const tools = await performHandshake(fake as never, "x");
    expect(tools).toEqual([
      { name: "no-desc", description: "", inputSchema: {} },
      { name: "with-desc", description: "d", inputSchema: { type: "object" } },
    ]);
  });

  it("propagates initialize errors as HandshakeError('initialize') and skips notifications/initialized", async () => {
    const fake = fakeConnection({
      request: async () => {
        throw new JsonRpcProtocolError({ message: "initialize blew up", code: -32603 });
      },
    });

    await expect(performHandshake(fake as never, "x")).rejects.toThrow(/initialize blew up/);
    try {
      await performHandshake(fake as never, "x");
    } catch (e) {
      expect(e).toBeInstanceOf(HandshakeError);
      expect((e as HandshakeError).phase).toBe("initialize");
    }
    expect((fake as { notify: ReturnType<typeof vi.fn> }).notify).not.toHaveBeenCalled();
  });

  it("propagates tools/list errors as HandshakeError('tools_list') after sending notifications/initialized", async () => {
    const fake = fakeConnection({
      request: async (method) => {
        if (method === "initialize") {
          return { protocolVersion: "x", capabilities: {}, serverInfo: { name: "x", version: "0" } };
        }
        throw new JsonRpcProtocolError({ message: "tools/list blew up", code: -32603 });
      },
    });

    await expect(performHandshake(fake as never, "x")).rejects.toThrow(/tools\/list blew up/);
    try {
      await performHandshake(fake as never, "x");
    } catch (e) {
      expect(e).toBeInstanceOf(HandshakeError);
      expect((e as HandshakeError).phase).toBe("tools_list");
    }
  });
});