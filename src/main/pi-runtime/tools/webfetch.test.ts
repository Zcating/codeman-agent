import { describe, it, expect, vi } from "vitest";
import { webfetchTool } from "./webfetch";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";

vi.mock("node:dns/promises");
vi.mock("node:net");

const dns = await import("node:dns/promises");

const mockCtx = {
  sessionId: "test-session",
  ui: { notify: vi.fn(), setWidget: vi.fn() },
} as unknown as import("@earendil-works/pi-coding-agent").ExtensionContext;

type WebfetchDetails = { url: string; contentType: string; format: string; status: number; error?: string };

describe("webfetch", () => {
  describe("SSRF protection", () => {
    it("blocks private IPv4 addresses", async () => {
      dns.lookup = vi.fn().mockResolvedValue([{ address: "10.0.0.1" }]);

      const result = await webfetchTool.execute("1", { url: "http://example.com/test" }, undefined, undefined, mockCtx) as AgentToolResult<WebfetchDetails>;
      expect(result.details.error).toContain("SSRF guard");
    });

    it("blocks loopback addresses", async () => {
      dns.lookup = vi.fn().mockResolvedValue([{ address: "127.0.0.1" }]);

      const result = await webfetchTool.execute("2", { url: "http://example.com/test" }, undefined, undefined, mockCtx) as AgentToolResult<WebfetchDetails>;
      expect(result.details.error).toContain("SSRF guard");
    });

    it("blocks 192.168.x.x addresses", async () => {
      dns.lookup = vi.fn().mockResolvedValue([{ address: "192.168.1.100" }]);

      const result = await webfetchTool.execute("3", { url: "http://example.com/test" }, undefined, undefined, mockCtx) as AgentToolResult<WebfetchDetails>;
      expect(result.details.error).toContain("SSRF guard");
    });

    it("blocks 172.16.x.x addresses", async () => {
      dns.lookup = vi.fn().mockResolvedValue([{ address: "172.16.0.1" }]);

      const result = await webfetchTool.execute("4", { url: "http://example.com/test" }, undefined, undefined, mockCtx) as AgentToolResult<WebfetchDetails>;
      expect(result.details.error).toContain("SSRF guard");
    });

    it("allows public IP addresses", async () => {
      dns.lookup = vi.fn().mockResolvedValue([{ address: "93.184.216.34" }]);
      global.fetch = vi.fn().mockResolvedValue({
        status: 200,
        headers: new Headers({ "content-type": "text/plain" }),
        arrayBuffer: async () => new ArrayBuffer(10),
      } as unknown as Response);

      const result = await webfetchTool.execute("5", { url: "http://example.com/test", timeout: 30 }, undefined, undefined, mockCtx) as AgentToolResult<WebfetchDetails>;
      expect(result.details.error).toBeUndefined();
    });
  });

  describe("URL validation", () => {
    it("rejects non-http/https URLs", async () => {
      const result = await webfetchTool.execute("6", { url: "ftp://example.com/test" }, undefined, undefined, mockCtx) as AgentToolResult<WebfetchDetails>;
      expect(result.details.error).toContain("http");
    });
  });

  describe("format parameter", () => {
    it("returns markdown by default", async () => {
      dns.lookup = vi.fn().mockResolvedValue([{ address: "93.184.216.34" }]);
      global.fetch = vi.fn().mockResolvedValue({
        status: 200,
        headers: new Headers({ "content-type": "text/html" }),
        arrayBuffer: async () => new TextEncoder().encode("<h1>Hello</h1>"),
      } as unknown as Response);

      const result = await webfetchTool.execute("7", { url: "http://example.com/test" }, undefined, undefined, mockCtx) as AgentToolResult<WebfetchDetails>;
      expect(result.details.format).toBe("markdown");
    });
  });
});
