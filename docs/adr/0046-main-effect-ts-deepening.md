# 0046 — src/main Effect-TS 深化:5 候选 / 5 独立 PR / platform-node 解禁 main

- **Status**: accepted
- **Date**: 2026-08-02
- **Scope**: `src/main/`(jsonrpc / mcp / db / mock-server / index boot)+ 构建护栏(oxlint)
- **Supersedes**: 无 — 对 ADR-0041 D6 / D8 做**边界澄清**(不推翻,见 D1 / D2)
- **Related**:
  - [ADR-0003](./0003-effect-ts-logic-layer.md) — Effect-TS 逻辑层;`platform-node` 禁令仅 renderer,本 ADR 首次在 main 进程引入 Effect 运行时原语(Scope / Fiber / Layer)
  - [ADR-0017](./0017-queue-based-runtime.md) — Queue-based Runtime(renderer 侧 Fiber/Queue 先例)
  - [ADR-0024](./0024-electron-shell-migration.md) — Electron 壳(main = Node 生态,Node 工具可直接使用)
  - [ADR-0032](./0032-mcp-client-stdio.md) — MCP Client 决策基线
  - [ADR-0039](./0039-main-ipc-domain-split.md) — main IPC 域拆分(IpcDeps / state locality / sandboxHandler)
  - [ADR-0041](./0041-mcp-module-decomposition.md) — MCP 模块拆分(class-based manager 保留;StdioTransport deep module)

## Context

### 评审过程

`/improve-codebase-architecture` 扫描 `src/main/`(86 files / ~2888 prod LOC / 37 test files),产出 5 个深化候选 + 5 个反候选。随后 4 路并行外部调研(librarian + npm registry + unpkg 源码实证)核实事实,用户经 `/grilling` 决策 4 项(版本选型 / 依赖引入 / 实施顺序 / PR 拆分),本 ADR 锁定全部结论。

### Effect 在 main 的现状(8 文件,全部「边界调用」范式)

| 文件 | 用法 |
| --- | --- |
| `features/settings/schemas.ts` / `sanitize.ts` | `effect/Schema` 校验 |
| `features/mcp/mcp-config.ts` | `Effect.fn` 包文件 IO + typed `InvalidConfig` |
| `features/mcp/mcp-manager.ts` | `Effect.runPromiseExit` 调 mcp-config 后**立即解包** — 分裂人格 |
| `features/skills/lib/skill-loader*.ts` / `skills-host.ts` | `Effect.runPromise` 边界调用 |

共同点:**Effect 只当带类型的 try/catch 用**。无 Scope、无 Fiber、无 Layer 组合 — 资源管理与结构化并发能力完全未用。

### 调研事实修正(显式记录,防未来重复犯错)

| 评审中假设 | 调研后事实 | 证据 |
| --- | --- | --- |
| t3code PR #2546 有 MCP client Effect 化可参考 | **错**。该 PR 是 Electron 桌面 lifecycle(`ElectronApp` / `ElectronDialog` 等),与 MCP 无关 | PR 描述原文 |
| `@effect/rpc` 可替代手写 jsonrpc | **错**。仅 HTTP / WebSocket / Worker transport,**无 stdio** | 包源码 |
| `@effect/sql-sqlite-node` 用 `node:sqlite` 内置驱动 | **半错**。v4 beta 线(4.0.0-beta.x)用 `node:sqlite`;**v3 线(0.x)用 better-sqlite3** — 与项目 `effect ^3.21.4` 兼容的正是 v3 线 | npm registry `0.52.0` deps: `better-sqlite3 ^12.6.2` |
| ADR-0003 禁止 platform-node 全项目 | **错**。禁令仅 renderer(「webview 没有 Node」);main 是 Node 进程,不在禁令范围 | ADR-0003 line 36 |

### 5 个候选(deletion test 通过:删除旧结构,复杂度**收敛**而非搬家)

1. **`jsonrpc.ts`**(256L)— `Map<id, PendingRequest>` + `setTimeout` 手写超时机器,4 处重复错误驱逐(L96-109 / L153-156 / L232-236 / L244-249),`null as unknown as Promise<never>` 类型 hack
2. **`features/mcp/`** — mcp-config `Effect.fn` + mcp-manager `runPromiseExit` 解包 = 分裂人格;`mcp-stdio-transport.ts` 裸 `setTimeout` SIGKILL fallback
3. **`db/mod.ts`**(77L)— module singleton;`closeDatabase()` 导出但**从未被调用**,异常退出留 WAL shard;ADR-0039 Add-5.1 记录的 `getOrInitDatabase` 冗余
4. **`features/mock-server/`** — `index.ts` listen 失败后 `server` 已赋值,`stopMockServer()` 走 null 路径;`qa-loader.ts` 3 段 try/catch 回退 + module 全局 cache
5. **`index.ts`**(152L)— `whenReady` 内 6 个独立 async 各自 `.catch(console.error)`;`before-quit` 只调 `mcpManager.stopAll()`,`stopMockServer` / `closeDatabase` 从不执行

### 反候选(deletion test 不通过,Effect = ceremony)

`features/webfetch/handler.ts` / `ssrf.ts`、`config-service.ts`、`skills-host.ts`、全部 6 域 IPC handlers — 理由见 D6。

## Decision

### D1 — PR-1:`jsonrpc.ts` 内部 Fiber 化(256L → 263L,结构收益兑现)

**内部实现替换,不产生新 seam,不拆子模块:**

- `request()`:`Effect.gen` + `Deferred.unsafeMake` + `Effect.timeout(timeoutMs)` — 超时即 fiber 中断,错误类型 `TimeoutException | JsonRpcProtocolError`
- `close()`:`#failAllPending(err)`(对全部 pending Deferred 做 `Exit.fail(err)`)— 统一取消路径,删 4 处重复错误驱逐代码。**实现偏差(有意,经对抗式复核确认,2026-08-02)**:不 interrupt pending request fibers —— 若 interrupt,`Fiber.await` 会以 interrupt cause reject(`Cause.squash(Interrupt)` ≈ undefined),破坏 `JsonRpcProtocolError` 错误契约(jsonrpc.test.ts L159-164);仅 interrupt reader fiber(触发 `Effect.async` cleanup 移除 stream listeners)
- stdin chunk 读取:`Effect.async`(**非** `tryPromise` — 见 Risks R2)
- public API 保持 Promise 签名(`JsonRpcConnection` class + `request` / `close`)— 内部 private runtime 跑 Effect,caller 零改动

**行数说明**:D1 原估 ~100L 为乐观估算,实际 263L(基文件 256L)。结构收益已验证:4 处重复错误驱逐 → 1 处 `#failAllPending`、手写 `setTimeout` 超时机器删除、`null as unknown as Promise<never>` hack 删除、Promise executor-capture 删除;净增行数来自 Effect 基础设施(Deferred / Fiber / Effect.async reader / Runtime)。不追执行数压缩(精准修改优先)。

**与 ADR-0041 D8 的关系(澄清,非推翻)**:D8 锁的是「jsonrpc 不拆 seam / 不拆模块」(1 caller = 假 seam),本 PR 遵守 — jsonrpc 仍是 1 个模块、1 个 caller(`McpStdioServer` 经 `StdioTransport` 间接使用)。D8 的「不动」指**结构**,不指**实现范式**;本 PR 不动结构,只换内部实现。

**拒绝**:

- A. 引入 `@effect/rpc`:无 stdio transport,见 Context 修正表
- C. 拆 jsonrpc 子模块:违反 ADR-0041 D8

### D2 — PR-2:MCP 生命周期 Effect 化(runtime + 分裂人格消除)

**范围(两件套;transport 部分见「范围缩减」):**

1. ~~`mcp-stdio-transport.ts` 内部:spawn / kill → `ChildProcessSpawner`~~ **范围缩减(经对抗式复核,2026-08-03)**:`ChildProcessSpawner` 仅存在于 `@effect/platform-node` **V4 线**(V3 最新 0.107.0 及全部 V3 版本无 Spawner API,包源码实证)。项目锁定 effect ^3.21.4、禁升 v4,故 **transport 保留 node:child_process 实现,本 PR 不改**;SIGTERM→SIGKILL 升级(`forceKillAfter`)与 process group kill 留待 effect v4 迁移专项 ADR。`StdioTransport` class 与 ADR-0041 D3 外壳保持原样
2. **分裂人格消除**:mcp-manager 内 `Effect.runPromiseExit(readMcpConfig())` 调用点(3 处)统一改经 `src/main/runtime.ts` 的 `mainRuntime.runPromise` 执行;`Exit` 手工解包删除。**事实修正**:`Runtime.runPromise` 失败时 reject **`FiberFailure` 包装**而非 typed error(effect 源码 `throw fiberFailure(cause)` 实证),故 typed error 在 catch 处**重建**(`new InvalidConfig({ field, message: String(e) })`,与改造前 L188 同一模式),错误契约不变。`McpManager` class + 9 public methods + mutable `Map` 状态不变(ADR-0041 D6 保留)
3. **新增 `src/main/runtime.ts`**:`export const mainRuntime = ManagedRuntime.make(MainLive)` — main 进程唯一 Effect 边界。本 PR 建空壳(`MainLive = Layer.empty`),D3 挂 `DbLive`,D5 收编 boot。module singleton 形态是 Effect 官方 edge pattern(参照 `NodeRuntime.runMain`),与 D3 消除的 db 资源 singleton 性质不同(那是**资源**,这是**运行时**)

**新增依赖**:~~`@effect/platform-node`~~ **未引入**(transport 范围缩减后无使用方;已装 `@effect/platform-node@0.107.0` / `@effect/platform@0.96.1` 随后移除)。

**与 ADR-0041 D6 的关系(澄清,非推翻)**:D6 拒绝的是「McpManager 完全 functional 化」(mutable Map 状态改用闭包表达),本 PR 不做 — manager 结构原样。本 PR 做的是 transport **内部**实现替换 + 错误通道打通,两个不同轴。

**拒绝**:

- A. 自包 `acquireRelease` 包 `node:child_process`(~30L):重造 `ChildProcessSpawner` 已内建的 SIGTERM→SIGKILL 升级 + process group kill + exit `Deferred`;且失去平台包后续维护 ~~(该拒绝基于 ChildProcessSpawner 存在于 V3 线的假设,已随范围缩减失效;v3 线 transport 现状即 node:child_process 实现,升级动作整体推迟到 v4 迁移 ADR)~~
- C. `McpManager` 全 Effect 化(`startAll` 返回 `Effect<void, McpBootError, Scope>`):违反 ADR-0041 D6;manager 是协调器不是资源持有者,收益边际

### D3 — PR-3:`db/mod.ts` → `@effect/sql-sqlite-node@0.52.0`

**版本锁定(npm registry 实证):**

| 版本 | peer effect | 驱动 | 结论 |
| --- | --- | --- | --- |
| `0.52.0` | `^3.21.0` | better-sqlite3 `^12.6.2` | **选用** — 与项目 `effect ^3.21.4` / `better-sqlite3 ^12.11.1` 兼容 |
| `0.53.0` | `^3.22.0` | better-sqlite3 | 不选(需 effect 升级) |
| `4.0.0-beta.x` | v4 | `node:sqlite` | 不选(v4 未发布 + 换驱动) |

**新依赖**:`@effect/sql-sqlite-node@0.52.0`(**锁版本,不升 0.53**)+ `@effect/sql`(v3 匹配,pnpm 解析)+ `@effect/experimental`(`Reactivity` 传递依赖)。

**结构:**

- `db/mod.ts`:删 `_db` singleton / `initDatabase` / `getOrInitDatabase` / `closeDatabase` — 顺手修 ADR-0039 Add-5.1 冗余 + 补「`closeDatabase` 从未被调用」缺陷
- `SqliteLive = SqliteClient.layer({ filename: dbPath() })`:WAL 由包内建开启;`Scope` finalizer 调 `db.close()` — better-sqlite3 关闭时 SQLite 对最后连接自动 checkpoint 并删 wal 文件,**WAL 泄漏结构性修复**
- migrations:`MigrationsLive = Layer.effectDiscard(读 db/migrations/*.sql + sql.unsafe 执行)`(`Layer.provide(SqliteLive)`);现有 `.sql` 文件与 `_migrations` 表格式**不变**
- `MainLive` 挂 `DbLive = Layer.mergeAll(SqliteLive, MigrationsLive)`(经 D2 的 `runtime.ts`)
- data access 函数(`listConversations` / `appendMessage` 等)收进 `features/<domain>/data.ts`,返回 `Effect<A, AppError, SqlClient>`;内部 `SqlError` → `AppError` `Database` 变体映射 — **IPC 错误契约(`{kind, message}` JSON)不变,renderer 零改动**
- 6 域 register 函数 deps 中 `db: DB` 移除(ADR-0039 D2「只声明所需」的自然结果);handler 体内 `db.prepare(sql).all()` → `mainRuntime.runPromise(dataAccessEffect)`
- SQL 字符串第一版**原样保留**(经 `sql.unsafe`),DSL / `@effect/sql` `Model` 留后续 — 精准修改,SQL 语义零变化优先

**测试 seam**:`SqliteClient.layer({ filename: ":memory:" })` 注入,替代 `vi.mock` 模块 stub。

**拒绝**:

- A. 自包 `Layer.effect` 包 better-sqlite3(~50L):重造 sql-sqlite-node 已解决的 prepared-statement 缓存 / 事务 acquirer / typed `SqlError`;且自包 Layer 仍是「边界调用」范式,无 DSL 收益
- C. 迁 `node:sqlite` + v4 beta:effect v4 未发布,且换驱动需要全量 e2e 回归
- D. handlers 保持 sync 包一层 Promise 兼容壳:假深化,边界只是搬家

### D4 — PR-4:mock-server Resource 化 + qa-loader `firstSuccessOf`

- `qa-loader.ts`:3 段 try/catch 回退(env → `qa.dev.json` → 空表)→ `Effect.firstSuccessOf([...])`(全失败返回最后错误;fallback 空表 `succeed` 保证总成功);module cache → `Ref<QaEntry[]>`
- `features/mock-server/index.ts`:`server: Server | null` → `Effect.acquireRelease` + `Effect.callback` 桥接 `server.listen`(callback API);listen 失败 = acquire 失败,无「null server 上 stop」路径
- `resetQaLoaderForTest` 保留(test-only export)

**拒绝**:

- C. mock-server 挂 `@effect/platform-node` `NodeHttpServer`:dev-only 组件,为 50L dev 工具引入完整 HTTP server 抽象不值

### D5 — PR-5:boot 统一 Scope(`index.ts`)

- `whenReady` 内 6 操作(`registerIpcHandlers` / `registerSkillHandlers` / `loadQaTable` / `startMockServer` / `ensurePreinstalledSkills` / `mcpManager.startAll`)收进单 `Effect.scoped` 组合
- `before-quit`:一次 `Scope.close(mainScope, Exit.void)` — mock-server(DB 已在 D3 由 layer finalizer 覆盖)等资源统一逆序释放
- 零散 `.catch(console.error)` 删除 — 失败经 `Cause` 统一进 logger(per ADR-0018)
- 依赖 D2 / D3 / D4 落地(它们提供可挂进 Scope 的资源形态),故排最后

### D6 — 反候选锁定(防止未来重复建议)

以下模块**不** Effect 化,记录理由:

| 模块 | 理由 |
| --- | --- |
| `features/webfetch/handler.ts`(72L) | 直线 async/await + 自定义 error class,无并发分支无资源管理 |
| `features/webfetch/ssrf.ts`(112L) | 纯 IP CIDR 逻辑,零 async |
| `config-service.ts`(78L) | env 解析,无 retry/timeout/资源 |
| `skills-host.ts`(78L) | 已用 `Effect.runPromise` 边界调用,运行良好 |
| 全部 6 域 IPC handlers(除 D3 改 data access 外) | 薄 `ipcMain.handle` 包装,ADR-0039 已优化;handler 本体无业务复杂度 |

### D7 — oxlint import 边界(ADR-0003 禁令机器化)

oxlint `no-restricted-imports` 规则:

- `src/renderer/**` + `src/preload/**`:禁 `@effect/platform-node` / `@effect/sql` / `@effect/sql-sqlite-node` / `better-sqlite3`
- `src/main/**`:不限制

**理由**:ADR-0003 禁令此前靠自觉,D2 / D3 引入 main-only 包后需机器护栏防 renderer 误引(bundle 即崩)。

### D8 — 顺序与 PR 拆分

顺序:**#1 → #2 → #3 → #4 → #5**(用户拍板 #1 提前)。

**5 个独立 PR**(用户拍板,拒绝 mega-PR):

| PR | 分支 | 内容 | 依赖 |
| --- | --- | --- | --- |
| PR-1 | `refactor/jsonrpc-effect-fiber` | D1 | 无 |
| PR-2 | `refactor/mcp-effect-transport` | D2 + D7(oxlint)+ `runtime.ts` 空壳 | 无 |
| PR-3 | `refactor/db-sql-sqlite-node` | D3(`MainLive` 挂 `DbLive`) | PR-2(`runtime.ts`) |
| PR-4 | `refactor/mock-server-effect` | D4 | PR-2(`runtime.ts`) |
| PR-5 | `refactor/main-boot-scope` | D5 | PR-2 / 3 / 4 |

**拒绝**:

- B. 1 个 mega-PR:~600L diff,review 不可行,违反精准修改
- C. #5 提前:无可挂资源,空 Scope 无意义

## Considered Options(高层)

| 选项 | 描述 | 选 / 不选 |
| --- | --- | --- |
| 全不动 | 维持边界调用范式 | 不选 — 5 处真实 friction(WAL 泄漏 / SIGKILL 裸定时器 / 4 处重复驱逐 / boot 资源不释放 / 分裂人格)持续 |
| 全 Effect 化(含 D6 反候选) | 为用而用 | 不选 — ceremony,违反简单优先 |
| 迁 `@effect/rpc` | 替换手写 jsonrpc | 不选 — 无 stdio transport |
| 迁 `node:sqlite` + sql-sqlite-node v4 | 拿 v4 新 API | 不选 — effect v4 未发布 + 换驱动 |

## Consequences

### 正面

- **WAL 泄漏结构修复**(D3):`db.close()` 从「导出但从未调用」变为 Scope finalizer 必然执行;SQLite last-connection-close 自动 checkpoint + 删 wal
- **SIGKILL fallback 标准化**(D2):`ChildProcessSpawner` 内建 SIGTERM→`forceKillAfter` 升级,替代裸 `setTimeout`;ADR-0041 修的 stop race 语义由平台包承接
- **分裂人格消除**(D2):typed error(`InvalidConfig`)沿 Effect 通道到边界,不再 `runPromiseExit` 立即解包
- **jsonrpc 减 ~60%**(D1):256L → ~100L;4 处重复错误驱逐 → 1 处 `Fiber.interruptAll`
- **boot 资源全释放**(D5):`stopMockServer` / DB close 首次真正执行;6 个 `.catch` 各自为政 → 1 个 `Cause` 统一日志
- **测试 seam 升级**(D3)`:memory:` Layer 注入替代 `vi.mock(better-sqlite3)`;(D2)`ChildProcessSpawner` 可注入 fake
- **ADR-0039 Add-5.1 顺手修复**(D3):`getOrInitDatabase` 冗余删除
- **CONTEXT.md 新增词条**(D2 落地时):「Main Runtime(主进程运行时)」— `src/main/runtime.ts` 的 `mainRuntime`,main 进程唯一 Effect 边界,`ManagedRuntime.make(MainLive)` 产物;所有 main 内 Effect 经它执行,禁 second runtime

### 负面 / 代价

- **新依赖 ×4**:`@effect/platform-node` + `@effect/sql` + `@effect/sql-sqlite-node`(锁 0.52.0)+ `@effect/experimental`;main bundle 体积上升(不进 renderer,D7 护栏)
- **v3 线锁定风险**:sql-sqlite-node `0.52.0` 是 v3 维护线;未来 effect v4 升级时该包换驱动(`node:sqlite`),需专项迁移 ADR
- **学习成本**:main 进程代码从纯 async/await 变为 Effect 范式,新读者需懂 Scope / Fiber / Layer 三概念
- **PR-3 diff 最大**(~200L):6 域 data access 迁移虽机械但面广
- **jsonrpc 范式混存**(D1):class 外壳 + Promise public API + 内部 Effect runtime — 与 ADR-0041 class 惯例一致,但读者需理解双层结构

### 不变

- ADR-0003 renderer 禁令(D7 只是机器化,语义不变)
- ADR-0041 D3 `StdioTransport` deep module 外壳 / D6 `McpManager` class 结构 / D8 jsonrpc 不拆模块 / D9 公共 API
- ADR-0039 IPC 域拆分 + IpcDeps + `sandboxHandler` 协议(throw-JSON 路径不变)
- IPC 错误契约(`{kind, message}` JSON)+ channel 名 + 参数类型 — **renderer 零改动**
- DB schema / `migrations/*.sql` / `_migrations` 表格式
- MCP stdio-only(ADR-0032 D2)+ `mcp_<server>_<tool>` 命名(ADR-0032 D3)

## Risks(Effect 特有陷阱,实施时必须处理)

- **R1 `forkScoped` 未 join 静默吞错**(D1):所有 fork 的 fiber 必须 join 或加入统一 handle 集中 interrupt;code review 检查点
- **R2 `tryPromise` AbortSignal 不取消底层 Promise**(D1):stdin 流读取必须 `Effect.async` + 回调内自注册 cleanup;不能用 `tryPromise` 包 stream `data` 监听
- **R3 `raceAll` 输家 uninterruptible 中断**(D1):`close()` 路径不用 race,用 `Fiber.interruptAll` 显式中断
- **R4 `SqlClient` 单连接串行**(D3):包内 `semaphore(1)` 串行化所有查询 — 与 better-sqlite3 同步单连接现状语义一致,无回归;但未来若需并发读需重评
- **R5 platform-node 版本漂移**(D2):锁 v3 线;依赖升级时检查 peer `effect` 约束

## Rollout

每 PR verify gates:

- `vp run typecheck` → exit 0
- `npm run test:main` → 全过(不低于 baseline)
- `vp run test` → 全过(renderer 零改动验证)
- `vp run lint` → 无新违规(D7 oxlint 规则 PR-2 起生效)
- 无 `as any` / `@ts-ignore` / `@ts-expect-error`
- `vp run e2e`(PR-3 / PR-5 必跑,DB 与 boot 路径)

## References

- [ADR-0003](./0003-effect-ts-logic-layer.md) / [ADR-0017](./0017-queue-based-runtime.md) / [ADR-0024](./0024-electron-shell-migration.md) / [ADR-0032](./0032-mcp-client-stdio.md) / [ADR-0039](./0039-main-ipc-domain-split.md) / [ADR-0041](./0041-mcp-module-decomposition.md)
- `@effect/sql-sqlite-node@0.52.0` 源码实证(v3 线,better-sqlite3 驱动):unpkg / npm registry
- `NodeChildProcessSpawner`(SIGTERM→SIGKILL 内建):`@effect/platform-node`
- `electron-effect-rpc`(joaoeira):信封协议参考,本 ADR 不引入
- AGENTS.md — atomic commit / 精准修改 / 简单优先
