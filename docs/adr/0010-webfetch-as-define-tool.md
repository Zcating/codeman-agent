# ADR 0010 — Webfetch as defineTool Custom Tool

**Status**: accepted · **Date**: 2026-08-20 · **Scope**: codeman-agent V4 webfetch 工具实现
**Related**: ADR 0001 (V4 总纲 D3), ADR 0003 (drop permission sandbox — webfetch 保留 SSRF)

## Context

V3 自建 `webfetch` 工具（per V3 ADR-0041）：

- 参数：`{ url, format, timeout? }`
- 走 IPC（`webfetch:fetch`））到 Electron Main process
- Main 端实施 SSRF 防护（URL scheme 校验 + DNS 预解析 + IP 黑名单 + 大小限制 + 超时）
- HTML 用 turndown 转 Markdown
- Renderer 端定义：`src/renderer/src/tools/webfetch/`；main 端：`src/main/features/webfetch/`

V4 全面拥抱 pi-coding-agent 内置工具，但 pi-coding-agent **无内置 webfetch**——只有 read/write/edit/bash/grep/find/ls 七个文件工具。

V4 通过 pi 的 `defineTool()` 把 `webfetch` 注册为自定义工具，保留 SSRF 防护。

## Decision

### D1. webfetch 作为 pi defineTool 自定义工具

V4 `webfetch` 工具通过 pi-coding-agent 的 `defineTool()` API 注册进 pi session：

```typescript
// src/main/pi-runtime/tools/webfetch.ts
import { defineTool } from "@earendil-works/pi-coding-agent";
import { fetchWithSSRFGuard } from "./webfetch-ssrf";
import { htmlToMarkdown } from "./webfetch-markdown";

export const webfetchTool = defineTool({
  name: "webfetch",
  description: "Fetch a web page and return its content as Markdown (or raw text). SSRF-protected.",
  parameters: {
    url: { type: "string", description: "HTTP/HTTPS URL to fetch" },
    format: { type: "string", enum: ["markdown", "text"], default: "markdown" },
    timeoutMs: { type: "number", description: "Fetch timeout in ms", default: 30_000 },
  },
  execute: async ({ url, format, timeoutMs }) => {
    const html = await fetchWithSSRFGuard(url, { timeoutMs });
    return format === "markdown" ? htmlToMarkdown(html) : html;
  },
});
```

V4 `PiRuntime` 初始化时注册：

```typescript
const { session } = await createAgentSession({
  sessionManager,
  modelRuntime,
  tools: [
    createReadTool(),
    createWriteTool(),
    createEditTool(),
    createBashTool(),
    createGrepTool(),
    createFindTool(),
    createLsTool(),
    webfetchTool, // ← V4 自定义工具
  ],
});
```

### D2. SSRF 防护保留

V3 main 端 SSRF 防护逻辑（URL scheme 校验 + DNS 预解析 + IP 黑名单 + 大小限制 + 超时）整体保留，迁到 V4 `webfetch-ssrf.ts`：

```typescript
// src/main/pi-runtime/tools/webfetch-ssrf.ts
export async function fetchWithSSRFGuard(url: string, opts: { timeoutMs: number }): Promise<string> {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new WebfetchSSRFViolation({ url, reason: `scheme ${parsed.protocol} not allowed` });
  }

  // DNS 预解析 → IP 黑名单（RFC 1918 / loopback / link-local）
  const ips = await dns.lookup(parsed.hostname, { all: true });
  for (const ip of ips) {
    if (isPrivateIP(ip.address)) {
      throw new WebfetchSSRFViolation({ url, reason: `IP ${ip.address} is private` });
    }
  }

  // fetch with timeout + size limit
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      // disable redirect to prevent DNS rebinding on redirect target
      redirect: "manual",
    });
    if (!res.ok) throw new WebfetchHttpError({ status: res.status });
    return res.text(); // size limit 由外层 validate
  } finally {
    clearTimeout(timeout);
  }
}
```

### D3. 词汇表更新

V3 `CONTEXT.md` 中 `Webfetch` 词条更新：

- 实现机制从"V3 自建 AgentTool + IPC → main SSRF"改为"V4 defineTool 自定义工具 + pi session 内置执行"
- SSRF 防护列表（5 项）保留

## Considered

#### 选 1（已选）：defineTool 自定义工具
通过 pi `defineTool()` 注册 webfetch，保留 SSRF 防护，最深集成 pi 生态。

#### 选 2：让 LLM 用 pi bash 工具调 curl
完全不写 webfetch，让 LLM 用 `bash` 调 `curl`。问题：无 SSRF 防护（bash 裸跑），可访问内网 / 私有 IP；turndown 转 Markdown 也不做。**不选**——SSRF 是关键安全价值。

#### 选 3：保留 V3 IPC 模式 + 在 renderer 包装为 pi tool
V3 webfetch IPC handler 保留，renderer 包装为 pi tool 调用 IPC。问题：增加 IPC 跨进程 round-trip 延迟，且 pi tool 应在 main 内执行。**不选**。

## Consequences

### Positive

- **SSRF 防护保留**：webfetch 仍是安全的产品差异化
- **pi 内置工具 + 自定义工具共存**：webfetch 与 read/write/edit/bash/grep/find/ls 一起注册，LLM 一致体验
- **HTML 转 Markdown 保留**：turndown 集成

### Negative

- **V3 webfetch IPC handler 路径删除**：renderer → main IPC 模式不再需要，webfetch 在 main 内直接执行
- **turndown 依赖保留**：HTML → Markdown 仍需 turndown（V4 继承 V3 依赖）

### Neutral

- **V3 webfetch 测试用例保留**：SSRF 防护测试 fixture 直接迁到 V4

## Cross-file impact

| 路径 | 变化 |
|---|---|
| `src/main/features/webfetch/` | **删除**：V3 IPC handler 目录 |
| `src/renderer/src/tools/webfetch/` | **删除**：V3 renderer 端工具定义 |
| `src/main/pi-runtime/tools/webfetch.ts` | **新建**：pi `defineTool()` 包装 |
| `src/main/pi-runtime/tools/webfetch-ssrf.ts` | **新建**：SSRF 防护（迁自 V3 main handler） |
| `src/main/pi-runtime/tools/webfetch-markdown.ts` | **新建**：HTML → Markdown（迁自 V3） |
| `src/main/pi-runtime/tools/webfetch.test.ts` | **新建**：webfetch + SSRF 测试 fixture |
| `package.json` | 保留 `turndown` 依赖；新增 `@earendil-works/pi-coding-agent` |
| `CONTEXT.md` 词汇表 | 更新 `Webfetch` 词条：实现机制改为 V4 `defineTool` |

## Reversibility

低可逆：

- 恢复 V3 webfetch IPC handler 路径需重写 `src/main/features/webfetch/` + V3 renderer 端工具定义
- SSRF 防护可保留，但需重新组合

预计回滚耗时：3 天。

## References

- pi-coding-agent `defineTool()` API
- V3 ADR-0041（webfetch 工具设计）：保留 SSRF 防护语义，不追溯注册方式
- V3 turndown 集成：保留依赖