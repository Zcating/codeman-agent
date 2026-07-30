# 0038 — Webfetch agent-tool + 5+1 → 6+1 文件夹白名单

**Status**: accepted · **Date**: 2026-07-30
**Scope**:
- 新增: `src/renderer/src/tools/webfetch/*` (renderer tool)
- 新增: `src/main/features/webfetch/*` (main SSRF + handler)
- 迁移: `src/renderer/src/features/file-tools/*` → `src/renderer/src/tools/file-ops/*` (rename + 扁平化 + barrel)
- 改: `src/renderer/src/features/chat/lib/runtime.ts` (import path + 注入 webfetchTool)
- 改: `src/main/ipc.ts` + `src/preload/index.ts` + `src/renderer/src/__mocks__/ipc-mock.ts` (webfetch IPC)
- 改: `src/renderer/src/shared/apis/webfetch.api.ts` (新增 Service)
- 改: `src/renderer/src/shared/apis/invoke.api.ts` + `src/renderer/src/shared/lib/tool-schema.ts` (CodemanApi + AST walker 扩展)
- 改: ADR-0010 (5+1 → 6+1 白名单)
- 改: CONTEXT.md (新增 `tools/` + `Webfetch` 词条)
- 改: AGENTS.md (6+1 表格)
- package.json: `+ "turndown": "^7.2.0"`, `+ "@types/turndown": "^5.0.5"`

**Related**:
- ADR-0013 (file-tools design reference)
- ADR-0013.1 (schema field camelCase)
- ADR-0025 (Effect Schema full-stack)
- ADR-0026 (IPC channel camelCase)
- ADR-0032 (MCP capability extension reference)
- ADR-0010 (5+1 whitelist, amended by this ADR)

## Context

### Webfetch 需求触发

opencode 提供内置 `webfetch` 工具——让 LLM 直接抓取网页 HTML 并转为 markdown 阅读。codeman-agent 缺少此能力，用户在 2026-07 明确要求添加等价功能。

核心需求:
1. LLM 可调用 `webfetch(url, format?, timeout?)` 获取网页内容
2. SSRF 防护——不暴露内部网络
3. HTML → Markdown 转换（turndown）
4. 限制: 5MB 响应上限、120s 超时、仅 http/https 协议

### file-tools 目录迁移理由

`src/renderer/src/features/file-tools/` 自 ADR-0013 起放在 `features/` 下，但 file-tools 是 LLM-facing AgentTool 定义——不承载 UI、不涉及业务域、不与 chat/settings/billing 共享 feature 模式。将其迁至 `tools/file-ops/` 并扁平化（删除 `lib/` 嵌套）与 webfetch 工具同目录平级，形成 `tools/<name>/` 一致布局。同时清理 `features/` 下非 feature 语义的遗留代码。

### 6+1 白名单触发

ADR-0010 原白名单限制 `features/<feature>/` 的 5 个子目录。`tools/` 作为 `src/renderer/src/tools/` 顶层目录（与 `features/` 同级）是新增位置，需要扩展白名单定义。

## Decision

### D1 — 网络栈: IPC 走 main 进程 + SSRF 防护

与 file-tools 同构: renderer 端 AgentTool → renderer Service (webfetch.api.ts) → IPC (webfetch:fetch) → Electron main handler (handler.ts) → 真实 HTTP fetch。

SSRF 防护在 main 端 `ssrf.ts` 实施:
- URL scheme 校验: 仅允许 `http:` / `https:`
- DNS 预解析: `node:dns/promises` 预解析域名
- IP 黑名单: 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, 0.0.0.0/8, ::1, fc00::/7, fe80::/10
  - 响应限: 5MB (`MAX_BYTES = 5 * 1024 * 1024`)
- 超时: 默认 30s, 可配 5–120s

**响应内容类型限制:** main 端 `handler.ts` 拒绝非文本响应:
- `NON_TEXT_TYPES = /^image\/(?!svg\+xml)/` 拒绝 `image/png`, `image/jpeg` 等
- 例外: `image/svg+xml` 允许(纯 XML,可走 markdown 转换)
- 视频 / 音频 / 二进制全部拒绝,避免 LLM context 被 base64 撑爆
- HTTP 4xx/5xx 抛 `Network` AppError
- 响应体超 5MB 抛 `Network` AppError (含 content-length 头预检 + arrayBuffer 后双重 check)

**重定向拦截 (SSRF 防护):** main 端 fetch 配置 `redirect: "error"`,**拒绝所有 3xx 重定向**。
- 理由: 攻击者可构造 302 → `http://192.168.1.1/admin` 绕过 SSRF 防护(初始 URL 合法,跳转到内网)
- 代价: 合法 HTTP→HTTPS 重定向也被拒绝,LLM 需手动复制最终 URL 重试
- V2 评估: `redirect: "manual"` + 跳转头 SSRF 重校验(更复杂但 UX 更友好)

### D2 — HTML 处理: turndown

使用 `turndown` 库将 HTML 转为 Markdown。配置:
- headingStyle: "atx" (`##`)
- codeBlockStyle: "fenced" (```)
- bulletListMarker: "-"
- emDelimiter: "*"
- 移除标签 (turndown config + htmlToText regex 双层防护):
  - `script`, `style`, `noscript`, `iframe`, `object`, `embed`, `svg`, `math`, `audio`, `video`, `picture`, `form`, `button`(共 13 种,含 XSS 攻击向量)
  - turndown config 移除 9 种: `script, style, meta, link, noscript, iframe, object, embed, svg`
  - htmlToText regex 移除 13 种: 上述 + `math, audio, video, picture, form, button`
  - turndown 不支持数学标签(`<math>`, `<mi>` 等),原样通过 — 已知 turndown 限制

同时提供 `htmlToText()` 纯文本提取（regex 剥离标签 + HTML entity 解码）用于 `format: "text"` 模式。

### D3 — 落位: `tools/` 扁平 + `main/features/` 镜像

renderer 端:

```
src/renderer/src/tools/
├── file-ops/
│   ├── file-ops.ts           # AgentTool 定义 (5 个文件工具)
│   ├── file-ops.test.ts
│   ├── schemas.ts             # FilePathSchema + brand
│   ├── schemas.test.ts
│   ├── index.ts               # barrel 导出
│   └── AGENTS.md
└── webfetch/
    ├── webfetch.ts             # webfetchTool AgentTool 定义
    ├── webfetch.test.ts
    ├── schemas.ts              # WebfetchParamsSchema
    ├── schemas.test.ts
    ├── html-to-markdown.ts     # Turndown 转换
    ├── html-to-markdown.test.ts
    ├── index.ts                # barrel 导出
    └── AGENTS.md
```

main 端镜像 (feature 风格, 无 tools 概念):

```
src/main/features/webfetch/
├── handler.ts                  # IPC handler (fetchSafe)
├── handler.test.ts
├── ssrf.ts                     # SSRF 防护
├── ssrf.test.ts
└── index.ts
```

每个 `tools/<name>/` 根级仅允许 `index.ts` (barrel) + `AGENTS.md`, 代码文件扁平（无嵌套子目录）。file-ops 从旧 `features/file-tools/lib/` 迁入时做了扁平化: `file-tools.ts` → `file-ops.ts`, `schemas.ts` 保留同级。

### D4 — Schema: 全量 opencode 兼容

```typescript
Schema.Struct({
  url: Schema.String.pipe(Schema.pattern(/^https?:\/\//i)),
  format: Schema.optional(Schema.Literal("text", "markdown", "html")),
  timeout: Schema.optional(Schema.Number.pipe(Schema.int(), Schema.between(5, 120))),
})
```

- `url`: 必须以 `http://` 或 `https://` 开头（Effect Schema pattern 校验）
- `format`: 可选，`"markdown"` (默认) / `"text"` / `"html"`
- `timeout`: 可选，5–120s 整数

全量对齐 opencode 的 webfetch 参数形状，降低 LLM 跨 agent 迁移成本。

### D5 — SSRF 黑名单 (全量)

```typescript
const BLOCKED_V4 = [
  "0.0.0.0/8",     // Current network
  "10.0.0.0/8",    // Private
  "127.0.0.0/8",   // Loopback
  "169.254.0.0/16",// Link-local
  "172.16.0.0/12", // Private
  "192.168.0.0/16",// Private
];

const BLOCKED_V6 = [
  "::1/128",         // Loopback
  "fc00::/7",        // Unique-local
  "fe80::/10",       // Link-local
];
```

DNS 预解析: `dns.lookup(url.hostname)` 获取 IP 后逐 CIDR 比对。解析失败或匹配黑名单均拒绝请求。

**已知限制 — DNS rebinding 窗口 (V1):** `dns.lookup` 执行 DNS 查询,而 `fetch`
在 V1 实现中是异步连接——之间存在 5-10ms 窗口。理论上攻击者可利用 DNS rebinding
使首次解析返回公网 IP (通过检查),重绑定后第二次连接指向私有 IP。真实攻击要求
攻击者同时控制 DNS server 与 timing,利用难度极高。V2 评估方向: `dns.lookup` +
同 tick 内 `fetch`,或 socket-level IP 绑定拦截。

### D6 — LLM-facing name: `webfetch`

单字 `webfetch`（非 `webfetch_url` 或 `web_fetch`）。

讨论: opencode 用 `webfetch` 是单字驼峰，LLM 已熟悉此名。file-tools 族用 snake_case（`read_file` / `write_file`）是历史遗留（V1 Tauri command IPC 约定），新工具不再延续。单字名减少 token 消耗 + LLM 少记一个分隔符。

### D7 — 无 permission / 无 rate limit

与 ADR-0032 D6 一致: LLM 不会 abuse 自己，permission 弹窗无意义。无频率限制、无用户确认。SSRF 是唯一安全边界。

## Known Limitations (V1)

以下限制 V1 接受,留作 V2 评估:

1. **IPC 错误类型区分在真实路径中丢失 (pre-existing)**
   - main 端 `sandboxHandler` (`src/main/ipc.ts:437`) 将 `{_tag, message, ...}` 转换为 `{kind, message, ...}` 跨 IPC 序列化
   - renderer 端 `decodeAppError` (`src/renderer/src/shared/lib/decode-app-error.ts:48`) 用 `Schema.Union` of `TaggedError`,每个 TaggedError schema 期望 `_tag` 字段
   - 实际路径: `_tag` → `kind` 转换后,renderer 解码失败,降级为 `new Unknown({message: "..."})`
   - 影响: LLM 看到的错误信息丢失类型细分(Network / InvalidConfig / SandboxViolation 都显示为 Unknown)
   - 影响范围: file-tools + webfetch + 任何抛 `new AppError(...)` 的 IPC handler
   - 修复方向: 跨 IPC 用 `_tag` 而非 `kind`,或 renderer 端 `decodeAppError` 同时支持 `kind` 字段。**留作独立 ADR** (pre-existing bug,本 PR scope 外)

2. **DNS rebinding 窗口 (5-10ms)**
   - 见 D5 行 159-163
   - V2 评估: `dns.lookup` + 同 tick 内 `fetch`,或 socket-level IP 绑定拦截

3. **Charset 解析缺失**
   - `webfetch.api.ts:20` `new TextDecoder()` 默认 UTF-8,忽略 Content-Type 的 `charset` 参数
   - 非 UTF-8 页面(`shift-jis`, `gbk`, `iso-8859-1`)显示乱码
   - 修复: 解析 `content-type` 头取 charset 参数,fallback UTF-8

4. **XHTML content-type 识别不全**
   - `webfetch.api.ts:18` `includes("text/html")` 不匹配 `application/xhtml+xml`
   - 有效 XHTML 内容不被识别为 HTML,turndown 不转换
   - 修复: 同时检查 `application/xhtml+xml`,加 content-type 集合检查

5. **合法重定向被 SSRF 防护静默阻塞**
   - `redirect: "error"` 拒绝所有 3xx,包括合法 HTTP→HTTPS 升级
   - 用户体验差,LLM 需手动复制最终 URL
   - V2 评估: `redirect: "manual"` + 跳转头 SSRF 重校验

## Considered Options

### D1 reject: 纯 renderer 端 fetch

浏览器 fetch API 在 Electron renderer 可用，但 SSRF 防护无法在 renderer 侧实施（`fetch()` 不暴露 DNS 预解析 + IP 比对能力）。必须走 main 进程。

### D3 reject: 留在 `features/` 下

file-tools 后续考虑从 `features/file-tools` 迁到 `tools/file-ops`，使 `tools/` 成为内置 AgentTool 的 canonical 位置。与 webfetch 同一级可形成 `tools/<name>/` 一致模式。`features/` 回到纯业务域（chat / settings / billing）。

### D6 reject: snake_case `webfetch_url`

`webfetch` 是单字动词（类比 `read_file` 是动宾结构），`webfetch_url` 冗余。LLM 对 "fetch a URL" 的直觉命名是 `webfetch`。

## Consequences

### 正面

- LLM 具备网页抓取能力，对齐 opencode 的 webfetch 体验
- SSRF 防护在 main 端执行，renderer 无网络越权风险
- turndown 转换质量高（atx heading / fenced code / - bullet / * emphasis），与 opencode 一致
- `tools/` 目录形成内置 AgentTool 的 canonical 落位，file-ops + webfetch 同构
- 5+1 → 6+1 白名单扩展满足新增顶层目录需求
- file-ops 扁平化（`lib/` → 文件同级）消除不必要的嵌套深度

### 代价

- 增加 IPC 通道 `webfetch:fetch`（35 → 36 channels，+1 net channel 增量）
- package.json 新增 `turndown` + `@types/turndown` 依赖（约 50KB gzipped）
- file-ops import 路径变更需同步改 runtime.ts 及测试文件（共 5 处 import path 更新）
- ADR-0010 需要 amendment

### 未变

- file-tools 行为与 schema 不变（仅路径迁移）
- `features/` 下 chat / settings / billing 无影响
- `src/shared/lib/workspace-id.ts` 中 `WorkspaceId` 品牌类型复用不变
- `toToolParameters()` Schema → typebox 转换不变

## Rollout Plan

5 commits (+1 fix pass):

1. **Task A** (commit `211af79`): webfetch Effect Schema + html-to-markdown (renderer 纯函数层)
2. **Task B** (commit `a61a744`): main 端 SSRF + IPC handler + preload bridge + ipc-mock
3. **Task C** (commit `ad54f5d`): webfetch.api.ts Service + invoke.api.ts + tool-schema.ts AST walker 扩展
4. **Task D** (commits `bdbf056` + `e63f32a`): file-tools → file-ops migration + barrel + runtime.ts 注入 webfetchTool + 5+1 → 6+1 docs + ADR-0038 草拟
5. **Fix pass** (commit `59b3ef0`): 12 reviewer findings (AppError 包装、SSRF redirect、XSS 标签、lint、ADR 数字修正)

## References

- ADR-0010 (5+1 whitelist, amended by this ADR)
- ADR-0013 (file-io-tools design — file-ops 前身)
- ADR-0013.1 (camelCase wire format)
- ADR-0025 (Effect Schema full-stack)
- ADR-0026 (IPC channel camelCase)
- ADR-0032 (MCP client — parallel agent extension pattern)
- opencode `webfetch` tool (API shape reference)
