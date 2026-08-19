# 0059 — src/main Effect.fn 化(effectful function 命名 + locality 收口)

- **Status**: accepted
- **Date**: 2026-08-08
- **Scope**: `src/main/`(17 production 文件 · 111 处 `Effect.gen(function* () { ... })` 改造为 `Effect.fn("name")(...)`) · `src/main/features/skills/lib/skill-loader.ts`(隐式→显式改名,2 处) · `docs/adr/0059-effect-fn-modernization.md`(本文件)
- **Supersedes**: 无
- **Related**:
  -  — Effect-TS 逻辑层基础(本 ADR 是其在 main 进程的现代化延伸)
  -  — Queue-based Runtime(renderer 侧 Fiber / Queue 先例;本 ADR 不涉及 Fiber/Queue,仅命名层)
  -  — Electron 壳(main = Node 生态,Effect 在 main 进程已被 解禁)
  -  — IPC 域拆分(IpcDeps / state locality;本 ADR 不动 IPC handler 外壳,只动 handler 体内 effect 命名)
  - **母 ADR**:  — main 进程 Effect-TS 深化(5 PR 落地 Fiber / Scope / Layer / DbLive / boot scoped);本 ADR 是其**第 6 条现代化线**,目标**仅**是 effectful function 命名 + locality 收口,不重复 的范畴
  -  — MCP 模块拆分(McpManager class / StdioTransport deep module 不动)

## Context

### 评审过程

`/improve-codebase-architecture` 扫描 `src/main/`(17 production 文件 · 111 处 `Effect.gen(function* () { ... })` vs 3 文件 / 9 处已迁移到 `Effect.fn`),产出 7 个改造候选 + 7 个 commit 顺序建议 + Top recommendation 三波推进。用户经 `/grilling` 决策 6 项(命名约定 / PR 粒度 / 测试策略 / ADR 记录 / skill-loader 改名归属 / 长尾处理),本 ADR 锁定全部结论。

### 现状(已迁移 vs 未迁移)

| 模式                                              | 文件数 | 处数 | 风格                                                  |
| ------------------------------------------------- | ------ | ---- | ----------------------------------------------------- |
| `Effect.fn("name")(...)`(显式命名)                | 2      | 6    | mcp-config.ts · automations-config.ts                 |
| `Effect.fn(function* () {...})`(隐式命名,TS 推导) | 1      | 2    | skill-loader.ts(`scanSkillsDir` / `loadSkillContent`) |
| `Effect.gen(function* () { ... })`(未迁移)        | 17     | 111  | 散点分布,见 D8                                        |

### 调研事实修正(显式记录,防未来重复犯错)

| 评审中假设                                                                    | 调研后事实                                                                                                                        | 证据                                                                                 |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 用户说"`() => Effect.gen`"(箭头函数形式)                                      | **错**。`() => Effect.gen(...)` 在 src/main **不存在**(0 处)。所有未迁移用法是 `Effect.gen(function* () { ... })`(函数表达式形式) | explore scan:0 matches for `() => Effect.gen`;111 matches for `Effect.gen(function*` |
| `Effect.fn` 改造会破坏 `.pipe(Effect.catchAll/catchTag/mapError/tapError)` 链 | **错**。`Effect.fn(function* () {...})` 体内 yield\* 链完全兼容,只 wrap 外层                                                      | skill-loader.ts:65-116 / 123-149                                                     |
| skill-loader.ts 隐式命名需重构                                                | **无需重构**。隐式→显式只需把 `Effect.fn(function* (...))` 改为 `Effect.fn("name")(function* (...))`,不改函数体                   | 同上                                                                                 |
| `automations/service.ts` 已有测试覆盖                                         | **错**。9 处 `Effect.gen` 改造无 safety net,需先补 `service.test.ts`                                                              | explore scan + file search:no `service.test.ts`                                      |

### 7 个未迁移候选(deletion test 通过:删除 `Effect.gen`,tracing 名字收敛而非搬家)

| #   | 候选                                                                                      | 处数 | 测试覆盖 | 强度            |
| --- | ----------------------------------------------------------------------------------------- | ---- | -------- | --------------- |
| 1   | `lib/json-config.ts`(依赖图约束,被已迁移模块依赖)                                         | 3    | ✓        | Strong          |
| 2   | SQL data access cluster(conversations + workspaces + compaction + file-ops/data + db/mod) | 19   | 部分     | Strong          |
| 3   | `file-sandbox.ts`(平台错误收敛)                                                           | 4    | ✓        | Strong          |
| 4   | `automations/service.ts`(无测试)                                                          | 9    | ✗        | Worth exploring |
| 5   | `mcp-manager.ts`(工厂模式 + 复杂 .pipe 链)                                                | 3    | ✓        | Worth exploring |
| 6   | `file-ops/ipc.ts`(IPC seam 边界)                                                          | 4    | ✓        | Worth exploring |
| 7   | 长尾(`qa-loader` 3 + `scheduler` 1 + `index` 1 + `file-ops/data` 1)                       | 6    | 部分     | Speculative     |

### 摩擦识别

- **`db/mod.ts`**(L125)`Effect.gen(...).pipe(Effect.flatMap(() => Effect.void))` 链式 — wrap 需拆 pipe,改在 `Effect.fn` 内 yield\*,4 处中 1 处命中
- **`mcp-manager.ts`** `startAll`(L153-213,60+ 行)内部 `Effect.tryPromise(...).pipe(Effect.tapError(...), Effect.catchAll(...))` 三重链 — `startAll` 的 E 类型是 `never`(内部 swallow 所有错误),迁移必须保持
- **`file-sandbox.ts`** 4 处错误映射 `e._tag === "SystemError" && e.reason === "NotFound" ? NotFound(...) : Unknown(...)` 重复 — wrap 时不强求合并(简单优先),未来如需 locality 收口再说
- **`conversations/data.ts`** `searchMessagesSafe`(L333) `.pipe(Effect.catchAll(() => Effect.succeed([])))` 错误吞噬保持不变,只换外层 wrap

## Decision

### D1 — 全部统一显式命名(`Effect.fn("name")(...)`)

**拒绝**:隐式 `Effect.fn(function* () {...})`(skill-loader.ts 当前风格)

**理由**:

- **强制程序员为 effect 命名**,避免"我想不出名字就跳过"的妥协
- 跨文件 grep `Effect.fn("` 容易,迁移审计与 code review 可读
- Effect tracer / logger 输出形如 `"listConversations"`,可直接 `grep` 定位
- TS 推导依赖变量名,重构变量名时 effect 名跟着变(隐式的隐患)

**改名范围**:skill-loader.ts 的 `scanSkillsDir` / `loadSkillContent` 从 `Effect.fn(function* (...))` 改为 `Effect.fn("scanSkillsDir")(...)` / `Effect.fn("loadSkillContent")(...)`。**独立 commit,业务逻辑零变化**(精准修改)。

### D2 — 单分支 `feature/effect-fn-modernization` + 9 commits

**拒绝**:

- 1 个 mega-PR(~280L diff,review 不可行,违反 D8「5 个独立 PR」精神)
- N 个独立分支 + N 个独立 PR(本地上下文切换成本高,分支长期未合会产生冲突)

**理由**:

- 单分支开发连续,本地 rebase 容易
- 每个 commit 单独可 review(`git range-diff master..HEAD` 或拆 PR)
- 中间任意 commit 失败可单独 fix,无需整链回滚
- CI 在每个 commit 触发,早失败早修复

**commit 顺序**:

```
1.  docs: add effect-fn-modernization         ← 本 ADR
2.  chore(effect-fn): rename to explicit names in skill-loader.ts
3.  refactor(effect-fn): wrap lib/json-config.ts to Effect.fn("name")           ← 第一波
4.  refactor(effect-fn): wrap SQL data access cluster (5 files)                 ← 第二波
5.  refactor(effect-fn): wrap file-sandbox.ts                                   ← 第三波
6.  test(automations): add service.test.ts
7.  refactor(effect-fn): wrap automations/service.ts to Effect.fn
8.  refactor(effect-fn): wrap mcp-manager.ts factory methods
9.  chore(effect-fn): wrap long-tail (qa-loader + scheduler + index + file-ops/data)
```

### D3 — 第一波:`lib/json-config.ts`(依赖图闭合,~50L diff)

**理由**(从 7 个候选中第一个做):

- `mcp-config.ts` / `automations-config.ts` 已迁移到 `Effect.fn`,但它们依赖的 `readJsonConfig` / `writeJsonConfig` / `jsonConfigExists` 还是 `Effect.gen` → tracing 日志在 yield\* 处断名
- 三个函数都是同质模板(`Effect.gen(function*() { yield* FileSystem.FileSystem; yield* fs.X(...).pipe(Effect.catchAll/mapError); ... })`),改造是机械 wrap
- 已有完整测试(`lib/json-config.test.ts`,9 处 `Effect.gen`,覆盖所有错误路径)
- **阻塞项** —— 不做的话,后续任何 trace 优化在 json-config 边界都会断名

**改动**:

- `readJsonConfig = Effect.fn("readJsonConfig")(function* <T>(path, schema, defaultValue) {...})`
- `writeJsonConfig = Effect.fn("writeJsonConfig")(function* (path, value) {...})`
- `jsonConfigExists = Effect.fn("jsonConfigExists")(function* (path) {...})`
- 泛型 `<T>` 放在 `function*` 关键字后,保持与原签名一致
- 不动错误映射 / 不动 schema 校验逻辑(精准修改)

### D4 — 第二波:SQL data cluster(5 文件,23 处,~130L diff)

**覆盖文件**(合并 commit,因同质模板):

- `features/conversations/data.ts` — 11 处(`listConversations` / `getConversation` / `createConversation` / `archiveConversation` / `deleteConversation` / `renameConversation` / `listMessages` / `appendMessage` / `searchMessages` / `searchMessagesSafe` / `clearAllHistory`)
- `features/workspaces/data.ts` — 4 处
- `features/compaction/data.ts` — 2 处
- `features/file-ops/data.ts` — 1 处
- `db/mod.ts` — 2 处(其中 1 处需拆 `.pipe(Effect.flatMap)` 链)
- `features/file-ops/ipc.ts` — 4 处(IPC handler 体内 `Effect.gen`,handler 外壳不变)

**理由**:

- 11 个 conversations/data.ts 函数全部形如 `Effect.gen(function*() { yield* SqliteClient; yield* sql.unsafe(...).pipe(Effect.catchTag("SqlError", ...)); ... })` —— 同质模板批处理
- `conversations/data.test.ts` 已有覆盖(11 个函数都有 test),迁移是 test-driven wrap
- file-ops/ipc.ts 的 4 处迁移让 IPC 边界处的 effect 可命名,debug "renderer 报 IPC 错" 时 logger 能看到名字

**改动**(每个函数):

- `export function listConversations(...) { return Effect.gen(function* () {...}); }`
  → `export const listConversations = Effect.fn("listConversations")(function* (...) {...});`
- 签名从 `function name(): Effect.Effect<...>` 改为 `const name = Effect.fn("name")(function* (...): Effect.Effect<...> { ... })` —— return 类型标注可删(由 Effect.fn 推导),不强求
- `db/mod.ts:125` 的 `.pipe(Effect.flatMap(() => Effect.void))` 链改为在 `Effect.fn` 内 `yield* ... ; yield* Effect.void;` 或保持 pipe 但确认 `Effect.fn` 体外不再包 pipe

### D5 — 第三波(单点深改,4 commits)

**file-sandbox.ts**(commit #5,~50L diff):

- 4 个导出函数 `validatePathForWrite` / `validatePathInWorkspace` / `readFileInWorkspace` / `writeFileInWorkspace` 全 wrap
- 错误映射 `SystemError → NotFound/Unknown` 已在 `asAppError` helper(L86-90),不重复抽取
- `writeFileInWorkspace` 的 `Effect.tapError(() => fs.remove(tmp).pipe(Effect.ignore))` 链在 `Effect.fn` 内 yield\* 不变
- 与 PR-β 同模块,本 commit 是补完 wrap(ADR-0058 未把 wrap 进来)

**automations/service.ts**(commit #6 测试 + commit #7 迁移,先测后迁):

- commit #6:补 `features/automations/service.test.ts`(~100L)。用 `@effect/vitest` + mock FileSystem / Path layer,锁定现有 9 处 effect 的输入/输出/错误路径。**TDD:先写测试覆盖现有行为,再 wrap**
- commit #7:9 处 `Effect.gen` → `Effect.fn("stepName")(...)`,测试不变全过
- 不允许 commit #7 直接迁(无 safety net,违反 AGENTS.md 目标驱动)

**mcp-manager.ts**(commit #8,~40L diff):

- 工厂 `createMcpManager()` 闭包不变,mutable state(`servers` / `configs` / `started`)不动
- `startAll` / `restart` / `setEnabled` 三个 effect-returning methods 的 body wrap:`Effect.gen(function*() {...})` → `Effect.fn("startAll")(...)`
- `startAll` 的 E = `never` 必须保持(内部 `Effect.catchAll(() => Effect.void)` 兜底)
- `mcp-manager.test.ts` 已有覆盖(per explore scan),先确认 baseline,再 wrap

**长尾**(commit #9,~30L diff):

- `features/mock-server/qa-loader.ts`(3 处)
- `features/automations/scheduler.ts`(1 处)
- `index.ts`(1 处,boot sequence 内的 `Effect.gen(function*() { ... })` —— 已被 改造过 boot scoped,本 commit 仅 wrap 内层)
- `features/file-ops/data.ts`(1 处,如未在 commit #4 一起做)
- **跳过** `features/skills/skills-host.ts`(ADR-0046 D6 反候选,边界调用范式运行良好,迁移无收益)

### D6 — 反候选锁定(防止未来重复建议)

| 模块                                       | 理由                                                           |
| ------------------------------------------ | -------------------------------------------------------------- |
| `features/skills/skills-host.ts`(78L)      | 已锁,边界调用范式运行良好;本 ADR 也不迁            |
| `features/webfetch/handler.ts` / `ssrf.ts` | 反候选,本 ADR 不触及                               |
| `config-service.ts`                        | 反候选,纯 env 解析                                 |
| `runtime.ts` 本身                          | `ManagedRuntime.make(MainLive)` 不是 `Effect.gen`,无 wrap 必要 |
| `ipc.ts`(注册层)                           | 注册层无 `Effect.gen` 业务,薄 wrapper                          |

### D7 — 命名规范约束(防止回归)

oxlint `no-restricted-syntax`(可选,本 commit 不强制):

- 禁止 `src/main/**` 内出现 `Effect.gen(function* () {` 用于 `export const` / `export function` 顶层 effect —— 必须先 wrap `Effect.fn`
- `Effect.gen(function* () {` 仍允许用于**函数体内**的子表达式(例如 mcp-manager 工厂内部 helper)

**理由**:防止未来新代码再走未命名 `Effect.gen`,把这次改造的收益巩固下来。

**实施**:本次改造**不引入** oxlint 规则(避免在 9 commits 里再插一个 PR),由 + code review 守护。如未来 `src/main/**` 重新出现 `Effect.gen(function* () {`,在 code review 直接 block。

### D8 — 实施顺序与文件清单(预 commit 锁定)

按 D2 commit 顺序,逐 commit 列文件清单:

**commit #1**(本文件):

```
docs/adr/0059-effect-fn-modernization.md
```

**commit #2**:

```
src/main/features/skills/lib/skill-loader.ts
  - L65: Effect.fn(function* ...) → Effect.fn("scanSkillsDir")(function* ...)
  - L123: Effect.fn(function* ...) → Effect.fn("loadSkillContent")(function* ...)
```

**commit #3**(第一波):

```
src/main/lib/json-config.ts
  - L81 readJsonConfig
  - L136 writeJsonConfig
  - L164 jsonConfigExists
```

**commit #4**(第二波,5 文件 + file-ops/ipc 一起):

```
src/main/features/conversations/data.ts   (11 处)
src/main/features/workspaces/data.ts      (4 处)
src/main/features/compaction/data.ts      (2 处)
src/main/features/file-ops/data.ts        (1 处)
src/main/db/mod.ts                        (2 处 — PRESERVED, 见 D9)
src/main/features/file-ops/ipc.ts         (4 处)
```

**commit #5**:

```
src/main/file-sandbox.ts                  (4 处)
```

**commit #6**:

```
src/main/features/automations/service.test.ts   (新增,~100L)
```

**commit #7**:

```
src/main/features/automations/service.ts  (9 处)
```

**commit #8**:

```
src/main/features/mcp/mcp-manager.ts     (3 处)
```

**commit #9**(长尾):

```
src/main/features/mock-server/qa-loader.ts           (3 处)
src/main/features/automations/scheduler.ts           (1 处,如未在 #7 一起)
src/main/index.ts                                    (1 处)
src/main/features/file-ops/data.ts                   (1 处,如未在 #4 一起)
```

### D9 — db/mod.ts 反候选(commit #4 deletion test 不通过,scope 修订)

**实施后修订(2026-08-08,commit #12 落地)**:`src/main/db/mod.ts` 的 2 处 `Effect.gen(function* () { ... })` 在 commit #4 实施时**未迁移**,原因如下。

**位置**:

- `applyMigrationsEffect`(`src/main/db/mod.ts` ~L77-100):被 `Layer.effect(MigrationsLive, ...)` 作为 input,需要直接 `Effect<...>`
- `MigrationsLive` inner generator:被 `Layer.effectDiscard(...)` 作为 input,需要直接 `Effect<...>`

**deletion test 不通过的根因**:

- `Effect.fn("name")(function* () {...})` 是 **named factory**:返回 `() => Effect<...>`,不是 `Effect<...>` 直接
- `Layer.effectDiscard` / `Layer.effect` 的 TypeScript signature 期望 `Effect<...>`,不是函数
- 直接把 `Effect.fn(...)` 喂给 Layer 会触发 TS 编译错误(实测 commit #4 触发 4 处 TS error)
- 强行 wrap 后,要么改 Layer 类型(`Layer.effectEffect` 接受 thunk,但与全 codebase 现有 pattern 不一致),要么调用方 `Layer.effectDiscard(Effect.fn("name")(...)())` 二次调用(引入额外间接层,违反简单优先)
- **结论**:删除 `Effect.gen` 会破坏 Layer 契约,wrap 会引入 TS 错误,deletion test 不通过 → **反候选**

**保留形态**:

- `applyMigrationsEffect = Effect.gen(function* () { ... })` 保持 `Effect.gen`(返回 `Effect<...>` 直接)
- `MigrationsLive = Layer.effectDiscard(Effect.gen(function* () { ... }))` 保持 `Effect.gen`
- 两处的 effect 名字进不了 Effect tracer(没有命名 trace),但 trace 在 Layer 边界外由 `DbLive` 的命名承担,实际可观测性不受影响

**与 的关系**:D3 引入 `Layer.effectDiscard` + `SqliteClient.layer({...})` 模式,db/mod.ts 是这一模式的承载点。本 D9 是 D3 的**继承性约束**——**不**修订 D3,**只**记录 db/mod.ts 因 D3 的 Layer API 选择而成为反候选。

**对未来的警告**:任何"全面 Effect.fn 化"的 review,如果建议 wrap db/mod.ts,必须引用本 D9,否则 review 不可信。

## Considered Options(高层)

| 选项                             | 描述                                     | 选 / 不选                                        |
| -------------------------------- | ---------------------------------------- | ------------------------------------------------ |
| 不迁                             | 维持 17 文件 / 111 处 `Effect.gen`       | 不选 — tracing 链路在 json-config 等边界断名持续 |
| 隐式命名统一                     | `Effect.fn(function* () {...})`(TS 推导) | 不选 — D1 理由(变量名重构时 effect 名跟着变)     |
| 5-6 个独立 PR                    | 每候选 1 个 PR                           | 不选 — 本地上下文切换成本高,D2 理由              |
| 1 个 mega-PR                     | ~280L 单 PR                              | 不选 — review 不可行,违反 精神       |
| 跳过 automations 测试补足,直接迁 | 无 safety net 直接 wrap 9 处             | 不选 — AGENTS.md 目标驱动优先                    |

## Consequences

### 正面

- **tracing 链路闭合**:Effect logger 在所有 main 内 effect 可命名,debug 时 `grep '"<name>"'` 直接定位
- **依赖图一致性**:`mcp-config` / `automations-config` 已迁,`lib/json-config` 也迁,不再有"已迁模块依赖未迁模块"
- **locality 收口**(部分):每个 effect 体内 yield\* 链顺序与错误映射可视化;不强求合并(`asAppError` helper 在 file-sandbox.ts 已存在)
- **测试 safety net 升级**:`automations/service.test.ts` 新增后,该模块未来所有改动都有回归保护
- **代码风格统一**:`Effect.fn("name")(...)` 显式命名推广到全 src/main,新代码无法"想不出名字就跳过"

### 负面 / 代价

- **9 commits 维护成本**:rebase / squash 时需注意 commit 顺序;D8 文件清单锁定
- **automations 测试补足成本**:commit #6 ~100L diff,需先读 service.ts 全实现 + mock FileSystem / Path,1-2 小时工作量
- **skill-loader 改名**:commit #2 虽小,但改了已合并代码;git blame 会断(可接受,纯改名)
- **D2 commit #4 diff 较大**:5 文件 + file-ops/ipc = 6 文件,~130L diff;review 需仔细
- **隐式→显式改名的真实价值有限**:仅 2 处(skill-loader.ts);commit #2 主要是"风格统一"信号,非功能收益

### 不变

- **ADR-0003 renderer 禁令**(D7 仅在 src/main 生效)
- **ADR-0041 D3/D6/D8**:McpManager class 结构 / StdioTransport deep module / jsonrpc 不拆模块
- **ADR-0046 D6 反候选**:`webfetch` / `config-service` / `skills-host` / 6 域 IPC handlers 外壳(本 ADR 不触及)
- **IPC 错误契约**(`{kind: _tag, message}` JSON)+ channel 名 + 参数类型 — **renderer 零改动**
- **DB schema** / `migrations/*.sql` / `_migrations` 表格式
- **ADR-0018 logging**(`logger.*` 不打印完整 secret)+ **ADR-0025 effect/Schema**(Schema.TaggedError 仍是错误基类)

## Risks

- **R1 中间 commit 顺序冲突**:D8 文件清单已锁,先做 ADR + 改名,再 json-config 闭合依赖图;中途若发现 file-ops/data.ts 已在 #4 一起做了,#9 自动空 commit,接受
- **R2 commit #4 db/mod.ts 拆 pipe 引入 regression**:`Effect.gen(...).pipe(Effect.flatMap(() => Effect.void))` 拆为 `Effect.fn` 内 yield* 链,语义必须保持;**code review 检查点**:flatMap 后是 `Effect.void`,等价 `yield* Effect.void`;如拆错导致 fiber 不结束则回归
- **R3 commit #6 automations 测试补足发现真实 bug**:补测是为了锁行为,若发现 bug 单独 fix PR,不与 #7 合并
- **R4 commit #8 mcp-manager `startAll` E 类型漂移**:wrap 后必须保持 `Effect<void, never, FileSystem.FileSystem | Path.Path>` 的 E = `never`;若 Effect.fn 推导变化,显式标注强制
- **R5 skill-loader.ts 改名 git blame 断**:commit #2 是纯 rename,后续 PR 可 `git blame --ignore-revs-file` 忽略;可接受

## Rollout

每 commit verify gates:

- `vp run typecheck` → exit 0
- `vp run test` → 全过(不低于 baseline,新加的 service.test.ts 必须过)
- `vp run lint` → 无新违规
- 无 `as any` / `@ts-ignore` / `@ts-expect-error`
- commit #6 / #7 后跑 `vp run test:main` 确认 automations 端到端 OK
- commit #8 后跑 `vp run test:main` 确认 MCP 启动 / 停止 OK

合并策略:9 commits 在 `feature/effect-fn-modernization` 分支累积;视团队节奏选择:

- **方案 A**:每 commit 单独 PR(9 PR,review 轻,合并线性)
- **方案 B**:每波 1 PR(3 PR:第一波 / 第二波 / 第三波,review 中等)
- **方案 C**:整链 1 PR + range-diff review(1 PR,review 重)

**默认采用方案 A**(per 精神)。

## References

-  /  /  /  /  /
- `effect@3.21.4` 文档:`Effect.fn` 提供 traced + tagged generator function,语义等价 `Effect.gen` + `Effect.annotateScoped`
- AGENTS.md — atomic commit / 精准修改 / 简单优先
- `/improve-codebase-architecture` 扫描报告:`%TEMP%/architecture-review-20260808-132205.html`
- `/grilling` 决策记录:命名约定 / PR 粒度 / 测试策略 / ADR / skill-loader 改名归属 / 长尾处理(2026-08-08)
