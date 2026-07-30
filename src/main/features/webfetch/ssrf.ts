// DNS rebinding 限制 (V1):
// - 从 dns.lookup 到 fetch 完成连接存在 5-10ms 窗口,攻击者可利用 DNS
//   重绑定使第一次解析返回公网 IP 通过检查,第二次连接时指向内网 IP。
// - 真实攻击需要攻击者同时控制 DNS server 与 timing,实际利用难度高。
// - V2 评估方向: dns.lookup + 立即 fetch in same tick,或 socket-level 拦截。

import dns from "node:dns/promises";
import net from "node:net";
import { InvalidConfig, Network, SandboxViolation } from "../../../renderer/src/shared/lib/errors";

const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

function parseCidr4(cidr: string): [bigint, number] {
  const [ip, bits] = cidr.split("/");
  const num = BigInt(
    "0x" +
      ip.split(".").map((oct) => Number(oct).toString(16).padStart(2, "0")).join(""),
  );
  return [num, Number(bits)];
}

const BLOCKED_V4: Array<[bigint, number]> = [
  parseCidr4("0.0.0.0/8"),
  parseCidr4("10.0.0.0/8"),
  parseCidr4("127.0.0.0/8"),
  parseCidr4("169.254.0.0/16"),
  parseCidr4("172.16.0.0/12"),
  parseCidr4("192.168.0.0/16"),
];

const BLOCKED_V6: Array<[bigint, number]> = [
  [BigInt("0x" + "0".repeat(15) + "1"), 128],
  [BigInt("0xfc000000000000000000000000000000"), 7],
  [BigInt("0xfe800000000000000000000000000000"), 10],
];

function ipv4ToBigint(ip: string): bigint {
  return BigInt(
    "0x" +
      ip.split(".").map((oct) => Number(oct).toString(16).padStart(2, "0")).join(""),
  );
}

function expandV6(ip: string): string[] {
  if (ip.indexOf("::") === -1) {
    return ip.split(":").map((p) => p.padStart(4, "0"));
  }
  const parts = ip.split(":");
  const emptyIndex = parts.indexOf("");
  const leading = parts.slice(0, emptyIndex).filter(Boolean);
  const trailing = parts.slice(emptyIndex + 1).filter(Boolean);
  const missing = 8 - leading.length - trailing.length;
  const expanded: string[] = [];
  for (const p of leading) { expanded.push(p.padStart(4, "0")); }
  for (let i = 0; i < missing; i++) { expanded.push("0000"); }
  for (const p of trailing) { expanded.push(p.padStart(4, "0")); }
  return expanded;
}

export function isBlockedIp(ip: string): boolean {
  const stripped = ip.startsWith("::ffff:") ? ip.slice(7) : ip;

  if (net.isIP(stripped) === 4) {
    const num = ipv4ToBigint(stripped);
    return BLOCKED_V4.some(([base, bits]) => {
      const mask = bits === 0 ? 0n : (~0n << BigInt(32 - bits)) & 0xffffffffn;
      return (num & mask) === (base & mask);
    });
  }

  if (net.isIP(stripped) === 6) {
    const expanded = expandV6(stripped);
    const num = BigInt("0x" + expanded.join(""));
    return BLOCKED_V6.some(([base, bits]) => {
      const mask = bits === 0 ? 0n : (~0n << BigInt(128 - bits)) & ((1n << 128n) - 1n);
      return (num & mask) === (base & mask);
    });
  }

  throw new InvalidConfig({ field: "ip", message: `Invalid IP from dns.lookup: ${ip}` });
}

export async function assertSafeUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new InvalidConfig({field: "url", message: "Invalid URL"});
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    throw new InvalidConfig({field: "url", message: `URL scheme must be http or https, got ${parsed.protocol}`});
  }

  const hostname = parsed.hostname;
  let addresses: Array<{ address: string }>;
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch (e) {
    throw new Network({message: `DNS lookup failed: ${(e as Error).message}`});
  }

  for (const { address } of addresses) {
    if (isBlockedIp(address)) {
      throw new SandboxViolation({
        path: url,
        workspaceLabel: "webfetch",
        message: `IP ${address} is blocked (SSRF guard)`,
      });
    }
  }
}
