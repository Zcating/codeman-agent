# 0042 — MCP 模块移入 features/mcp/ 目录(ADR-0039 D4 一致性)

- **Status**: accepted
- **Date**: 2026-08-02
- **Scope**: src/main/mcp-*.ts (13 files) → src/main/features/mcp/mcp-*.ts
- **Supersedes**: 无 — 纯结构性 move,与 ADR-0041 互补(ADR-0041 拆关注点,本 ADR 统一目录约定)
- **Related**:
  - [ADR-0032](./0032-mcp-client-stdio.md) — MCP Client 决策基线(D2 时未指定目录)
  - [ADR-0039](./0039-main-ipc-domain-split.md) — main IPC 拆分,D4 锁定 `src/main/features/<domain>/ipc.ts`
  - [ADR-0041](./0041-mcp-module-decomposition.md) — Phase 1 已完成 MCP 模块深化,本 ADR 完成目录统一

## Context

ADR-0039 D4 (2026-08-01) 锁定 main-side 域模块布局规则:

> 模块位置: `src/main/features/<domain>/ipc.ts`
> 所有 6 个 register 函数位于 `src/main/features/<domain>/ipc.ts`,与 webfetch 既有 `src/main/features/webfetch/` 结构对齐。

执行 ADR-0039 + ADR-0041 之后,main-side features 一览:

```
src/main/features/
├── compaction/        (4 files)
├── conversations/     (4 files)
├── file-ops/          (2 files)
├── mock-server/       (12 files)
├── settings/          (4 files)
├── system/            (2 files)
├── webfetch/          (8 files)
└── workspaces/        (4 files)
```

唯一 outlier:**MCP** — 13 个 `src/main/mcp-*.ts` 平铺在 `src/main/` 根,违反 ADR-0039 D4 locality 精神。

ADR-0032 (2026-07-21) 早于 ADR-0039 (2026-08-01) 一周多。当时 `src/main/mcp-host.ts` 是单文件,与 mcp-config / mcp-manager 平铺在 main/ 根,符合当时惯例。ADR-0039 落地 features/ 约定后,MCP 没回头改 — ADR-0041 (Phase 1) 深化 MCP 模块时也只关注 concern 拆分,未触及目录。

## Decision

### D1 — 7 个 MCP 文件 `git mv` 到 `src/main/features/mcp/`

| 原路径 | 新路径 |
| --- | --- |
| `src/main/mcp-config.ts` (+test) | `src/main/features/mcp/mcp-config.ts` |
| `src/main/mcp-handshake.ts` (+test) | `src/main/features/mcp/mcp-handshake.ts` |
| `src/main/mcp-host.ts` (+test) | `src/main/features/mcp/mcp-host.ts` |
| `src/main/mcp-ipc.ts` | `src/main/features/mcp/mcp-ipc.ts` |
| `src/main/mcp-manager.ts` (+test) | `src/main/features/mcp/mcp-manager.ts` |
| `src/main/mcp-stdio-transport.ts` (+test) | `src/main/features/mcp/mcp-stdio-transport.ts` |
| `src/main/mcp-types.ts` (+test) | `src/main/features/mcp/mcp-types.ts` |

保留 `mcp-` 文件名前缀(与 `compaction/` / `mock-server/` 等 features 内部命名惯例不强求一致;`mcp-` 前缀在 features/mcp/ 内部为冗余但无副作用,且与 IPC type names / runtime identifiers 视觉对齐)。

### D2 — `src/main/index.ts` 1 个外部 import 改路径

```ts
// before
import { McpManager } from "./mcp-manager";
import { registerMcpIpcHandlers } from "./mcp-ipc";

// after
import { McpManager } from "./features/mcp/mcp-manager";
import { registerMcpIpcHandlers } from "./features/mcp/mcp-ipc";
```

### D3 — 内部 import 路径批量调整

`src/main/features/mcp/` 内文件引用同级模块 (`./mcp-types` 等) 路径不变。引用 main 根模块路径需要 1 层额外 `..`:

| 引用目标 | 旧路径 | 新路径 |
| --- | --- | --- |
| `src/main/jsonrpc.ts` | `./jsonrpc` | `../../jsonrpc` |
| `src/main/logger.ts` | `./logger` | `../../logger` |
| `src/renderer/src/shared/lib/errors.ts` | `../renderer/...` | `../../../renderer/...` |

受影响文件:`mcp-host.ts` / `mcp-manager.ts` / `mcp-config.ts` / `mcp-handshake.ts` + 3 个对应 `*.test.ts`。共 10 个文件需要 import 路径调整。

### D4 — `src/main/ipc.test.ts` 2 个 import 改路径

集成测试 import MCP 模块验证 channel 注册总数(从 30 → 36,per ADR-0039 D1):

```ts
// before
const { McpManager } = await import("./mcp-manager.js");
const { registerMcpIpcHandlers } = await import("./mcp-ipc.js");

// after
const { McpManager } = await import("./features/mcp/mcp-manager.js");
const { registerMcpIpcHandlers } = await import("./features/mcp/mcp-ipc.js");
```

### D5 — 单 atomic commit + `--no-ff` merge

整个 move 是机械操作(0 行为变化,0 public API 变化),无中间状态风险。单 atomic commit 落地;merge to master 用 `--no-ff` 满足 AGENTS.md。

**拒绝**:
- A. 多 commit(per-file 或 per-directory):机械 move 不需要分多 commit,git bisect 粒度不受益。
- C. 顺手重命名(`mcp-types.ts` → `types.ts` 等):超出本 ADR 范围,重命名属于另一项决策;用户确认选 A「只 move」。

## Considered Options

| 选项 | 描述 | 选 / 不选 |
| --- | --- | --- |
| 不动 | 维持 `src/main/mcp-*.ts` 平铺 | 不选 — ADR-0039 D4 locality 失守,MCP 是唯一 outlier |
| 只 move | `git mv` + import 路径调整,不改文件名 | **选** — 最小 blast radius,机械操作,0 行为变化 |
| move + rename 去 `mcp-` 前缀 | A + `mcp-types.ts` → `types.ts` 等 | 不选(本次)— 用户确认选 A,rename 留作未来 follow-up |

## Consequences

### 正面

- **ADR-0039 D4 落地**:MCP 域现在与 conversations / file-ops / settings / system / workspaces / webfetch / compaction / mock-server 在同一目录约定下
- **Locality 提升**:MCP 模块所有源文件 + 测试聚集在 `features/mcp/`,未来加 `__test-helpers__/` 等子目录自然
- **Locality 改善**:`grep "mcp-" src/main/` 现在 0 hit(全在 `features/mcp/`);跨域搜索更精准
- **Discoverability**:新 contributor 在 `src/main/features/` 一眼看到所有域(包括 MCP)
- **零行为变化**:285 测试全过,公共 API 100% 不变,IPC contracts 100% 不变

### 负面 / 代价

- **2 个外部 import 路径改动**:`src/main/index.ts` + `src/main/ipc.test.ts` 各 1-2 行
- **10 个内部 import 路径调整**:MCP 域内引用 main 根模块需多 1 层 `..`
- **单 commit diff 大**:13 文件 moves + 11 文件 import 改动 = 单 commit 60+ lines diff(全为路径改动,无逻辑变化)

### 不变

- 公共 API 100% 不变(McpStdioServer / McpManager 类 + 9 个 manager methods + 7 个 server methods)
- IPC contracts 100% 不变(mcp:* 7 个 channel)
- ADR-0032 D2 stdio-only / D3 naming rule / D4 tool call path
- ADR-0041 所有深化决策(模块拆分 + helpers + ADR-0041 本身)
- ADR-0039 D5 module-level singletons locality
- Test count:285(零变化)

## Implementation Outline

```
src/main/
├── mcp-config.ts (deleted)
├── mcp-config.test.ts (deleted)
├── mcp-handshake.ts (deleted)
├── mcp-handshake.test.ts (deleted)
├── mcp-host.ts (deleted)
├── mcp-host.test.ts (deleted)
├── mcp-ipc.ts (deleted)
├── mcp-manager.ts (deleted)
├── mcp-manager.test.ts (deleted)
├── mcp-stdio-transport.ts (deleted)
├── mcp-stdio-transport.test.ts (deleted)
├── mcp-types.ts (deleted)
├── mcp-types.test.ts (deleted)
├── features/
│   ├── ...
│   └── mcp/                                    (NEW directory)
│       ├── mcp-config.ts                       (was src/main/)
│       ├── mcp-config.test.ts                  (was src/main/)
│       ├── mcp-handshake.ts                    (was src/main/)
│       ├── mcp-handshake.test.ts               (was src/main/)
│       ├── mcp-host.ts                         (was src/main/)
│       ├── mcp-host.test.ts                    (was src/main/)
│       ├── mcp-ipc.ts                          (was src/main/)
│       ├── mcp-manager.ts                      (was src/main/)
│       ├── mcp-manager.test.ts                 (was src/main/)
│       ├── mcp-stdio-transport.ts              (was src/main/)
│       ├── mcp-stdio-transport.test.ts         (was src/main/)
│       ├── mcp-types.ts                        (was src/main/)
│       └── mcp-types.test.ts                   (was src/main/)
├── index.ts                                    (2 lines import path changed)
├── ipc.test.ts                                 (2 lines import path changed)
└── ...
```

## Rollout

1 atomic commit on `refactor/mcp-move-to-features` branch (off master `0332f1b`):

```
chore(mcp): move MCP files to features/mcp/ — ADR-0039 D4 directory consistency
```

merge commit `--no-ff` to master。

## Verification gates

合并前:
- `vp run typecheck` → exit 0(typecheck:node + typecheck:web)
- `npm run test:main` → 37 files / 285 passed(零变化)
- `git status` → clean
- 无 `as any` / `@ts-ignore` / `@ts-expect-error` 引入(纯 move 操作)

合并后:
- `git log --oneline master..HEAD` → 单 commit
- `git diff master --stat` → +13 files moves + 11 files import tweaks

## References

- [ADR-0032](./0032-mcp-client-stdio.md) — MCP Client 决策基线
- [ADR-0039](./0039-main-ipc-domain-split.md) — D4 main IPC 模块位置规则
- [ADR-0041](./0041-mcp-module-decomposition.md) — MCP 模块深化决策
- [AGENTS.md](../../AGENTS.md) — 目录布局图(隐式 features/ 约定)+ atomic commit / --no-ff 约束
- `src/main/features/webfetch/` — 路径 depth reference(`../../` to src/main/, `../../../` to src/)