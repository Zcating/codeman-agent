import { describe, it, expect, vi, beforeEach } from "vitest";
import { isBlockedIp, assertSafeUrl } from "./ssrf.js";

const mockLookup = vi.hoisted(() => vi.fn());

vi.mock("node:dns/promises", () => ({
  default: { lookup: mockLookup },
  lookup: mockLookup,
}));

describe("isBlockedIp", () => {
  it("blocks 127.0.0.1", () => expect(isBlockedIp("127.0.0.1")).toBe(true));
  it("blocks 10.0.0.5", () => expect(isBlockedIp("10.0.0.5")).toBe(true));
  it("blocks 172.16.0.1", () => expect(isBlockedIp("172.16.0.1")).toBe(true));
  it("blocks 192.168.1.1", () => expect(isBlockedIp("192.168.1.1")).toBe(true));
  it("blocks 169.254.169.254 (AWS IMDS)", () => expect(isBlockedIp("169.254.169.254")).toBe(true));
  it("blocks 0.0.0.0", () => expect(isBlockedIp("0.0.0.0")).toBe(true));
  it("blocks ::1", () => expect(isBlockedIp("::1")).toBe(true));
  it("blocks fc00::1", () => expect(isBlockedIp("fc00::1")).toBe(true));
  it("blocks fe80::1", () => expect(isBlockedIp("fe80::1")).toBe(true));
  it("blocks ::ffff:127.0.0.1 (IPv4-mapped)", () => expect(isBlockedIp("::ffff:127.0.0.1")).toBe(true));
  it("allows 8.8.8.8", () => expect(isBlockedIp("8.8.8.8")).toBe(false));
  it("allows 1.1.1.1", () => expect(isBlockedIp("1.1.1.1")).toBe(false));
  it("allows 2606:4700:4700::1111 (Cloudflare DNS)", () => expect(isBlockedIp("2606:4700:4700::1111")).toBe(false));
  it("rejects garbage (not an IP)", () => expect(isBlockedIp("not-an-ip")).toBe(true));
});

describe("assertSafeUrl", () => {
  beforeEach(() => {
    mockLookup.mockReset();
  });

  it("accepts https://example.com with mocked DNS to public IP", async () => {
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    await expect(assertSafeUrl("https://example.com")).resolves.toBeUndefined();
  });

  it("rejects ftp://example.com (scheme)", async () => {
    await expect(assertSafeUrl("ftp://example.com/file")).rejects.toThrow(/http or https/);
  });

  it("rejects file:///etc/passwd (scheme)", async () => {
    await expect(assertSafeUrl("file:///etc/passwd")).rejects.toThrow(/http or https/);
  });

  it("rejects http://localhost/ (DNS to 127.0.0.1)", async () => {
    mockLookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    await expect(assertSafeUrl("http://localhost")).rejects.toMatchObject({
      kind: "SandboxViolation",
    });
  });

  it("rejects invalid URL syntax", async () => {
    await expect(assertSafeUrl("not a url")).rejects.toThrow(/Invalid URL/);
  });

  it("rejects DNS failure", async () => {
    mockLookup.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(assertSafeUrl("https://nonexistent.example.com")).rejects.toThrow(/DNS lookup failed/);
  });
});
