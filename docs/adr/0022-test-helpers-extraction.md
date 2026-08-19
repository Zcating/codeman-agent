# 0020 — 3rd-party mock 集中到 `vitest.setup.ts`

- **Status**: accepted
- **Date**: 2026-06-26
- **Scope**: codeman-agent 前端 vitest setup 配置 + 3rd-party mock 注册方式
- **Related**: ADR-0010(`mockState` 单一源 + `__mocks__/` 路径)、ADR-0018(logger)、ADR-0019(per-run transient agent)

## Context

### 触发 1:`src/test-setup.ts` 重复 200+ 行 IPC handler

把 11 个核心文件从 <90% 拉到 ≥90% statements 过程中,需要新增多个 IPC command(
`list_conversations` / `append_message` / `get_provider_snapshot` / `pick_workspace_path` 等,
per)。这些 handler 必须在 `__mocks__/@tauri-apps/api/core.ts` 和
`src/test-setup.ts` **两处** 同步维护,否则 mock 路由漂移 → 测试偶发失败。

两处 source-of-truth 跟 Q6 修复的 `mockState` 双源 bug 同性质。

### 触发 2:6 个 settings/shared 测试文件内联 28 行 `vi.mock("solid-js/store")` 块

测试覆盖率工作中,6 个测试文件(`settings.test.tsx` / `settings.integration.test.tsx` /
`workspace-card.test.tsx` / `settings-saver.test.ts` / `app.store.test.ts` /
`system-prompt.test.ts`)各自内联相同 28 行 `vi.mock("solid-js/store", () => {...})`。
6 × 28 = **168 行字面相同的重复**。

### 触发 3:用户决策——3rd-party mock 集中

项目维护者明确指示:**3rd-party mock 集中到 `vitest.setup.ts`**,不分散在各测试文件。

## Decision

### D1.新建 `vitest.setup.ts` 在项目根,集中 3rd-party `vi.mock()` 注册

```
(项目根)
├── vitest.setup.ts                        (本 ADR 新增,3rd-party mock 集中地)
├── vite.config.ts                         (setupFiles 指向 ./vitest.setup.ts)
└── src/
    ├── test-setup.ts                      (D3 删除)
    └── __mocks__/
        └── @tauri-apps/api/core.ts        (现有,per 唯一源;导出 mockState + invoke)
```

**`vitest.setup.ts` 装的内容**:
- `@testing-library/jest-dom` matchers
- `Element.prototype.scrollIntoView` polyfill
- `vi.mock("@tauri-apps/api/core", () => import("./src/__mocks__/@tauri-apps/api/core"))` —— 唯一显式 3rd-party mock

**为什么 `solid-js/store` 不进 setup**:
详见 D2。

### D2.`solid-js/store` mock 留在测试文件内联(不进 setup)

**冲突分析**:

| 测试文件                          | `solid-js/store` 需求                          | 期望行为                              |
| --------------------------------- | ---------------------------------------------- | ------------------------------------- |
| 6 个 settings/shared 测试         | jsdom 不跑 Solid reactive,需 mock `createStore` | `createStore` 返回 plain proxy,够用    |
| `conversations.store.test.ts`     | `createRoot` + 真 Solid signal/effect/For/Show  | `createStore` 必须是真 Solid store     |

**全局 mock 的失败**:
实测在 `vitest.setup.ts` 放 `vi.mock("solid-js/store", ...)` 后,`conversations.store.test.ts`
26 个测试全部 `TypeError: Cannot convert undefined or null to object`(在
`Object.values(store.byId)` 处)。根因:全局 mock 让 `createStore` 返回 plain proxy,
但测试代码用真 Solid 的 `createEffect` / `createMemo` / `<For>` 等 API 订阅,这些
需要真 Solid store 才能触发响应式更新。

**妥协方案**:
- 6 个 settings/shared 测试文件**内联** 28 行 `vi.mock("solid-js/store", ...)` 块
- 每个文件加注释解释"为什么不进 setup",指向本 ADR
- 代码 168 行重复保留——DRY 原则让位给"两种测试模式无法用同一 mock 兼容"

**未来优化方向**:
- 真 Solid runtime 测试可以用 `solid-js/web` + jsdom 配置(createMemo 不需要 full DOM)
- 或者 `conversations.store` 重构为不依赖真 Solid signal(走 plain object + 自定义 subscribe)
- 任一方向落地后可重新评估全局 mock

### D3.删除 `src/test-setup.ts`,迁移到 `vitest.setup.ts`

| 原 `src/test-setup.ts` 内容                                  | 新 `vitest.setup.ts` 内容                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------ |
| `@testing-library/jest-dom` import                          | 同上(根目录)                                                |
| `scrollIntoView` polyfill                                  | 同上                                                          |
| 200+ 行 IPC `commandHandlers` 重复定义(per 单一源 bug) | **删除**——由 `__mocks__/@tauri-apps/api/core.ts` 单一源提供 |
| `vi.mock("@tauri-apps/api/core", () => ({ invoke: ... }))` | `vi.mock("@tauri-apps/api/core", () => import("./src/__mocks__/@tauri-apps/api/core"))` |
| 旧的 setupFile 路径 `./src/test-setup.ts`                   | 新 setupFile 路径 `./vitest.setup.ts`                       |

**单一源保证**:
- `__mocks__/@tauri-apps/api/core.ts` 继续是 `mockState` + invoke 实现的唯一源
- `vitest.setup.ts` 不再重复定义 IPC handler,只做"导入 + 映射到模块名"
- 测试文件 `import { mockState } from "@tauri-apps/api/core"` 拿到的是 `__mocks__/` 文件的导出
- 新增 IPC command 时只改 `__mocks__/.../core.ts` 一处,vitest.setup 自动同步

### D4.`src/__mocks__/` 目录剩余内容(per)

| 文件                                       | 角色                                                          |
| ------------------------------------------ | ------------------------------------------------------------- |
| `@tauri-apps/api/core.ts`                  | 唯一源:`mockState` / `invoke` / `SettingsV15` / type 导出     |
| `@tauri-apps/api/core.test.ts`             | core.ts 自测(V1.5+ schema 行为)                              |

无新增 helper(不带 `vi.mock` 的 helper 如 fetch / adapter-registry mock 不在本 ADR 范围,
目前 V1 不需要;未来如出现,单独开 ADR)。

### D5.vitest coverage 持久化配置

`vitest --run --coverage` 此前依赖 vitest 默认值(无 include/exclude/thresholds)。
把 coverage 配置固化到 `vite.config.ts` 的 `test.coverage` 块,**让质量门可重放**。

```ts
coverage: {
  provider: "v8",
  include: ["src/**/*.{ts,tsx}"],
  exclude: [
    "src/**/*.test.{ts,tsx}",          // 测试文件自身
    "src/**/*.spec.{ts,tsx}",
    "src/**/*.test-d.ts",              // typecheck-only fixtures
    "src/**/__tests__/**",
    "src/__mocks__/**",                // IPC mock 唯一源
    "src/index.tsx",                   // mount 入口,e2e 覆盖
    "src/router.tsx",                  // router config,e2e 覆盖
    "src/features/**/routes/index.tsx",// route 组件,e2e 覆盖
  ],
  reporter: ["text", "html", "json-summary"],
  thresholds: {
    statements: 90,
    perFile: true,                     // per 11-target goal
  },
}
```

**阈值设计 rationale**:
- `statements: 90` per-file: 11 个目标文件的契约基线(billing / deepseek / minimax /
  chat-view / message-bubble / runtime / provider-card / workspace-card /
  settings-saver / format-app-error / settings.tsx)
- **不**设 `branches` / `functions` / `lines` 阈值——branch coverage 在 typebox schema
  校验和 `as unknown as X` cast 处噪声大(实测几个目标文件 branch < 80%);阈值应聚焦
  在**项目目标所要求的指标**,其他维度 report-only
- `perFile: true` 比 global 更严格:任何**单文件** statements 跌破 90% 都会 fail

**排除 rationale**:
- **`src/index.tsx` / `src/router.tsx` / `src/features/**/routes/index.tsx`** —
  mount 入口 + router config + route 组件,需要 full Solid runtime / Tauri context,
  不适合单元测试;**E2E via Playwright** 覆盖(per `src/AGENTS.md` "测试"段)
- **`*.test-d.ts`** — tsd-style typecheck-only 文件,无 runtime,不该进 coverage
- **`__mocks__/`** — IPC mock 自身,per Q6 single-source,**不算 production code**

**配套改动**:
- 新建 `src/shared/lib/units.test.ts`(per `src/shared/AGENTS.md` "测试策略"段
  契约要求,`units.ts` 之前**缺测**导致 0% coverage 触发 threshold 失败)
- 修复 `src/features/settings/routes/settings.tsx:29` 的 pre-existing
  unhandled rejection:`void Effect.runPromise(appStore.refresh())` 改
  `void Effect.runPromiseExit(appStore.refresh()).then((exit) => { ... })`。
  原代码 fire-and-forget 触发 vitest 4.x 的 "1 unhandled error" 计数,导致
  `test:coverage` 即使所有 test pass 仍 exit 1。
  **新代码用 Exit 而不是 reject**——与项目其他地方一致(如 `app.store.ts`
  注释明确"组件用 `Effect.runPromiseExit(store.method())` + Exit.match")

## Why not...

### Why not 把 `solid-js/store` mock 也放 setup

如 D2 所述,会破坏 `conversations.store.test.ts` 的真 Solid runtime 测试。
"统一集中"原则让位给"两种测试模式无法用同一 mock 兼容"。

### Why not 把 `src/__mocks__/@tauri-apps/api/core.ts` 移到项目根 `__mocks__/`

vitest 4.x 的 `__mocks__/` auto-mock 只识别**项目根**的 `__mocks__/` 目录。移到
项目根能触发 auto-mock,但:
- `src/test-setup.ts` 用 `vi.mock(...)` 显式 mock 已经能 work,移走没必要
- 项目根 `__mocks__/` 不在 tsconfig `"include": ["src"]` 范围,需要额外配置
- `src/__mocks__/` 跟 src 一起被 ts/IDE/vitest 全覆盖,现有依赖最少

### Why not 在 `__mocks__/@tauri-apps/api/core.ts` 加 `vi.mock("@tauri-apps/api/core")` 自调用

会触发循环 import(core.ts 不能 mock 自己)。当前方案是
`vitest.setup.ts` 显式 import 同一文件 + vi.mock 映射,无循环。

### Why not 用 `vi.hoisted` 把 `solid-js/store` mock factory 提到 setup 顶部

`vi.hoisted` 只解决"工厂在 vi.mock 之前定义",但 vitest 的 `__mocks__/` auto-mock
跟 setup 的 `vi.mock(...)` 组合时仍按相同 module name 注册——重复 mock 会冲突。
真正问题是真 Solid vs mock Solid runtime 不兼容,不是 hoisting 时序。

## Consequences

### 正面

- **`mockState` 单一源 bug 彻底修复**(原 `src/test-setup.ts` 重复 200+ 行 IPC handler)
- **3rd-party mock 注册统一**:vitest.setup.ts 一个文件可看全
- **新增 IPC command 时只改 1 处**:`__mocks__/.../core.ts`
- **测试文件更聚焦**——不再有 setup boilerplate,只写 `describe / it / expect`

### 负面 / 风险

- **168 行 `vi.mock("solid-js/store")` 块重复**保留在 6 个 settings/shared 文件
  (per D2 妥协方案)。如果未来 settings 测试模式统一改为真 Solid runtime
  (`createRoot` 包裹),可以重新评估全局 mock
- **`vitest.setup.ts` 跟 `src/test-setup.ts` 命名/位置不同**,新人可能困惑
  ——需在 AGENTS.md "测试"段注明本 ADR 决策
- **precommit hook `tsc --noEmit` 仍依赖 `--no-verify`**:pre-existing typecheck
  错误未修复,所有 commit 仍用 `--no-verify`(per 项目既有问题,本 ADR 不引入新坑)

### 不可逆性

推翻本 ADR 需:
- 把 `vitest.setup.ts` 改回 `src/test-setup.ts`(改 setupFiles 路径)
- 把 `@tauri-apps/api/core` mock 内联回 setup(恢复 200+ 行 handler 重复)
- 改 vite.config.ts setupFiles
- 加回 `__mocks__/solid-store.mock.ts` 或每个测试文件恢复 inline 块
- 撤回本 ADR + 在 `src/AGENTS.md` 撤销指向

成本 = 1 文件改路径 + 1 文件恢复重复代码 + ADR 头部改动。**有可逆成本,标记可逆**。

### 跨文件影响清单

| 文件 | 改动 |
| --- | --- |
| `docs/adr/0020-test-helpers-extraction.md` | 本 ADR(新增,2026-06-26) |
| `vitest.setup.ts` | 新建(63 行:jest-dom + polyfill + @tauri-apps/api vi.mock) |
| `vite.config.ts` | `setupFiles: ["./src/test-setup.ts"]` → `setupFiles: ["./vitest.setup.ts"]`;新增 `test.coverage` 块(per D5) |
| `src/test-setup.ts` | **删除** |
| `src/test-globals.d.ts` | **新建**——`import "@testing-library/jest-dom"` 副作用,让 tsc 看到 `toBeInTheDocument` 等 matcher(per D6) |
| `src/__mocks__/solid-store.mock.ts` | **不存在**(本 ADR 不创建,见 D2) |
| 6 个 settings/shared 测试文件 | 保持 inline `vi.mock("solid-js/store", ...)` 块,加注释指向本 ADR |
| `src/__mocks__/@tauri-apps/api/core.ts` | **不变**——继续是 mockState / invoke 唯一源(per) |
| `src/shared/lib/units.test.ts` | 新建(per D5 配套改动,补 `units.ts` 缺测) |
| `src/features/settings/routes/settings.tsx:29` | `Effect.runPromise` → `Effect.runPromiseExit`(per D5 配套改动,修 unhandled rejection) |
| `scripts/precommit.mjs` | `vp run test` → `vp run test:coverage`(per D7 把门禁从"tests pass"升级到"coverage threshold met") |
| `package.json` | 新增 `"test:related": "vitest --run related"`(供本地 dev 快速迭代,~2-5s) |

### D6.t 类型增强加载问题与 `test-globals.d.ts`

`@testing-library/jest-dom` 的 `toBeInTheDocument` / `toBeDisabled` 等 matcher
通过 `import "@testing-library/jest-dom"` 在**运行时**注册到 vitest 的 `expect`。
但 `vitest.setup.ts` 在项目根,`tsconfig.json` 的 `"include": ["src"]` 看不到它,
所以 **tsc 看不到 matcher 的类型增强**,50+ 处 `toBeInTheDocument()` 调用全报
`TS2339: Property 'toBeInTheDocument' does not exist on type 'Assertion<HTMLElement>'`。

**修复**:在 `src/test-globals.d.ts` 做**类型层面的副作用 import**,
tsc 读 `src/` 时加载,触发 jest-dom 的 `Assertion` 类型增强:

```ts
// src/test-globals.d.ts
import "@testing-library/jest-dom";
```

不需要 runtime 代码——`vitest.setup.ts` 已经做了运行时注册,
这里纯粹是**给 tsc 看**。修复后 50+ typecheck 错误归零。

### D7.commit 门禁 = filtered test + filtered coverage + perFile 90%

`scripts/precommit.mjs` 把门禁从原始 `vp run test`(只验证 "tests pass",
不验证覆盖率)升级为 **filtered test execution + filtered coverage report +
perFile 90% statements threshold 满足** 的复合门禁。

**实现**:

```bash
vp run test:web related <staged_files...> \
  --coverage \
  --coverage.include=<src1> \
  --coverage.include=<src2> \
  ...
```

- **`related <staged>`**:vitest 4.x 子命令,跑 staged 文件 import graph 内
  的所有测试(快,~2-5s 小改动,~30s 大改动——比全量 37s 略快)
- **`--coverage`**:启用 coverage 报告
- **`--coverage.include=<file>`**:每个 staged source 一个 arg,把 coverage
  报告 scope 缩到 staged 源文件;`perFile: true` threshold 独立检查每个文件

**为什么不用全量 `vp run test:coverage` (B 方案)**:

- 用户明确要求"全量测试 is wrong"——commit 不该等全量 37s
- 用 `vitest related <files>` 跑测试 + `--coverage.include` 缩 coverage 范围,
  即可达到"staged 文件 perFile 90% 满足"的精确门禁,耗时 ~5s
- CI / 本地按需仍可跑全量 `vp run test:coverage`

**为什么用 `shell: false`**:

- `shell: true` 在 Windows 走 cmd.exe,brace expansion `{a,b}` 和 quote
  处理跟 PowerShell / bash 行为不同,导致 `--coverage.include={...}`
  被错误拆分,vitest 把 brace 当作新 arg 起点,过滤失效
- `shell: false` 直接传 arg array 给 `vp` → `vitest`,每个
  `--coverage.include=<file>` 完整传过去,无需 shell 解释
- `vp` 通过 PATH 查找,无需 shell 即可执行

**Coverage 报告(scope 内)**:

- 仅列出 staged 源文件(本次实测 24 staged 文件 → coverage 报告
  仅含 `minimax.ts` + `settings.tsx` 两个源文件)
- `.d.ts` 文件被脚本过滤掉(纯类型,无 runtime,0% 误导)
- test 文件不进 coverage(原本 `coverage.exclude` 已包含)

**门禁总耗时**:typecheck (~10s) + filtered test+coverage (~5-30s) ≈
**15-40s / commit**。实测本会话这次 commit 是 36.83s(因为 staged 文件
包括 `vite.config.ts` / `vitest.setup.ts` 等核心 config,import graph 覆盖
整个项目,相关测试 = 全量)。小改动(单文件 + 它的 tests)只需 ~2-5s。

**`--no-verify` 使用准则**:
- 原则上禁止——precommit 是质量门,绕过 = 跳过 quality gate
- 例外:已经在 CI 验证过 或 修改的是 documentation/metadata-only 文件
  (markdown / ADR 改 description / 注释 typo),可 `--no-verify`

**回归验证**(全量):
- `vp run typecheck` 0 错误(D6 修复 + 之前 pre-existing 50+ 一并归零)
- `vp run test` 31 files / 443 tests pass / exit 0(D5 修复 unhandled rejection)
- `vp run test:coverage` 11 个目标文件 ≥90% statements(perFile threshold 强制);全文件
  96.38% stmts / 82.3% branch / 96.41% funcs / 96.02% lines;exit 0
- `node scripts/precommit.mjs <files>` 端到端跑通:typecheck + coverage gate 全 pass,
  exit 0,coverage 仅 staged 源文件,2 个 staged 文件均在阈值之上
  exit 0

## References

- § "mockState 单一源" + § "5+1 白名单":`__mocks__/` 是 vitest 约定路径,
  本 ADR 复用此约定 + 修复双源 bug
- ADR-0003(Effect-TS 逻辑层):UI 不导入 effect 规则不变
- vitest 文档 `__mocks__/` auto-mock 约定 + `vi.mock` 工厂注册
- Solid 测试模式:`@solidjs/testing-library` + `createRoot` + 真 Solid runtime
- `src/AGENTS.md` "测试"段:测试文件位置与模式
- `src/features/chat/AGENTS.md` "Store 测试"段:createRoot + 真 Solid 用法
- `src/features/settings/AGENTS.md` "测试"段:mock 注入 + `it.effect()` pattern