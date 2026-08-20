import { Type } from "@earendil-works/pi-ai";
import { defineTool } from "@earendil-works/pi-coding-agent";
import TurndownService from "turndown";
import dns from "node:dns/promises";
import net from "node:net";

const TIMEOUT_CONFIG = { min: 5, max: 120, default: 30 } as const;
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

const NON_TEXT_TYPES = /^(image\/(?!svg\+xml)|audio\/|video\/|application\/(octet-stream|pdf|zip|x-(gzip|bzip2|7z-compressed|tar|rar)))/i;

const BLOCKED_V4: Array<[bigint, number]> = [
  [0x00000000n, 8],
  [0x0a000000n, 8],
  [0x7f000000n, 8],
  [0xa9fe0000n, 16],
  [0xac100000n, 12],
  [0xc0a80000n, 16],
];

const BLOCKED_V6: Array<[bigint, number]> = [
  [1n, 128],
  [0xfc000000000000000000000000000000n, 7],
  [0xfe800000000000000000000000000000n, 10],
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

function isBlockedIp(ip: string): boolean {
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

  return false;
}

async function assertSafeUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    throw new Error(`URL scheme must be http or https, got ${parsed.protocol}`);
  }

  const hostname = parsed.hostname;
  let addresses: Array<{ address: string }>;
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch (e) {
    throw new Error(`DNS lookup failed: ${(e as Error).message}`);
  }

  for (const { address } of addresses) {
    if (isBlockedIp(address)) {
      throw new Error(`IP ${address} is blocked (SSRF guard)`);
    }
  }
}

async function fetchSafe(
  url: string,
  opts: { timeoutSeconds?: number } = {},
): Promise<{ status: number; contentType: string; body: ArrayBuffer }> {
  const timeoutSeconds = opts.timeoutSeconds ?? TIMEOUT_CONFIG.default;
  if (timeoutSeconds < TIMEOUT_CONFIG.min || timeoutSeconds > TIMEOUT_CONFIG.max) {
    throw new Error(`Timeout must be between ${TIMEOUT_CONFIG.min} and ${TIMEOUT_CONFIG.max} seconds`);
  }

  await assertSafeUrl(url);

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutSeconds * 1000),
      redirect: "error",
    });
  } catch (e) {
    if ((e as Error).name === "TimeoutError" || (e as Error).name === "AbortError") {
      throw new Error("Request timed out");
    }
    if ((e as Error).message?.toLowerCase().includes("redirect")) {
      throw new Error(`HTTP redirect blocked (SSRF guard): ${(e as Error).message}`);
    }
    throw new Error((e as Error).message);
  }

  if (response.status >= 400) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  if (NON_TEXT_TYPES.test(contentType)) {
    throw new Error(`Unsupported content type: ${contentType}`);
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BYTES) {
    throw new Error(`Response too large (${contentLength} bytes > ${MAX_BYTES} bytes)`);
  }

  const body = await response.arrayBuffer();
  if (body.byteLength > MAX_BYTES) {
    throw new Error(`Response too large (${body.byteLength} bytes > ${MAX_BYTES} bytes)`);
  }

  return { status: response.status, contentType, body };
}

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "*",
});

export const webfetchTool = defineTool({
  name: "webfetch",
  label: "WebFetch",
  description:
    "Fetch the content of a public HTTP/HTTPS URL and return it as text, markdown, or HTML. " +
    "Markdown is the default. Use this to look up documentation, read changelogs, or fetch error " +
    "messages from public sources. Private/loopback IPs are blocked. Max response: 5MB; default timeout: 30s.",
  parameters: Type.Object({
    url: Type.String({ description: "URL to fetch (http or https)" }),
    format: Type.Optional(Type.Union([
      Type.Literal("text"),
      Type.Literal("markdown"),
      Type.Literal("html"),
    ], { description: "Output format (default: markdown)" })),
    timeout: Type.Optional(Type.Number({ description: `Timeout in seconds (${TIMEOUT_CONFIG.min}-${TIMEOUT_CONFIG.max}, default: ${TIMEOUT_CONFIG.default})` })),
  }),
  async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
    const timeoutSeconds = params.timeout ?? TIMEOUT_CONFIG.default;

    let result: { status: number; contentType: string; body: ArrayBuffer };
    try {
      result = await fetchSafe(params.url, { timeoutSeconds });
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        details: { url: params.url, contentType: "", format: "", status: 0, error: (e as Error).message },
      };
    }

    const bodyStr = new TextDecoder().decode(result.body);
    let output: string;
    let outputFormat: string;

    const fmt = params.format ?? "markdown";
    if (fmt === "html") {
      output = bodyStr;
      outputFormat = "html";
    } else if (fmt === "text") {
      const TAG_RE = /<\/?(script|style|noscript|iframe|object|embed|svg|math|audio|video|picture|form|button)\b[^>]*>[\s\S]*?(?:<\/\1>|(?=<[a-z/])|$)/gi;
      const TAG_STRIP_RE = /<[^>]*>/g;
      const ENTITY_MAP: Record<string, string> = {
        "&amp;": "&", "&lt;": "<", "&gt;": ">",
        "&quot;": '"', "&#39;": "'", "&nbsp;": " ",
      };
      const noScripts = bodyStr.replace(TAG_RE, "");
      const noTags = noScripts.replace(TAG_STRIP_RE, "");
      output = noTags.replace(/&(?:#x?[0-9a-f]+|[a-z]+);/gi, (m) => ENTITY_MAP[m] ?? m);
      outputFormat = "text";
    } else {
      output = turndown.turndown(bodyStr);
      outputFormat = "markdown";
    }

    return {
      content: [
        {
          type: "text",
          text: `URL: ${params.url}\nContent-Type: ${result.contentType}\nFormat: ${outputFormat}\n\n${output}`,
        },
      ],
      details: { url: params.url, contentType: result.contentType, format: outputFormat, status: result.status },
    };
  },
});
