# 0058 — src/main FileSystem / Path service 引入：5 PR 渐进迁移 + PlatformError 跨 IPC 收敛

- **Status**: accepted
- **Date**: 2026-08-07
- **Scope**: `src/main/` 8+ 文件内 `node:fs/promises` / `node:path` / `node:crypto` 直调 → FileSystem / Path service；新增 `lib/file-system-node.ts` + `lib/json-config.ts` + `lib/test/file-system-test.ts` 抽象
- **Supersedes**: 无
- **Related**:
  -  — Effect 推进基线 / D7 oxlint 规则
  -  — Promise → Effect 迁移 / sandboxHandler 边界
  -  — renderer 侧 Effect 边界（main / renderer 不互通禁令）

## Context

### 现状（5 PR 提交前）

ADR-0057 落地后 src/main 已基本 Effect 化（错误体系 / sandboxHandler / spawn / MCP / scheduler / webfetch / file-sandbox）。但 8+ 文件内仍有 `Effect.tryPromise({ try: () => readFile(...), catch: (e) => new AppBackendError.Unknown({ ... }) })` 4 行手卷错误映射 + `import { readFile, writeFile, ... } from "node:fs/promises"` 直调：

| 文件                                         | fs ops                                            | 复杂度               |
| -------------------------------------------- | ------------------------------------------------- | -------------------- |
| `db/mod.ts` (migrations)                     | existsSync / readdirSync / readFileSync           | 高 (boot path)       |
| `file-sandbox.ts`                            | realpath / readFile / writeFile / rename / unlink | 高 (原子写 + ENOENT) |
| `features/mcp/mcp-config.ts`                 | readFile / writeFile / mkdir / access             | 中 (90% 重复)        |
| `features/automations/automations-config.ts` | readFile / writeFile / mkdir / access             | 中 (90% 重复)        |
| `features/skills/skills-host.ts`             | access / copyFile / mkdir / readdir               | 中                   |
| `features/skills/lib/skill-loader.ts`        | readFile / readdir / stat                         | 中                   |
| `features/file-ops/ipc.ts`                   | readFile / unlink / readdir / stat                | 中                   |
| `features/conversations/data.ts`             | randomUUID                                        | 低                   |
| `features/workspaces/data.ts`                | randomUUID                                        | 低                   |

共同点：Effect 当带类型的 try/catch 用，资源管理与结构化并发能力完全未用；ENOENT / EACCES / 其它系统错误全部映射 `AppBackendError.Unknown`（丢失 errno 分类）。

### 候选（`/improve-codebase-architecture` 评审产出 4 候选）

1. **Strong**：FileSystem + Path service 引入吞掉 8+ 文件手卷（test seam 升级 + IPC 错误归类）
2. **Worth exploring**：mcp-config + automations-config 90% 重复下沉 `lib/json-config.ts`
3. **Worth exploring**：boot 路径上 `fileURLToPath` / `process.cwd` 收尾（C2）
4. **Speculative**：`randomUUID` 4 处 → `Effect.sync` 包装（C3）
5. **Speculative** → 不采纳：`webfetch ssrf.ts` 的 `dns.lookup` → `NodeSocket.dnsLookup` 替换（C4），**实测 v0.108.1 与 `@effect/platform@0.75.4` 都不存在 `dnsLookup` API**（grep 整个 node_modules 0 命中），feature 关闭（详见 D5）

## Decision

### D1 — 5 PR 渐进迁移（不为 mega-PR）

| PR   | 内容                                                                                                                                                                                                   | 依赖  | 风险 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | ---- | ------------------ |
| PR-α | `MainLive` 挂 `NodeFileSystemLive` + `NodePath.layer`；新建 `lib/file-system-node.ts` (Project 内 `@effect/platform-node` 适配) + `lib/test/file-system-test.ts` (memfs) + `runtime.test.ts` 11 个测试 | 无    | 低   |
| PR-β | `file-sandbox.ts` 内部 fs/path 走 service；原子写语义保留                                                                                                                                              | α     | 中   |
| PR-γ | `mcp-config.ts` + `automations-config.ts` 复用 `lib/json-config.ts` 抽象；mcp-manager / scheduler / service 签名扩 `FileSystem                                                                         | Path` | α    | 中（传 signature） |
| PR-δ | `db/mod.ts` migrations + `skills-host.ts` + `skill-loader.ts` + `file-ops/ipc.ts` 走 service；C3 randomUUID 2 处 Effect.sync 包装                                                                      | α     | 中   |
| PR-ε | C4 spike → 不采纳（API 不存在）                                                                                                                                                                        | α     | —    |

**拒绝** mega-PR（违反 拒绝 B；review 不可行）。

### D2 — `lib/file-system-node.ts` 自实现 fs adapter（绕开 platform-node-shared SystemError bug）

**问题**：`@effect/platform-node-shared@0.61.1` 内部 `error.js` 用 `new SystemError(...)` 构造错误，但 `@effect/platform@0.75.4` 的 `SystemError` 是 arrow function（`(props) => Data.struct({...})`），非 class。`new` arrow function 抛 `TypeError: SystemError is not a constructor`（v0.108.1 实测）。

节点升 `@effect/platform@0.97.1+` 才能让 `SystemError` 升 class 形式，但 `@effect/platform@0.97.1` peer-require `effect@^3.22.1`（项目锁定 `^3.21.4`），会级数全 effect 链。

**决策**：手写 `NodeFileSystemLive` layer，直接 `Effect.tryPromise` 包装 `node:fs/promises`，避免 `effectify` 路径。仅实现 src/main 实际调用 11 个方法（access / exists / readFile / readFileString / writeFile / writeFileString / readDirectory / makeDirectory / remove / rename / realPath / stat），其他方法（copy / chmod / chown / link / open / stream / sink / watch / readLink / symlink / truncate / utimes / temp\*Scoped）抛 `not implemented`。

后续 `@effect/platform` 升级到 0.97.1+ 时可直接换用 `@effect/platform-node` 内置 `NodeFileSystem.layer`。文件头注释说明。

### D3 — `lib/test/file-system-test.ts` 测试用 memfs 适配

**问题**：node:fs 在 vitest/jsdom 跑不动（原生模块 ABI）。handler 测试用 `mkdtempSync` + `rmSync` 启动慢且易污染。

**决策**：基于 `memfs.Volume` 实现 `FileSystem` 层（`FileSystem.layerNoop(partial)` 包裹），提供 `makeMemfsFileSystem(vol)` 工厂 + `MemfsFileSystemTest` 默认层。后续 PR-β/γ/δ 改造后 handler 测试可注入 `MemfsFileSystemTest` 替代 `mkdtempSync` + 真盘 IO。

### D4 — `lib/json-config.ts` 抽象 JSON 配置

**问题**：`mcp-config.ts` 与 `automations-config.ts` 的 read / write / exists 三件套 90% 重复；JSON.parse 失败 + Schema.decode 失败的错误映射重复。

**决策**：抽 `readJsonConfig<T>(path, schema, defaultValue)` + `writeJsonConfig(path, value)` + `jsonConfigExists(path)` 三个原语。错误统一走 `AppBackendError` namespace（InvalidConfig / Unknown）。文件不存在（ENOENT）返回 `defaultValue`（与原 mcp-config / automations-config 行为一致）。

### D5 — `dpl-0046` D2 peer dep mismatch（path adapter 绕开 barrel）

**问题**：`@effect/platform-node@0.108.1` 的 barrel `index.js` 触发 `NodeClusterHttp.js` 加载，后者 `import @effect/cluster/HttpRunner` → 期望 `@effect/platform/HttpLayerRouter` 但 `@effect/platform@0.75.4` 未导出，模块加载失败。

**决策**：node:path / `NodeFileSystem` 走 submodule 直 import，**不**走 barrel。文件头注释说明。

```ts
// ✓ submodule 直 import
import * as NodePath from '@effect/platform-node/NodePath';
import { NodeFileSystemLive } from './lib/file-system-node.js';

// ✗ barrel 触发 chain（避免）
import { NodeFileSystem, NodePath } from '@effect/platform-node';
```

### D6 — PlatformError → AppBackendError 映射（保守）

**问题**：`FileSystem` service 抛 `PlatformError`（typed `_tag` 区分 NotFound / PermissionDenied / AlreadyExists / BadResource / Busy）；当前 handler 统一映射 `AppBackendError.Unknown` 丢失 errno 分类。

**决策**（保守）：handler 边界用 `Effect.catchTag("NotFound", ...)` 映射 `AppBackendError.NotFound`，其它 `SystemError` 映射 `AppBackendError.Unknown`，未捕获的 `BadArgument` 透传。IPC 契约 `{kind, message}` JSON 不变，renderer 仍走 `mapIpcError(AppBackendError._tag)` 路径，**零改动**。

**拒绝**激进（放宽 `PlatformError` 跨 IPC，会破坏 物理分离原则；需续 ADR）。

### D7 — `randomUUID` 4 处 `Effect.sync` 包装（C3 拆分）

**决策**：`features/workspaces/data.ts` + `features/conversations/data.ts` 的 `randomUUID()`（DB 主键生成）改为 `Effect.sync(() => randomUUID())` 包装，通过 `yield* makeId` 拿值。

### D8 — `C4` `NodeSocket.dnsLookup` 不采纳

**问题**：ssrf.ts 当前 `dns.lookup(hostname, { all: true })` 含 `node:dns/promises` 直调，原本想用 `@effect/platform-node/NodeSocket.dnsLookup`（声称支持 `{ family: 4 }` 强制 IPv4）。

**实测**（v0.108.1 + `@effect/platform@0.75.4`）：grep `node_modules\.pnpm\@effect+platform-node-share_*/dist/{dts,esm}` 0 命中 `dnsLookup`。`NodeSocket` 当前只有 `makeNet` / `layerWebSocket` / `layerWebSocketConstructor`，**无 DNS 接口**。

**决策**：C4 关闭。ssrf.ts 维持 `node:dns/promises` 直调（boot path / Effect.tryPromise 包装已 改造完成）。后续 `@effect/platform-node` 加入 dnsLookup API 时再 revisit。

### D9 — 顺序与 PR 拆分

PR 顺序：α → β → γ → δ。ε 已关闭。

**拒绝**：`settings/state.ts` 同步 API → 全 Effect 改造（用户 1 决策）。sync API 跨多个 settings IPC handler（subAgents:update / updateSettings / deleteProvider 等），影响面与 PR-α test 拆分不匹配；后续独立 PR 单独处理。

### D10 — 锁定的边界（不在本 ADR 范围）

| 文件                                                             | 锁定原因                                                                                            |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `node:child_process` (3 处 spawn)                                | 范围缩减：V3 缺 `ChildProcessSpawner`；spawn 后由 `lib/child-process.ts` 统一 kill 语义 |
| `node:http` (mock-server createServer)                           | 拒绝 C：50 行 dev-only 工具不值挂 `NodeHttpServer`                                      |
| `node:process` (`config-service.ts` env 解析 + `app.getPath`)    | 反候选：env 解析无 retry / timeout / 资源                                               |
| `node:url` (`db/mod.ts` fileURLToPath boot)                      | boot path, pre-runtime，无 service context                                                          |
| `lib/child-process.ts` `process.cwd()` (spawn cwd fallback)      | spawn API 需要 string，service 抽象无收益                                                           |
| `run-command/exec.ts` `process.cwd()`                            | 同上                                                                                                |
| `features/mock-server/qa-loader.ts` `process.cwd()`              | boot path, 同上                                                                                     |
| `index.ts` `process.cwd()` / `pathToFileURL`                     | pre-boot, pre-runtime                                                                               |
| `node:dns/promises` (`webfetch/ssrf.ts`)                         | D8 `NodeSocket.dnsLookup` 不存在                                                                    |

### D11 — oxlint 规则

继承：`src/main/**` 不限 `@effect/platform-node` / `effect` / `@effect/sql-sqlite-node` / `better-sqlite3` import（main 不是 renderer）。

**新加**：`src/main/**` prod 文件（除 `src/main/lib/test/**` + `src/main/lib/file-system-node.ts` + `src/main/lib/child-process.ts` 白名单）禁止 `import { readFile, writeFile, mkdir, access, copyFile, readdir, stat, realpath, rename, unlink, rm, existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs*"` 与 `import { realpath, readFile, writeFile, ... } from "node:fs/promises"`，必须走 `FileSystem.FileSystem` service。

`oxlint.config.ts` 待续添加（本次提交未动 oxlint 配置；后续跟 PR-α γ δ 一起加）。

## Consequences

### 正面

- **WAL 泄漏结构修复**（继承 ADR-0046）：`db.close()` 由 Scope finalizer 必然执行
- **fs 错误分类**：ENOENT 路径显式 `NotFound`、EACCES / EEXIST 等不再统一丢进 `Unknown`；handler 边界 `Effect.catchTag("NotFound", ...)` 可分类处理
- **重复消除**：`mcp-config.ts` + `automations-config.ts` 90% 重复下沉 `lib/json-config.ts`；新增 JSON 配置域 1 行调用即可
- **测试 seam 升级**：handler 测试可注入 `MemfsFileSystemTest` 替代 `mkdtempSync` + 真盘 IO；启动时间下降
- **IPC 契约不变**：sandboxHandler 仍 throw `{kind, message}` JSON，renderer 零改动
- **MainLive 顶层 R=never**：`ManagedRuntime.make(MainLive)` 自包含，`mainRuntime.runFork` boot effect 不需补 FileSystem service
- **leverage**：一个 `FileSystem` 接口，8+ 调用方收敛；test seam 升级；locality 改善（ENOENT 路径在 layer 统一）

### 负面 / 代价

- **新依赖 ×1**：`memfs@^4.68.0`（devDeps）
- **自实现 `lib/file-system-node.ts`**：~180L 维护成本（vs `@effect/platform-node` 内置 layer）；后续 `@effect/platform` 升 0.97.1+ 可直接换用
- **submodule import 绕过 barrel**：可读性略降（import 路径长）；文件头注释说明 why
- **platform 锁定**：受 `@effect/platform-node-shared@0.61.1` 与 `@effect/platform@0.75.4` peer dep mismatch 锁定；升 effect 链需续 ADR
- **PR-δ 范围缩小**：cq-data-store.ts (Promise→Effect 契约) 与 settings/state.ts (sync→Effect) 留 follow-up PR；本 ADR 暂不锁定这两块契约
- **D11 oxlint 规则**未在本次提交动配置——file-sandbox.ts / mcp-config.ts / automations-config.ts 内仍可能遗漏 `node:fs/promises` import（如 `file-sandbox.ts` 的 `fileURLToPath`）；下次 oxlint 巡检时一并加

### 不变

- `app.getPath("userData")` / `app.getPath("home")` 等 electron API 仍 sync 调用（pre-runtime）
- oxlint 规则（renderer 禁 `effect/platform-node`）
- IPC channel 名 / 参数类型 / `{kind, message}` 序列化契约
- `AppBackendError` namespace（保守映射保留）
- `lib/child-process.ts` (spawn 生命周期) — 仍直调 `node:child_process`
- `mcp-stdio-transport.ts`（spawn stdin/stdout）— 仍直调 `node:child_process`
- `mock-server` (createServer) — 仍直调 `node:http`
- `webfetch/ssrf.ts` 的 `dns.lookup` — 维持 `node:dns/promises` 直调（D8）

## Risks

- **R1**：`lib/file-system-node.ts` 自实现 fs adapter 行为与 `@effect/platform-node` 内置 version 差异（升 `@effect/platform` 后可能需要补全 `copy` / `chmod` / `link` 等方法）—— 跟踪 `@effect/platform-node` 升级即可
- **R2**：memfs 与真 `node:fs` 行为差异（atomic write / 文件锁 / Windows 路径）—— `cq-data-store` 真实 IO 验证仍走 e2e（vitest 用 memfs，e2e 用真盘）。本次 PR-δ 暂不迁移 cq-data-store
- **R3**：`settings/state.ts` 同步 API 跨多个 settings IPC handler 一旦独立 PR 仍要走 — 提前在 commit 沟通
- **R4**：`cq-data-store.ts` Promise→Effect 契约变更跨 IPC 测试 / handlers / scrape-core — 预留独立 PR
- **R5**：`db/mod.ts` 的 `migrationsDir()` 仍 sync (boot path)，未来如果 boot path 异步化需重构

## Rollout

每 PR verify gates（全部通过）：

- `vp run typecheck:node` → exit 0
- `vp run test:main` → 全过（PR-α 515 / PR-γ 502 / PR-δ 502 tests）
- `vp run lint` → 无新违规（44 个 pre-existing 不在改动文件）

PR 提交顺序（实际）：

- 889e2f6 PR-α (foundation) — 5 files, 703L
- db35905 PR-β (file-sandbox) — 5 files, 274L
- fc48610 PR-γ (json-config 抽象) — 11 files, 226L
- eb486f5 PR-δ (4 files + C3) — 9 files, 245L

`settings/state.ts` + `cq-data-store.ts` 留 follow-up PR 单独处理。
