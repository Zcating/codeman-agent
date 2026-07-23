# 0027 — Unify e2e and dev Q→A seed into a single `qa.dev.json`

**Status**: accepted · **Date**: 2026-07-12
**Scope**: `src/assets/qa.dev.json` (合并 19 e2e entries + 8 dev entries) + `e2e/fixtures.ts` (移除 `CODEMAN_TEST_QA_TABLE` env var 注入) + `e2e/mock-provider.ts` (header 文档) + `CONTEXT.md` (移除 "Per-Worker Q→A Isolation" 词条 + 更新 Q→A Table / Dev Q→A File / Fake LLM Provider 三词条) + 删除 `e2e/fixtures/qa-w{0..3}.json` (4 份)
**Supersedes**: 部分 — CONTEXT.md "Per-Worker Q→A Isolation" 词条 (V3 起 e2e 不再 per-worker 隔离 Q→A Table；per-worker port 隔离保留)

**Related**: ADR-0024 (Electron shell migration — V3 e2e 打包 binary spawn 模式), CONTEXT.md "Fake LLM Provider" / "Mock Server" / "Q→A Table" / "Dev Q→A File"

## Context

V3 e2e 一度采用 "per-worker Q→A 隔离" 模型（per `e2e/fixtures.ts` 注入 `CODEMAN_TEST_QA_TABLE=e2e/fixtures/qa-w{N}.json`），理由是"同 worker 内多 spec 共用 Q→A Table、跨 spec substring first-wins 易漏测"。该模型带来：
1. **80% 重复**：4 份 qa-w{N}.json 完全 byte-identical（MD5 验证：4 文件 hash 全 `c67227b5240822b377106a2c61b257a4`）。
2. **加载优先级混乱**：env var 胜出 dev seed；e2e 路径下 dev seed 完全失效 — 改 `qa.dev.json` 不影响 e2e，新增 dev entry 也走不到 e2e。
3. **架构责任漂移**：CONTEXT.md 把 `qa.dev.json` 描述为"dev 专用"，但 e2e 实际上是绕开它走独立 fixture；术语分裂。

调研固化（grill-with-docs 2026-07-12，4 问 4 答）：
1. 4 worker 共用一份文件可行 — `qa.dev.json` 是 immutable file read，4 个 mock-server 进程各自 fs.readFileSync 一次，互不干扰。
2. e2e spec keys 唯一性通过 `XX::`-前缀命名约定天然保证（无 spec 间 substring 冲突）。
3. e2e spec keys vs dev keys 冲突解决：test entries 排在 dev entries 之前，substring first-wins 保证 specificity priority。
4. dev 用户输入 "hello"/"read"/"list" 等 dev entry key 仍命中 dev entry（test entries 无这些 substring），dev 体验不退化。

## Decisions

### D1 — 单一数据源：dev seed = e2e seed

- `src/assets/qa.dev.json` 成为 dev 与 e2e 共用的唯一 mock LLM Q→A 数据源。
- 文件条目顺序：spec-specific entries (`XX::`-前缀, 19 条) → generic dev entries (`hello`/`read`/`list`/`ping`/`think`/`tool`/`three-blocks`/`summarize`, 8 条) → default entry (`*`, 1 条)。共 28 条。
- `mock-server.ts::lookupQaAnswer` substring first-wins 保证 spec 命中自己 entry 不会被 dev entry 截胡。

### D2 — 删除 per-worker fixture 文件

- 删除 `e2e/fixtures/qa-w{0..3}.json` (4 份完全相同的文件)。
- `e2e/fixtures.ts` 移除 `CODEMAN_TEST_QA_TABLE` env var 注入。`CODEMAN_TEST_QA_TABLE` 仍保留为 `qa-loader.ts::loadQaTable` 的可选 override hook，但 e2e 不再设置。
- Per-worker port 隔离（`CODEMAN_MOCK_PORT = 50000 + parallelIndex` + `window.__mockBaseUrl` 注入）保留 — 防 EADDRINUSE，与 Q→A Table 隔离正交。

### D3 — 移除 "Per-Worker Q→A Isolation" 词条

- CONTEXT.md "测试" section 的 "Per-Worker Q→A Isolation" 词条删除（已被 D1/D2 取代）。
- 同时更新 "Fake LLM Provider" / "Q→A Table" / "Dev Q→A File" 三词条反映新数据流：`qa.dev.json` 既是 dev seed 也是 e2e seed。

### D4 — 保留 `CODEMAN_TEST_QA_TABLE` 加载优先级但 e2e 不设

- `qa-loader.ts::loadQaTable` 加载优先级不变：env var 胜出 → 未设且 dev 模式则加载 `qa.dev.json` → 否则空表。
- 保留 env var override hook 为未来 debug / ad-hoc mock 场景留口子（无 spec 强依赖它）。

## Consequences

- **文件数量 -3**：`e2e/fixtures/` 目录清空（4 文件 → 0）；`src/assets/qa.dev.json` 体量从 118 行 / 9 条增至 202 行 / 28 条。
- **dev 体验不退化**：dev 用户输入 `hello`/`read` 等仍命中 dev entry；新增 dev entry 仅需改 `qa.dev.json` 一份。
- **e2e 维护成本下降**：新增 e2e spec 的 Q→A entry 直接在 `qa.dev.json` 加一条，无需 4 份同步。
- **per-worker 隔离语义收窄**：只剩 port 隔离（EADDRINUSE 防）与 SQLite/Settings 隔离（`CODEMAN_TEST_WORKER=w{N}` suffix）。Q→A Table 跨 worker 共享，但因 spec keys 唯一性 + substring first-wins，无 cross-worker 漏测。
- **未来风险**：若 spec keys 命名约定松散（出现 `XX::Y` 与 `XX::Y-sub` 等父子 substring 关系）会引发跨 spec 误命中。需在 code review 阶段守住 `XX::` 前缀唯一性约定。

## Considered alternatives

- **Helper 自包含（useMockProvider 携带 Q→A 数据）**：原本讨论方向。但因 renderer helper 不能修改 main process env var，必须借助 IPC / temp file 等绕路，破坏 "mock-server stateless / 不依赖 IPC" 架构规则。弃。
- **合并成 1 个 qa.mock.json（仍为独立 fixture）**：保留 per-worker isolation 思想但消除 4 份重复。仍叫 fixtures json，违反 "不再使用 fixtures json" 用户诉求。弃。
- **IPC 运行时注册 entries**：加 `mock_register_entry` IPC。打破 "唯一数据源路径：Q→A Table" 架构规则。弃。