import { describe, it, expect, vi, beforeEach } from "vitest";
import nock from "nock";

vi.mock("./ssrf.js");

import { fetchSafe } from "./handler.js";
import { assertSafeUrl } from "./ssrf.js";

beforeEach(() => {
  vi.mocked(assertSafeUrl).mockReset();
  vi.mocked(assertSafeUrl).mockResolvedValue(undefined);
  nock.cleanAll();
});

describe("fetchSafe", () => {
  it("returns body for 200 OK", async () => {
    nock("https://example.com").get("/").reply(200, "hello", { "content-type": "text/plain" });
    const result = await fetchSafe("https://example.com");
    expect(result.status).toBe(200);
    expect(result.contentType).toBe("text/plain");
    const text = new TextDecoder().decode(result.body);
    expect(text).toBe("hello");
  });

  it("rejects HTTP 404", async () => {
    nock("https://example.com").get("/missing").reply(404, "Not Found");
    await expect(fetchSafe("https://example.com/missing")).rejects.toThrow(/HTTP 404/);
  });

  it("rejects HTTP 500", async () => {
    nock("https://example.com").get("/").reply(500, "Internal Server Error");
    await expect(fetchSafe("https://example.com/")).rejects.toThrow(/HTTP 500/);
  });

  it("rejects image/png content-type", async () => {
    nock("https://example.com").get("/img.png").reply(200, Buffer.from([0x89, 0x50]), { "content-type": "image/png" });
    await expect(fetchSafe("https://example.com/img.png")).rejects.toThrow(/Unsupported content type/);
  });

  it("allows image/svg+xml", async () => {
    nock("https://example.com").get("/").reply(200, "<svg/>", { "content-type": "image/svg+xml" });
    const result = await fetchSafe("https://example.com/");
    expect(result.contentType).toBe("image/svg+xml");
  });

  it("rejects when content-length > 5MB", async () => {
    nock("https://example.com").get("/big").reply(200, "x", { "content-length": "10000000" });
    await expect(fetchSafe("https://example.com/big")).rejects.toThrow(/too large/);
  });

  it("rejects when actual body > 5MB", async () => {
    const big = Buffer.alloc(6 * 1024 * 1024, "x");
    nock("https://example.com").get("/").reply(200, big);
    await expect(fetchSafe("https://example.com/")).rejects.toThrow(/too large/);
  });

  it("rejects invalid timeoutSeconds (< 5 or > 120)", async () => {
    await expect(fetchSafe("https://x.com", { timeoutSeconds: 0 })).rejects.toThrow(/Timeout/);
    await expect(fetchSafe("https://x.com", { timeoutSeconds: 200 })).rejects.toThrow(/Timeout/);
  });

  it("rejects timeout when server is slow", { timeout: 10000 }, async () => {
    nock("https://slow.example.com").get("/").delay(10000).reply(200, "slow");
    await expect(fetchSafe("https://slow.example.com/", { timeoutSeconds: 5 })).rejects.toThrow(/timed out/i);
  });
});
