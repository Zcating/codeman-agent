# 0041 — MCP 客户端模块拆分:status/transport/handshake/types 各自深实现

- **Status**: accepted
- **Date**: 2026-08-02
- **Scope**: src/main/mcp-*.ts (5 files)
- **Supersedes**: 无 — 纯结构性 refactor
- **Related**:
  -  — MCP Client 决策基线(本 ADR 是其结构落地)
  -  — main IPC 拆分 precedent(per-domain register 函数 + state locality)
  -  — webfetch AgentTool 拆分 precedent

## Context

`src/main/mcp-host.ts`(228L) + `src/main/mcp-manager.ts`(216L)是 main process MCP 客户端实现的两块。

### 痛点

**mcp-host.ts(228L)**:`McpStdioServer` 类同时持有 4 类关注点:
1. **Domain types**(`McpServerConfig` / `McpServerStatus` / `McpTool` / `McpCallResult` / `StatusChangeHandler`)— 38L 类型声明,跨 4 个模块使用(mcp-host / mcp-manager / mcp-config / IPC contracts)
2. **stdio transport**(spawn / kill SIGTERM+SIGKILL fallback / on('exit') / on('error'))— 30L IO
3. **JSON-RPC handshake**(3 步:`initialize` → `notifications/initialized` → `tools/list`)— 30L 协议逻辑
4. **Coordinator logic**(status state transitions / cleanup / connection lifecycle)— 50L 编排

**mcp-manager.ts(216L)**:`McpManager` 类 9 个 public 方法混在一起:
- 协调 2 个内部 `Map<name, X>`(`#servers` / `#configs`)
- 反复调用 `Effect.runPromiseExit(readMcpConfig())`(出现 3 次:startAll / restart / setEnabled)
- 反复 inline `mcp_${slug(serverName)}_${slug(toolName)}` 命名模板(startAll L52 / listAllTools L135)
- startAll 内 inline 多服务器碰撞检测(11 行)
- setEnabled 内 inline 「stop old + start new / stop + remove」二选一(15 行)

读 `callTool()` 要在两个文件间跳:`mcp-manager.ts:148-156` 路由 → `mcp-host.ts:148-160` 真正 send。**locality 失守。**

### Pre-existing 问题

1. **`stop()` race**:原代码 `stop()` 先 `setStatus(crashed)`/`connection=null`,**之后** 5s setTimeout 才可能 SIGKILL — 但 cleanup() 同步把 `this.child = null`,SIGKILL fallback 永远拿不到 child ref。修复 inherent 在 transport 抽象里。
2. **JSON-RPC 子模块未抽出**:`mcp-host.ts` 第 92-120 行内嵌 initialize/tools/list try/catch,phase prefix("initialize failed:" vs "tools/list failed:")hardcode 在两处。
3. **`mcp_<server>_<tool>` 命名规则重复**:startAll 用于碰撞检测,listAllTools 用于输出 — 同一模板字面量出现 2 次。

## Decision

### D1 — 5 个文件,4 个深模块 + 1 个 coordinator

| 文件 | 行数 | 关注点 |
| --- | --- | --- |
| `mcp-types.ts` | 50L | domain types + `slug()` + `mcpAgentName()` 命名 helper |
| `mcp-stdio-transport.ts` | 75L | spawn / kill SIGTERM+SIGKILL fallback / event handler registration |
| `mcp-handshake.ts` | 60L | 3 步握手 procedure + `HandshakeError(phase)` 错误分类 |
| `mcp-host.ts` | 133L | `McpStdioServer` coordinator(start / stop / callTool / getStatus / getConfig / listTools / onStatusChange) |
| `mcp-manager.ts` | 189L | `McpManager` 多服务器编排 + list APIs |

**拒绝**:
- A. 4 文件(合并 status 进 types):`McpServerStatus` 是判别联合,**带 method**(未来可能加 transition 函数);`mcp-types.ts` 应只放纯类型与纯函数,不掺行为。
- C. 6 文件(进一步拆 manager 协调 vs list):listServers/listAllTools 是 manager **public API**,不能拆。

### D2 — `McpStdioServer` public API 7 → 6 methods(无变化)

保留全部 7 个 public 方法:
- `getConfig()` / `getStatus()` / `listTools()` — 只读 query
- `start()` / `stop()` — 生命周期
- `callTool()` — 业务调用
- `onStatusChange()` — 状态 hook

start() 80L → 40L(累计 -50%)。

**拒绝**:`onStatusChange` 是 mcp-manager / IPC UI 唯一监听状态变化方式,删除它会丢失 hook 机制;`getConfig` 是 IPC `mcp:get-tools` 唯一识别 server 的方式。

### D3 — `StdioTransport` 作为 deep module

封装:
- `start()`:spawn child with env merge + stdio pipe config
- `kill()`:send SIGTERM + 5s SIGKILL fallback + `Promise` resolves on child `exit` 事件(**修复 D-context pre-existing race**)
- `setOnExit()` / `setOnError()`:event handler registration

**理由**:`StdioTransport` 拥有 child process 生命周期;`McpStdioServer` 只关心 status + connection 协调。这是经典的「separation of concerns + state locality」 — child lifecycle 与 class status 状态机互不污染。

**拒绝**:
- A. functional factory `createStdioTransport(opts)`:项目惯例是 class-based stateful module(SettingsState)。
- C. transport 直接 inline 在 `McpStdioServer`:违反 拆分的 D3 locality 精神(transport 状态是独立 concern)。

### D4 — `performHandshake` 作为 procedure

3 步握手 → 单函数 `performHandshake(connection, serverName): Promise<McpTool[]>`。

`HandshakeError` 类带 `phase: "initialize" | "tools_list"`,caller(`McpStdioServer`)用 `instanceof` 区分错误前缀恢复 "<phase> failed: <msg>" UI 格式。

**理由**:protocol phase 知识属于 mcp-handshake 模块,caller 不需要知道握手细节 — 只关心结果或失败。`HandshakeError` 把 phase 信息编码进错误实例,避免 caller 做 string match。

### D5 — `mcpAgentName(serverName, toolName)` 提取

把 `mcp_${slug(serverName)}_${slug(toolName)}` 模板字面量收成命名 helper。

`slug()` 也搬到 `mcp-types.ts`(原本 `mcp-manager.ts` 文件作用域函数),与 `mcpAgentName` 同源。

**理由**:per,`mcp_<server-name>_<tool-name>` 是项目锁定的命名规则(避免与 7 个内置 tool 撞名 + LLM 一眼识别来源)。命名 helper 集中这一规则,所有 caller 必然走同一路径 — 不会有「某个 caller 漏了 slug」之类 bug。

### D6 — `McpManager` private helpers 抽取

抽 4 个 private method,消除 restart / setEnabled 重复:
- `#loadConfigOrThrow()` — `Effect.runPromiseExit(readMcpConfig())` + `InvalidConfig` 抛错
- `#writeConfigOrThrow(config)` — `Effect.runPromiseExit(writeMcpConfig(config))` + `InvalidConfig` 抛错
- `#swapServer(name, newConfig)` — stop old + create new + start (used by restart / setEnabled enable branch)
- `#stopAndRemove(name)` — stop + delete from map (used by setEnabled disable branch)

**拒绝**:
- A. 完全 functional 化(`createMcpManager()`):manager 状态本身是 `Map<name, X>` × 2,纯函数化会让闭包内 mutable state 失去显式表达,违反「interface = test surface」原则。
- C. 把 `McpServerInfo` / `McpToolEntry` 类型拆到独立文件:这 2 个类型是 manager 的**输出 contract**,与 manager 同生共死。

### D7 — 测试策略:per-module + 边界

| 测试文件 | 测什么 |
| --- | --- |
| `mcp-types.test.ts`(7 cases) | `slug()` 边界(空 / 全符号 / 大小写) + `mcpAgentName()` 组合 |
| `mcp-stdio-transport.test.ts`(8 cases) | spawn invocation shape / pipe accessors / handler dispatch / kill SIGTERM |
| `mcp-handshake.test.ts`(5 cases) | method ordering / params / tool mapping / `HandshakeError` phase propagation |
| `mcp-host.test.ts`(8 cases,pre-existing) | disabled server / spawn throw / callTool 未连接 / unsubscribe |
| `mcp-manager.test.ts`(4 cases,pre-existing) | empty list / invalid agent name / restart 找不到 |

总计:32 个 MCP 相关测试(few 28 个)。

### D8 — `jsonrpc.ts` 不动

1 个 caller = 假 seam。`McpStdioServer` 已通过 transport 隔离间接使用 jsonrpc。V2+ SSE/Streamable HTTP transport 评估时再回头。

### D9 — 公共 API 不变

所有 9 个 `McpManager` public 方法 + 7 个 `McpStdioServer` public 方法 + 5 个 type re-export + `StdioTransport` class(内部)+ `performHandshake` / `HandshakeError`(内部)。

`McpServerConfig` / `McpServerStatus` / `McpTool` / `McpCallResult` / `StatusChangeHandler` 仍从 `mcp-host.ts` re-export(`export type { ... } from "./mcp-types"`),保持现有 import 路径兼容。

## Considered Options(高层)

| 选项 | 描述 | 选 / 不选 |
| --- | --- | --- |
| 不动 | 维持 2 文件 444L 集中 | 不选 — locality 失守 + pre-existing race 不修 |
| 整体 functional 化 | 全部 factory function + closure | 不选 — manager 状态 mutable,class 表达更清晰 |
| 仅抽 transport | 只抽 `StdioTransport`,其他不变 | 不选 — handshake / naming rule 同样有 locality 收益 |
| 抽 transport + handshake + types | 不抽 `mcpAgentName` / 不抽 manager helpers | 不选 — 命名 helper 是 锁定规则,manager helpers 消除 restart/setEnabled 重复 |

## Consequences

### 正面

- **Locality**:读 `callTool()` 不再跨文件跳;读 handshake 不再读 spawn;读 naming rule 不再 inline 模板字面量
- **Leverage**:未来 transport 扩展(V2 SSE/Streamable HTTP)— status 状态机可独立扩展(`McpServerStatus` 加 `kind: "sse_connecting"` 等);`mcpAgentName` 是 锁规则,所有 caller 必走
- **Test surface**:纯函数模块(`mcpAgentName` / `slug` / `performHandshake`)不依赖 child process / filesystem;`StdioTransport` 可用 fake spawnFn 单测
- **Pre-existing race 修复**:`StdioTransport.kill()` 在 child `exit` 事件触发时 resolve,**不**依赖 5s 定时器;原 `stop()` race(cleanup() 提前 null child 让 SIGKILL fallback 失效)结构性修复
- **D5 + D6 DRY**:`restart` / `setEnabled` 共享 `swapServer` / `stopAndRemove` private helpers;`readMcpConfig` / `writeMcpConfig` Effect-run-or-throw 共享 `#loadConfigOrThrow` / `#writeConfigOrThrow`
- **接口收窄**:`McpStdioServer.start()` 80L → 40L(-50%),`McpStdioServer` 类 228L → 133L(-42%);`McpManager` 类 217L → 189L(-13%)

### 负面 / 代价

- **总行数上升**:444L → 507L(+63L),因为新增测试文件 + 类型注释 + private helper boilerplate
- **新文件 ×4**:mcp-types.ts / mcp-stdio-transport.ts / mcp-handshake.ts / 测试文件 ×3。git history 多 ~5 commits
- **`McpStdioServer.stop()` 语义微调**:现在 `await stop()` 会等到 transport.kill() resolve(child exit 事件);旧版 fire-and-forget SIGTERM,cleanup 立即跑。原 race 修复的副作用

### 不变

- 公共 API surface 100% 兼容(McpManager 9 methods + McpStdioServer 7 methods + 5 type re-exports)
- IPC contracts(`mcp:list-servers` / `mcp:call-tool` / 等 7 个 channel) — 完全不变
- stdio-only 约束 — 完全不变
- `mcp_<server>_<tool>` 命名规则 — **强化**(helper 集中)
- tool call 路径(main process spawn) — 完全不变
- Electron lifecycle(whenReady / before-quit) — 完全不变

## Implementation Outline

```
src/main/
├── mcp-types.ts                 # +50L (NEW)
│   ├── McpServerConfig / McpServerStatus / McpTool / McpCallResult / StatusChangeHandler
│   ├── slug(name: string): string
│   └── mcpAgentName(serverName, toolName): string  ← naming rule
├── mcp-stdio-transport.ts       # +75L (NEW)
│   └── class StdioTransport
│       ├── start(): ChildProcess
│       ├── kill(): Promise<void>   ← resolves on exit event
│       ├── setOnExit / setOnError
│       └── stdin / stdout accessors
├── mcp-handshake.ts             # +60L (NEW)
│   ├── async performHandshake(connection, serverName): Promise<McpTool[]>
│   └── class HandshakeError extends Error { phase: "initialize" | "tools_list" }
├── mcp-host.ts                  # 228L → 133L (refactored)
│   ├── import type { ... } from "./mcp-types"
│   ├── export type { ... } (back-compat re-export)
│   └── class McpStdioServer   # start() 80L → 40L coordinator
└── mcp-manager.ts               # 217L → 189L (slimmed)
    ├── import { mcpAgentName } from "./mcp-types"
    └── class McpManager
        ├── public 9 methods (unchanged)
        └── private helpers: #loadConfigOrThrow / #writeConfigOrThrow / #swapServer / #stopAndRemove
```

## Rollout

7 个 atomic commits on `refactor/mcp-decompose-and-seams` branch(off master `a115c74`):

```
refactor(mcp): extract mcp-types.ts — domain types isolated from IO module
refactor(mcp): extract StdioTransport class — spawn/kill lifecycle isolated
refactor(mcp): wire McpStdioServer to use StdioTransport
refactor(mcp): extract performHandshake — 3-step MCP initialization
refactor(mcp): wire McpStdioServer.start() to call performHandshake
refactor(mcp): add mcpAgentName + slim McpManager (swap/stopAndRemove helpers)
docs: — MCP module decomposition
```

每 commit 验证:
- `vp run typecheck` → exit 0
- `npm run test:main` → 全过(逐步从 baseline 267 → 285)

## Verification gates

合并前:
- `npm run test:main` ≥ baseline 267 passed(实际 285 = +18 new)
- `vp run typecheck` exit 0
- 无 `as any` / `@ts-ignore` / `@ts-expect-error`
- 公共 API surface 不变(mcp-host.test.ts / mcp-manager.test.ts 不改测试逻辑)
- git bisect:任一 commit revert 都能编译 + 跑测试

## References

-  — MCP Client 决策基线(D2 stdio + D3 naming + D4 call path + D7 IPC)
-  — per-domain register 函数 + state locality precedent
-  — AgentTool main 拆分 precedent
- MCP spec (Anthropic 2024-11): https://modelcontextprotocol.io
- AGENTS.md — "atomic commit" / "精准修改" / "简单优先" / "the interface is the test surface"