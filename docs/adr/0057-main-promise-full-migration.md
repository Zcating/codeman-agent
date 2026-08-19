# 0057 — src/main Promise 全量迁移 Effect-TS：错误分离 + sandboxHandler 改造 + 7 候选

- **Status**: accepted
- **Date**: 2026-08-07
- **Scope**: `src/main/` 全部 Promise 存量 → Effect-TS；错误体系分离；IPC 边界统一
- **Supersedes**:
  -  **D6 反候选锁定**（webfetch / IPC adapter 从「不转」改为「全转」）
  -  **D6 `McpManager` class 保留 / D3 `StdioTransport` 外壳锁定**（MCP 全重设计为工厂 + Effect）
  -  **D2 分裂人格消除范围**（transport kill 统一进 lib/child-process）
- **Related**:
  -  — Schema.TaggedError / AppError 基类
  -  — automations 域（scheduler 重设计基础）
  -  — 纯工厂函数先例（createAgentRuntime）
  -  — run-command 工具（spawn 语义）

## Context

### 调研结论（2026-08-07 全量扫描 src/main，134 files）

ADR-0046 系列（jsonrpc Fiber 化 / db Layer / mock-server / boot Scope）落地后，src/main 仍存在 **50 个文件使用 Promise**。关键发现：

1. **错误体系 4 套并存**：renderer 的 `AppError`（10 个 TaggedError class）+ `src/main/file-sandbox.ts` 局部 `{kind}` 判别联合（**同名不同物**）+ `mcp-handshake.ts` `HandshakeError extends Error` + `decode-app-error.ts` 的 `AppErrorUnion` Schema（缺 2 成员）
2. **main → renderer cross-boundary import**：16 个 main 文件 `import ... from "../../../renderer/src/shared/lib/errors"`
3. **3 处重复 spawn 样板**：`run-command/exec.ts` / `automations/executor.ts` / `mcp-stdio-transport.ts` 各自 `new Promise + spawn + setTimeout`——「3 个 adapter = 真实 seam」的铁证
4. **sandboxHandler 只包 async fn**：6 域 IPC handler 各自 `async (_e, args) => runMain(effect)` 样板（~25 处），错误序列化双字段检查（kind/\_tag）
5. **IPC 错误契约既有 bug**：conversations/workspaces/compaction/automations 域直接 runMain throw typed error（无 `{kind, message}` JSON）→ renderer `mapIpcError` 全部 fallback `Unknown`；`SandboxViolation` 的 `path`/`workspaceLabel` 必填导致跨 IPC 解码失败
6. **scheduler 混合人格**：class singleton + `Effect.runPromise` 逐点解包 + `Effect.promise` 桥回包（同一域 3 个方向跨边界）

### 用户决策（/grilling，2026-08-07）

| 决策            | 结论                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 范围            | **webfetch + IPC adapter 全转**（revisit D6）；单分支连续提交                                                     |
| 错误命名        | main 侧 `AppBackendError` namespace + `AppBackendErrorUnion`（Schema.Union 推导类型）；**main / renderer 错误物理分离** |
| sandboxHandler  | 改为 **Effect 的消费者**：`sandboxHandler(makeEffect) → (event, args) => Promise`；同步模块 `Effect.sync` 包裹          |
| 测试            | main 侧测试统一 **@effect/vitest**（it.effect / it.live）                                                               |
| MCP / scheduler | 全重设计为**纯工厂 + Effect**（revisit D6/D3）                                                                 |
| 记录            | 新 + 旧 ADR 加 Superseded 链接                                                                                 |

## Decision

### D1 — 错误分离：`AppBackendError` namespace（main 侧）

`src/main/lib/errors.ts`（新文件）：

- **8 个 TaggedError class**（无 renderer 专属的 Unauthorized / ToolCall）收进 `export namespace AppBackendError`（值 + 类型双空间合一）：
  `NotFound`（含 `path?`）/ `Network` / `InvalidConfig` / `Database` / `SandboxViolation`（`message?`/`path`/`workspaceLabel?`）/ `Unknown` / `JsonRpcProtocolError` / `JsonRpcTimeoutError`
- `AppBackendErrorUnion = Schema.Union(8)`（类型 + 运行时二合一）+ `type AppBackendErrorUnion` + `isAppBackendError` 守卫
- **字段差异是有意为之**（main 自身需求优先，与 renderer 不对齐）：IPC 序列化只传 `{kind, message}`，额外字段不跨进程

**renderer 侧配套修复**（`decode-app-error.ts` + `errors.ts`）：

- `AppErrorUnion` Schema 补全 JsonRpc 两个成员（对齐 `AppError` 类型 10 成员）
- `SandboxViolation` 的 `path`/`workspaceLabel` 改 optional——修复「IPC 只传 {kind, message} 导致解码失败 fallback Unknown」的既有 bug

**迁移**：16 个 main 文件 import 从 `../../../renderer/src/shared/lib/errors` → `../../lib/errors.js`；`mcp-handshake.ts` 的 `HandshakeError` 归并 `JsonRpcProtocolError`（phase 并入 message）；`file-sandbox.ts` 局部 `AppError` 判别联合删除（候选 2 时并入）。

**顺带修复**：`conversations/data.ts getConversation` / `workspaces/data.ts addWorkspace` / `file-ops/data.ts getWorkspaceById` 的 `Error` 错误类型 → `AppBackendError.NotFound` / `Database`（sandboxHandler 类型约束暴露的既有类型缺陷）；`settings/ipc.ts` 的 `subAgents:delete` / `setEnabled` handler 参数与 preload 契约不匹配（`{id}` 对象 vs 裸 string）——**pre-existing bug，顺手修复**（此前删除/启停 multi-agent 从未生效）。

### D2 — sandboxHandler 改造：Effect 消费者

```ts
export function sandboxHandler<TArgs extends unknown[], R, TResult>(
  makeEffect: (...args: TArgs) => Effect.Effect<TResult, AppBackendErrorUnion, R>,
): (_event: unknown, ...args: TArgs) => Promise<TResult> {
  return (_event, ...args) =>
    runMain(makeEffect(...args)).catch((e) => {
      if (isAppBackendError(e)) {
        throw new Error(JSON.stringify({ kind: e._tag, message: e.message ?? String(e) }));
      }
      throw e;
    });
}
```

- 内部 `runMain`（mainRuntime = ManagedRuntime.make(MainLive)，MainLive 提供 SqliteClient 等 context）
- 序列化从双字段检查（kind/\_tag）简化为 `_tag` 单一来源
- 同步模块（settings/state、config-service、logger、cancel-map）用 `Effect.sync` 包裹
- 6 域 + mcp + skills 全部统一为 `sandboxHandler(() => effect)` 形态；conversations 等域 ~25 处 `async () => runMain(...)` 样板收敛
- **修复**：这些域的错误从「runMain throw typed error（renderer fallback Unknown）」变为「`{kind, message}` JSON 正确反解码」

### D3 — 候选 1：`lib/child-process.ts` spawn 生命周期原语

`src/main/lib/child-process.ts`（新文件），3 原语：

| 原语                          | 语义                                                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `spawnChild(cmd, args, opts)` | `Effect.acquireRelease` 持有子进程（stdio pipe），release = fire-and-forget kill                                                       |
| `collectOutput(child, ref)`   | 累积 stdout/stderr 到 Ref（timeout 时可读部分输出），等待 close/error 后 resolve（含 exitCode / signal / error）；interrupt 时移除监听 |
| `killChild(child, mode)`      | `"fire-and-forget"`：立即信号（Windows taskkill /T /F 树杀，POSIX SIGTERM）；`"graceful"`：SIGTERM → 等 exit → 5s SIGKILL fallback     |

**各域保留自己的结果契约**（不统一 ExecuteResult）：

- `run-command/exec.ts`：`RunCommandResult` 4 变体 + SAFE_ENV_VARS 白名单 + 1MiB truncate + durationMs + partialOutput（`Effect.scoped` 包裹）
- `automations/executor.ts`：`ExecutionOutcome`；`executeScriptAction` 从 `runMain(listWorkspaces()).then` 链改为**直接 yield\***（SqliteClient context 由 mainRuntime 提供）；spawn 复用原语
- `mcp-stdio-transport.ts`：`kill()` 换 `killChild(child, "graceful")`（**只统一 kill，spawn 不动**——D2 范围缩减的边界保持）

### D4 — 候选 2：file-sandbox Effect 化

`src/main/file-sandbox.ts`：`async fn throw {kind}` → `Effect<A, SandboxError>`（`AppBackendError.NotFound | SandboxViolation | Unknown`）；ENOENT → `NotFound`（带 path）、越界 → `SandboxViolation`（workspaceLabel 传 root）；原子写（tmp + rename + onError cleanup）保留。`file-ops/ipc.ts`：handler 改 Effect 组合（getWorkspaceById 直接 yield\*）+ searchFiles/walkDir 从 async fs 改 `Effect.tryPromise`。

### D5 — 候选 3：mock-server 残留收敛

- `request-parser.ts readJsonBody`：`new Promise` 包 stream → `Effect.async`（data/end/error → resume，interrupt cleanup）
- `http-handler.ts`：`.then/.catch` 链 → `Effect.map + catchAll`（400 响应在 catchAll）；handleRequest 保持 void（node http handler 形状），`Effect.runFork` 执行
- 错误保持 HTTP 语义（本地判别，不跨 IPC——**不引入 AppBackendError**）

### D6 — 候选 4：MCP 全重设计（revisit D6/D3）

- `mcp-host.ts`：`McpStdioServer class` → **`startMcpHost(config, spawnFn?)` 工厂**，返回 `Effect<McpHost, never>`。McpHost 接口：`getConfig/getStatus/listTools/callTool(Effect)/onStatusChange/stop(Effect)`。spawn + handshake 收进 Effect（handshake 阻塞至完成，保持原 start() 等待语义）；错误映射 status（spawn_failed / protocol_error + kill）
- `mcp-manager.ts`：`McpManager class` → **`createMcpManager()` 工厂**（模块单例 `mcpManager`）。方法返回 Effect；`startAll` 保留 tool name 冲突检测（D3 语义）；`restart/setEnabled/stopAll` 显式 `host.stop()` 管理
- `mcp-ipc.ts`：Effect 方法经 `sandboxHandler` 桥
- `index.ts` boot：`new McpManager()` + tryPromise → `mcpManager.startAll()` + `addFinalizer(mcpManager.stopAll)`

**实现偏差（记录）**：`startMcpHost` 未用 `acquireRelease`——host 需**跨 IPC 调用存活**（restart/setEnabled 由 renderer 触发），Scope 生命周期与长活 host 冲突；采用**显式 stop()** 模式（与 StdioTransport class 语义一致）。ADR-0041 D3 的 transport 外壳保持。

### D7 — 候选 5：automations scheduler 全重设计

`AutomationScheduler class singleton` → **`createAutomationScheduler()` 工厂** + 模块单例 `automationScheduler`：

- per-rule FIFO 队列：`Queue.unbounded<TriggerKind>` + 每 rule 一个 worker fiber（`Queue.take → executeRule` 循环）
- 调度循环：`Effect.sleep(delay) + forkDaemon`（fiber 集合统一管理，`stop()` 时 interruptAll）
- **关键实现发现**：`Effect.fork` 的 fiber 继承调用方 Scope——`Effect.provide` 的 effect 完成时 scope 关闭 → **worker 被中断**（最小复现验证）；改用 **`Effect.forkDaemon`**（脱离 scope，手动 interrupt 管理，符合 R1 检查点）
- `start/stop/runNow` 返回 Effect；`service.ts` 从 `Effect.promise(scheduler.runNow())` 桥改为直接 yield\*；`index.ts` boot `yield* automationScheduler.start()` + `addFinalizer(stop)`

### D8 — 候选 6a：webfetch Effect 化

- `ssrf.ts assertSafeUrl`：`Effect<A, SsrfError>`（`dns.lookup` 走 `Effect.tryPromise`）；`isBlockedIp` 恢复原版 IPv6 算法（expandV6 + `::ffff:` 剥离 + garbage throw）——重写时曾引入 `::` 压缩展开 bug，测试暴露后恢复原算法
- `handler.ts fetchSafe`：`Effect<FetchResult, FetchError>`（fetch + 超时/重定向/大小限制错误分类）
- `ipc.ts`：sandboxHandler 桥

### D9 — 候选 6b：system / skills ipc 收尾

- `system/ipc.ts`：同步调用（setLoginItem / notify）`Effect.sync` 包裹；Promise API（openExternal / dynamic import electron-log）`Effect.tryPromise + catchAll → succeed(undefined/null)`（不抛错保持原语义）
- `skills/ipc.ts`：`sandboxHandler(() => Effect.promise(() => listSkills()))` 桥；skillsLoad 的 name 校验 → `Effect.fail(AppBackendError.InvalidConfig)`
- 同步无 Promise 模块（config-service / logger / cancel-map）**不转**（无 Promise 可转，D6 对 config-service 的理由仍成立）

### D10 — 测试策略：@effect/vitest

- main 侧新增/改写测试统一 `it.effect` / `it.live`（@effect/vitest）
- **TestClock 陷阱**：`it.effect` 提供 TestClock（虚拟时钟）——`Effect.timeout` 依赖 Clock service，虚拟时钟不前进导致挂起——timeout 相关用例用 **`it.live`**（真实时钟）
- **SqliteClient mock 模式**（sandboxHandler → runtime → db/mod 链）：`vi.mock("@effect/sql-sqlite-node/SqliteClient")` 返回 `Context.GenericTag("FakeSqliteClient")` + `Layer.succeed(fake, { unsafe })`（`layer: () => L.succeed(...)`）；测试用 `Effect.provide(eff, Layer.succeed(SqliteClient, {...} as never))`——`as never` 沿用 mcp-manager.test 既有先例（mock 值不满足真实类型）
- 测试文件适配：sandbox-handler / settings / webfetch / system / exec / confirm / executor / ssrf / handler / file-sandbox / scheduler（行为级重写）/ mcp-host / mcp-manager / service

## Considered Options（高层）

| 选项                                   | 描述                             | 选 / 不选                                                                                    |
| -------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------- |
| 维持 反候选                | webfetch / IPC adapter 不转      | 不选 — 用户拍板全转；sandboxHandler 改造使 IPC 层统一成为必然                                |
| 错误类复制到 main（裸名）              | 8 个 class 与 renderer 同名      | 不选 — namespace 包裹避免同名混淆 + 消灭 `Database as DatabaseError` 重命名                  |
| mcp transport 完全纳入 spawn 模块      | spawn 也统一                     | 不选 — 边界保持；transport 需要持有流（stdin/stdout 暴露），与输出收集器需求不同 |
| scheduler 保留 class 外壳              | 只内部 Effect 化                 | 不选 — 用户拍板全重设计；Queue + fiber 是 FIFO 队列的结构化并发表达                          |
| MCP 保留 class + acquireRelease 内部化 | D6 先例（jsonrpc 内部 Fiber 化） | 不选 — 用户拍板全重设计（revisit ADR-0041）；host 生命周期与 Scope 冲突 → 显式 stop 模式     |

## Consequences

### 正面

- **错误单一权威**：main 侧 `AppBackendError` namespace（8 成员）+ renderer `AppError`（10 成员）物理分离，`_tag` 序列化单一来源；`file-sandbox` 局部联合 / `HandshakeError` / `{kind}` 手写对象全部消灭
- **IPC 错误契约修复**：6 域错误从 fallback-Unknown 变为正确反解码；SandboxViolation 跨 IPC 不再失败
- **spawn 样板收敛**：3 处 `new Promise + spawn` → lib/child-process 3 原语；kill 语义统一（树杀 / SIGKILL fallback）
- **sandboxHandler 统一边界**：~25 处 `async () => runMain()` 样板收敛为 `sandboxHandler(() => effect)`；同步模块 `Effect.sync`
- **MCP / scheduler 深模块化**：class singleton → 纯工厂 + Effect（与 createAgentRuntime 精神一致）；scheduler FIFO = Queue + fiber 结构化并发；host 生命周期显式 stop
- **locality**：automations 域 3 个方向的 Promise 桥（runPromise 解包 / Promise 桥回包）收敛为单向 Effect 通道
- **测试**：@effect/vitest 统一；SqliteClient mock 模式可复用；行为级测试替代内部结构断言

### 负面 / 代价

- **forkDaemon 语义**：scheduler 的 worker/timer 是 daemon fiber——必须在 stop() 统一 interrupt，遗漏会泄漏 fiber
- **MCP 显式 stop 偏离 acquireRelease**：host 生命周期依赖 manager 纪律（startAll/stopAll/restart 正确配对），无 Scope 自动清理兜底
- **`as never` 测试 hack**：SqliteClient mock 的 value 类型不满足真实类型——测试内使用（项目 mcp-manager.test 既有先例）
- **行为微调**：webfetch `openExternal` 失败从 throw 变为 succeed(undefined)（原语义为 Electron 返回 reject）；settings subAgents delete/setEnabled 参数修复（pre-existing bug 修正）
- **重写风险**：scheduler / mcp 测试从结构断言（`scheduler["timers"]`）改为行为断言，覆盖等价

### 不变

- IPC channel 名 / 参数类型（renderer 零改动——除错误反解码修复）
- `{kind, message}` 序列化契约（sandbox-handler throw JSON 路径）
- DB schema / migrations / `@effect/sql-sqlite-node` 层
- `mcp-stdio-transport.ts` spawn / class 外壳（仅 kill 换原语）
- config-service / logger / cancel-map 同步模块

## Rollout

**单分支** `refactor/main-promise-effect-migration` 连续提交（用户拍板），顺序：错误统一 → sandboxHandler → 候选 1-6。

验证门禁（全部通过）：

- `vp run typecheck`（node + web）→ exit 0
- `vp run test` → 191 files / 1996 tests 通过（5 skipped 为既有）
- `vp run lint` → 无新违规（44 个 pre-existing 不在改动文件）

## References

-  /  /  /
- `src/renderer/src/shared/lib/errors.ts` / `decode-app-error.ts` — renderer 错误体系
- `src/main/lib/errors.ts` / `sandbox-handler.ts` / `child-process.ts` — 本次新增核心模块
- AGENTS.md — 精准修改 / 简单优先
