# 0060.1 — LLM Proxy Protocol: `codeman-llm://` custom protocol 替代 chat LLM IPC bridge

- **Status**: accepted
- **Date**: 2026-08-11
- **Scope**:
  - 新增 `src/main/lib/llm-proxy.ts`(`registerLlmProxyProtocol()` 函数 + 1 段 `protocol.handle("codeman-llm", handler)` 注册,~30 行)
  - 新增 `src/main/index.ts` 的 `protocol.registerSchemesAsPrivileged` 条目(`codeman-llm` scheme + 5 个 privileges)
  - 新增 `src/main/index.ts::registerLlmProxyProtocol()` 启动调用
  - 新增 `src/renderer/src/features/chat/lib/anthropic-stream-fn.ts` 1 行 `https://` → `codeman-llm://` URL 改写(只 1 点,anthropicStream StreamFn 内部)
  - 删 `src/main/features/llm-bridge/{handler.ts, stream.ts, handler.test.ts, stream.test.ts}` (4 文件)
  - 改 `src/renderer/src/features/chat/lib/anthropic-stream-fn.ts` 退回 pi-ai 原生 `createAssistantMessageEventStream` + `fetch`(删除 4 个 sanitize 函数)
  - 改 `src/preload/index.ts` 删除 `llmStream` bridge 暴露
  - 改 `src/renderer/src/__mocks__/ipc-mock.ts` 删除 llm-bridge stub
  - 改 `docs/adr/0060-automations-preload-bridge.md` 顶部加 superseded 标记(同批 commit)
  - 新增 `docs/adr/0060.1-llm-proxy-protocol.md`(本文件)
- **Supersedes**: 的 chat LLM stream 部分(本 ADR 是 0060 的 v2 修订,沿用 0060.1 编号对齐项目 0013/0013.1 模式)
- **Related**:
  -  — Electron 3 进程边界(本 ADR 在 boundary 加第 3 种跨进程 seam:custom protocol)
  -  — automations LLM listener 仍走 preload bridge 模式,本 ADR 不 supersede 该模式,只 supersede chat LLM stream
  -  — IPC channel camelCase(本 ADR 不新增 IPC channel)

## Context

### 根因(commit fbdb3ee 回归)

Chromium preflight OPTIONS 把 `X-Stainless-OS` 等 Stainless SDK 头带上,Anthropic / MiniMax / DeepSeek 的 CORS 响应 `Access-Control-Allow-Headers` 不列入这些头 → Chromium 拦截真实 POST 请求。

### 此前方案(被本 ADR supersede)

commits `9f80522` + `b86fab4` + `cf3c34a` 落地了 LLM IPC bridge:

- `src/main/features/llm-bridge/handler.ts`(72 行) 收 IPC → 调 `forwardAnthropicStream` → `anthropicMessagesApi().stream()` 走 Node fetch
- `src/renderer/src/features/chat/lib/anthropic-stream-fn.ts`(94 行,5 职责) 把 stream 切到 `window.codeman.llmStream`,跨 IPC + preload 生成 streamId
- 4 个 sanitize 函数(`stripNonSerializable` / `sanitizeTool` / `sanitizeMessage` / `sanitizeContext`)把 pi-agent 宽 runtime 类型压成 IPC structured-clone 兼容的窄 DTO
- 188 行 `anthropic-stream-fn.test.ts` 锁 IPC 序列化契约

**问题**:CORS 是 Chromium 头过滤问题(1 行 `webRequest.onBeforeSendHeaders` 删头 或 1 行 `Access-Control-Allow-Headers: *` 注入可解),当前方案把 CORS 当"换协议走 main"来解决,引入 3 层 IPC + 4 个 sanitize + streamId 路由 + AbortController + cancelMap,over-engineering for the problem。

### 设计空间评估(被否的方案)

| 方案                                                         | 否定理由                                                                                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **A1. `webRequest.onBeforeSendHeaders` 剥 Stainless 头**     | 改 server 期望字段;Electron 版本差异下 preflight 处理不保证                                                              |
| **A2. `webRequest.onHeadersReceived` 改 CORS 响应头**        | 跟本方案本质相同(都改 Electron 层),但越权 — 重写 server 响应是协议外的 hack                                              |
| **A3. `webPreferences.webSecurity: false`**                  | 全局禁用 CORS,renderer 加载任何远程内容都裸奔                                                                            |
| **A4. renderer Service Worker 拦截 OPTIONS**                 | renderer 侧方案思路对,但 SW 生命周期管理 + dev mode 注册抖动 + jsdom 测试 mock 复杂度高                                  |
| **A5. `anthropic-dangerous-direct-browser-access: true` 头** | Anthropic 官方支持浏览器访问,但 MiniMax / DeepSeek 是 anthropic-compatible 未必识别;要求 API key 被 mark 为 browser-safe |

## Decision

### D1 — `codeman-llm://` custom protocol 作为跨进程代理

主进程注册 `codeman-llm` scheme,handler 收到 renderer 的 fetch 后,`net.fetch(realUrl, options)` 转发到真实 LLM endpoint。Renderer 使用标准 `fetch` API,URL scheme 改为 `codeman-llm://`。Chromium 视 custom scheme 为同源,**无 CORS 拦截**。

**为什么不走 IPC**:IPC 跨进程每次 frame 都需 `webContents.send` + preload 转发 + streamId 路由;custom protocol 让 Chromium 内部直接转发,IPC 开销 0,stream 是原生 `ReadableStream` 而非手写 frame protocol。

### D2 — Privileges 对齐 `app://`

```typescript
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  }, // 已有
  {
    scheme: 'codeman-llm',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  }, // 新增
]);
```

5 个 privileges 全部对齐 `app://`(已在 `src/main/index.ts:28-39` 锁定):

- `standard`:URL 走标准解析(不是 `opaque://`)
- `secure`:mark 为 secure context(`window.isSecureContext === true`)
- `supportFetchAPI`:支持 `fetch()`
- `corsEnabled`:允许 CORS 跨域(虽然我们不需要,但与 `app://` 对齐)
- `stream`:支持 `Response` body 是流

**必须在 `app.whenReady()` 之前注册**(`protocol.registerSchemesAsPrivileged` 只在 app 启动前有效)。

### D3 — Handler 转发所有 method/headers/body/signal

```typescript
// src/main/lib/llm-proxy.ts(~30 行)
import { protocol, net } from 'electron';
import { Readable } from 'node:stream';

export function registerLlmProxyProtocol(): void {
  protocol.handle('codeman-llm', (request) => {
    // codeman-llm://api.minimaxi.com/anthropic/v1/messages
    //   → https://api.minimaxi.com/anthropic/v1/messages
    const realUrl = request.url.replace(/^codeman-llm:\/\//, 'https://');

    // Headers:Electron Headers 对象 → 普通对象给 net.fetch
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Body:renderer ReadableStream → Node Readable(给 net.fetch)
    let body: NodeJS.ReadableStream | undefined;
    if (request.body) {
      body = Readable.fromWeb(request.body as any);
    }

    // net.fetch 自然接受 AbortSignal,Chromium 通过 protocol.handle 传 Request.signal
    return net.fetch(realUrl, {
      method: request.method,
      headers,
      body: body as any,
      signal: request.signal, // AbortController cancel 通过此 propagate
    });
  });
}
```

`net.fetch` 返回标准 `Response`,Chromium 自动 stream 给 renderer,无需主进程手动管理 frame 转发。

### D4 — URL 改写 1 点,在 `anthropicStream` StreamFn 内

```typescript
// src/renderer/src/features/chat/lib/anthropic-stream-fn.ts(改后 ~10 行)
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai';
import type { StreamFn } from '@earendil-works/pi-agent-core';

const PROXY_SCHEME = 'codeman-llm://';

export const anthropicStream: StreamFn = (model, context, options) => {
  const stream = createAssistantMessageEventStream();
  // URL 改写 1 点:https:// → codeman-llm://
  // model.api 的 baseUrl 在 Provider 存时是 https://,这里改写为 proxy scheme
  const proxyBaseUrl = model.api.replace(/^https:\/\//, PROXY_SCHEME);
  // ... 调用 pi-ai SDK,SDK 内部 fetch(proxyBaseUrl + path) → main net.fetch 转发
  return stream;
};
```

**为什么不在 baseUrl 存时改写**:UI 让用户输入 `https://...` 是产品形态,内部存 `codeman-llm://` 是实现细节;混在存储层会污染 user-facing schema。

**为什么不在 fetch 层包装**:wrap `window.fetch` 是隐式 hook,所有 fetch 都被过滤;debug 困难。URL 改写集中在 StreamFn 1 点,显式可控。

### D5 — Cancel 走标准 `AbortController`

`anthropicStream` 接收 `options.signal`(pi-agent 内部 `AbortController`),传给 `fetch(signal)`,Chromium 通过 `protocol.handle` 的 `request.signal` 传给 main,main `net.fetch(realUrl, { signal })` 自然 abort。链路: renderer AbortController → fetch signal → Request signal → main net.fetch abort。**无自建 cancel IPC**。

### D6 — Mock server URL 不动

`http://127.0.0.1:50000/mock/anthropic/...` 是同源,无 CORS,**不**走 `codeman-llm://` 代理。`Provider.llm.baseUrl` 保持 `http://...`,fetch 路径不变。

`mock://` 前缀(V1 旧约定,可能仍残留)需迁移到 `http://127.0.0.1:...`,**不在本 ADR scope**(由 mock server 路径 ADR 处理)。

### D7 — 删旧 LLM IPC bridge

**全删**:

- `src/main/features/llm-bridge/handler.ts`(72 行)
- `src/main/features/llm-bridge/stream.ts`(44 行)
- `src/main/features/llm-bridge/handler.test.ts`
- `src/main/features/llm-bridge/stream.test.ts`(169 行)
- `src/renderer/src/features/chat/lib/anthropic-stream-fn.ts` 4 个 sanitize 函数(`stripNonSerializable` / `sanitizeTool` / `sanitizeMessage` / `sanitizeContext`)
- `src/renderer/src/features/chat/lib/anthropic-stream-fn.test.ts` 188 行(需重写为只测 URL 改写)
- `src/preload/index.ts` `llmStream` bridge 暴露
- `src/renderer/src/__mocks__/ipc-mock.ts` llm-bridge stub
- `src/main/ipc.ts` `registerLlmBridgeIpc({ cancelMap })` 调用 + 取消 map 注入

**保留**:

- `src/main/features/llm-bridge/` 目录本身(空目录,git 删)
- `cancelMap` 概念(webfetch 用,不在本 ADR scope)
- `emitStreamChunk`(mock-server 路径不同)

### D8 — 1 PR 一次性落地

**PR 形态**:1 个原子 PR,8 个文件改动。不分批(避免中间态 chat 不可用)。

PR 描述模板:

```
feat(chat): replace LLM IPC bridge with codeman-llm:// custom protocol

- Add src/main/lib/llm-proxy.ts with registerLlmProxyProtocol()
- Register codeman-llm scheme in src/main/index.ts alongside app://
- Add URL rewrite in anthropicStream (https:// → codeman-llm://)
- Delete src/main/features/llm-bridge/ (4 files, ~285 LOC)
- Remove 4 sanitize functions from anthropic-stream-fn.ts
- Remove llmStream bridge from preload + ipc-mock stub
- Update anthropic-stream-fn.test.ts to test URL rewrite only (~30 LOC)
- Update docs/adr/0060 to mark superseded

Refs
```

## Implementation

### `src/main/lib/llm-proxy.ts`(新增,~30 行)

```typescript
// LLM Proxy Protocol  — codeman-llm:// custom protocol 让 renderer
// 走主进程 net.fetch 访问 LLM endpoint,绕过 Chromium CORS preflight。
// 平行于 app:// 自定义协议(本地文件代理,见 src/main/index.ts::registerAppProtocol)。
import { protocol, net } from 'electron';
import { Readable } from 'node:stream';

const PROXY_SCHEME = 'codeman-llm://';
const REAL_SCHEME = 'https://';

export function registerLlmProxyProtocol(): void {
  protocol.handle(PROXY_SCHEME, (request) => {
    const realUrl = request.url.replace(new RegExp(`^${PROXY_SCHEME}`), REAL_SCHEME);
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    const init: RequestInit = {
      method: request.method,
      headers,
    };
    if (request.body) {
      (init as any).body = Readable.fromWeb(request.body as any);
      (init as any).duplex = 'half';
    }
    return net.fetch(realUrl, init);
  });
}
```

### `src/main/index.ts` 改动(2 处)

```diff
+ import { registerLlmProxyProtocol } from "./lib/llm-proxy";

  protocol.registerSchemesAsPrivileged([
    { scheme: "app", privileges: { ... } },
+   { scheme: "codeman-llm", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  ]);

  app.whenReady().then(() => {
    ...
    registerAppProtocol();
+   registerLlmProxyProtocol();
    registerIpcHandlers({ getMainWindow: () => mainWindow });
    ...
  });
```

### `src/renderer/src/features/chat/lib/anthropic-stream-fn.ts`(重写)

改后 ~10 行,只保留 URL 改写 + StreamFn 转发:

```typescript
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai';
import type { StreamFn } from '@earendil-works/pi-agent-core';

const PROXY_SCHEME = 'codeman-llm://';

export const anthropicStream: StreamFn = (model, context, options) => {
  const proxyModel = {
    ...model,
    api: model.api.replace(/^https:\/\//, PROXY_SCHEME),
  };
  const stream = createAssistantMessageEventStream();
  // pi-ai SDK 用 proxyModel.api 构造 fetch URL,自动走 protocol.handle("codeman-llm", ...)
  // 实际 SDK 调用点可能不同,需 review pi-ai 0.80.x 的 StreamFn 期望
  // ...
  return stream;
};
```

> **注**:pi-ai 0.80.x 的 `StreamFn` 实际语义可能比这复杂,需 review `@earendil-works/pi-ai` 实际期望;若 SDK 已封装 fetch(在 SDK 内部 fetch(model.api, ...)),则改写 model.api 即可,无需 wrap fetch。落地时需先看 SDK 源码。

## Verification

### 自动化验证

| 检查                                                                     | 命令                                                                                                                                       | 结果                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| 旧 llm-bridge 文件全删                                                   | `ls src/main/features/llm-bridge/`                                                                                                         | 目录不存在                                   |
| 4 sanitize 函数全删                                                      | `grep -E "stripNonSerializable\|sanitizeTool\|sanitizeMessage\|sanitizeContext" src/renderer/src/features/chat/lib/anthropic-stream-fn.ts` | 0 匹配                                       |
| main 进程无 Electron electron import 残留                                | `grep "from 'electron'" src/renderer/src/**/*.ts`                                                                                          | 0 匹配(per)                      |
| anthropicStream 单测通过(只测 URL 改写)                                  | `vp run test anthropic-stream-fn.test.ts`                                                                                                  | N/N passed                                   |
| Typecheck (web)                                                          | `vp run typecheck:web`                                                                                                                     | 0 errors                                     |
| Typecheck (node)                                                         | `vp run typecheck:node`                                                                                                                    | 0 errors                                     |
| Production build                                                         | `vp run build:dir`                                                                                                                         | out/main, out/preload, out/renderer 全部生成 |
| `app://` 与 `codeman-llm://` 都在 `protocol.registerSchemesAsPrivileged` | `grep` src/main/index.ts                                                                                                                   | 2 个 scheme 条目                             |

### 手动验证(dev + prod 都需要)

| 步骤                                        | 期望                                                                                                  |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `vp run dev` 启动 Electron,DevTools console | 无 `llmStream` / `llm-bridge` 报错                                                                    |
| chat 输入 query,真实 LLM 流式返回           | network tab 显示 `codeman-llm://...` 请求,200 OK,streaming response                                   |
| 取消正在流的 LLM 请求                       | `AbortController.abort()` → DevTools 显示 `codeman-llm://...` 请求 `cancelled`,不抛错                 |
| mock 模式:Add Provider 用 Mock 模板         | provider `baseUrl` 为 `http://127.0.0.1:50000/...`,请求**不**走 `codeman-llm://`,mock server 正常响应 |
| 出错:LLM 401 / 500                          | DevTools 显示 `codeman-llm://...` 401/500 响应,UI 显示 LLM error                                      |

### e2e 验证

| spec                      | 验证内容                                                              |
| ------------------------- | --------------------------------------------------------------------- |
| `e2e/chat-stream.spec.ts` | 真实 LLM 流(若 e2e 配置走 mock) 或 mock LLM 流,断言 UI 渲染流式 chunk |
| `e2e/chat-cancel.spec.ts` | 流中途点 cancel,断言 fetch `cancelled`                                |

## Alternatives Considered

### A. `webRequest.onBeforeSendHeaders` 剥 Stainless 头

- **优点**:不引入 custom protocol,改动最小
- **缺点**:对 Chromium preflight 处理做隐式干预,Electron 版本升级可能不兼容;理论上是 hack
- **拒绝**

### B. `webRequest.onHeadersReceived` 改 CORS 响应头

- **优点**:不引入 custom protocol
- **缺点**:重写 server 响应是协议外 hack;与 D5「mock URL 不动」原则反 — 我们改的是 Electron 层,不是 server
- **拒绝**

### C. renderer Service Worker 拦截 OPTIONS

- **优点**:纯 renderer 侧,无 main 改动
- **缺点**:SW 生命周期管理(dev mode 频繁 reload SW);jsdom 测试 mock 复杂度;主进程 webRequest 已可解,SW 是 over-engineering
- **拒绝**

### D. `anthropic-dangerous-direct-browser-access: true` 头

- **优点**:1 行,Anthropic 官方支持
- **缺点**:MiniMax / DeepSeek 是 anthropic-compatible 未必识别;要求 API key 被 mark 为 browser-safe(产品决策,不在本 ADR scope)
- **拒绝**

### E. 保留 IPC bridge,加 webRequest 头改写作为 fallback

- **优点**:交班平滑
- **缺点**:2 条路径走 2 套代码,未来要追 2 套;违反「简单优先」
- **拒绝**

## Consequences

### 收益

- **代码净减**:`-285 LOC`(4 个 llm-bridge 文件) `-50 LOC`(4 个 sanitize 函数) `-30 LOC`(preload + ipc-mock stub),共 `-365 LOC`
- **架构归位**:LLM 流跨进程走 custom protocol 平行于 `app://` 模式,与项目已有的「主进程代理」seam 一致
- **Web 标准**:renderer 走标准 `fetch` + `AbortController` + `ReadableStream`,无自建 frame protocol
- **错误传播**:标准 `fetch` rejection + `Response.status`,无自建 error frame
- **CORS 消失**:custom scheme 同源,根因消除,不再需要未来 Chromium 升级时追 CORS 行为变化

### 代价

- **`protocol.handle` 难单测**:Electron 进程级 API,需 e2e 验证;jsdom 不支持
- **URL 改写是隐式行为**:`anthropicStream` 改了 `model.api` 但不改用户输入,debug 时需看 StreamFn 知道有改写
- **dev mode SW-style 实测**:protocol.handle 在 `vp run dev` 行为应与 prod 一致,但需手动验证 Electron 跨域行为
- **pi-ai SDK 兼容性**:SDK 0.80.x 的 StreamFn 期望可能与本 ADR 假设不符,落地时需先 review SDK 源码

### 兼容性

- **mock server URL**:`http://127.0.0.1:...` 不动,同源无 CORS
- **Provider.llm.baseUrl**:`https://...` 保持,UI 不变
- **Anthropic SDK 协议**:走的是 anthropic-messages 协议,per
- **Pi-ai SDK 期望**:`StreamFn` 签名不变,只是实现更简单
- **CONTEXT.md 词条**:新增「LLM Proxy Protocol」词条(本 ADR 提交时同步)

### ADR 关系更新

- **ADR-0060**:automations LLM listener 仍走 preload bridge 模式,**不**supersede 该部分;只在文件顶部加 `Status: superseded` 标记,说明 chat LLM stream 部分被本 ADR 替代
- **ADR-0011**:V1 chat 域走 anthropic-messages-only,本 ADR 与之相容(LLM 协议不变,跨进程 seam 变)
- **ADR-0024**:Electron 3 进程边界;本 ADR 在 boundary 加第 3 种跨进程 seam(`custom protocol`),未来可作 的 D11 amend 候选(暂不写,等下一个 custom protocol 用例出现时合并)
