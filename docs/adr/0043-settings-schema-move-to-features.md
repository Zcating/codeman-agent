# 0043 — settings-schema module 移入 features/settings/ 目录(ADR-0039 D4 一致性,Round 2)

- **Status**: accepted
- **Date**: 2026-08-02
- **Scope**: src/main/{settings-schema,settings-schema.test,schemas,defaults,sanitize}.ts (5 files) → src/main/features/settings/
- **Supersedes**: 无
- **Related**:
  - [ADR-0039](./0039-main-ipc-domain-split.md) — main IPC 拆分,D4 锁定 `src/main/features/<domain>/ipc.ts`
  - [ADR-0042](./0042-mcp-move-to-features.md) — MCP 域同型 move(本 ADR 的直接先例)
  - [AGENTS.md](../../AGENTS.md) — 目录布局图(features/ 约定)

## Context

ADR-0042 (2026-08-02) 落地 MCP 13 文件 → `src/main/features/mcp/`。ADR-0042 D 段描述「唯一 outlier:**MCP**」是**不准确**的 — `settings-schema.ts` + 其 3 个支撑文件 (`schemas.ts` / `defaults.ts` / `sanitize.ts`) 同期也散在 `src/main/` 根,与 MCP 同属 ADR-0039 D4 locality 失守。

`features/settings/` 在 ADR-0039 落地时已存在,持有 `state.ts` + `ipc.ts` 两个 module,正好是 settings 域的「runtime」关注点(`SettingsState` class + IPC handlers)。本次 move 落下的 4 文件是该域的「schema」关注点(`Settings` type + `DEFAULT_SETTINGS` + `sanitize()` + types + barrel),与 state/ipc 并列但不耦合:

```
src/main/features/settings/        (pre-ADR-0043)
├── ipc.ts          (runtime: registerSettingsIpc)
├── ipc.test.ts
├── state.ts        (runtime: SettingsState)
└── state.test.ts

src/main/                          (待移动 — schema 关注点)
├── settings-schema.ts   (barrel)
├── settings-schema.test.ts
├── schemas.ts           (SettingStruct + types)
├── defaults.ts          (DEFAULT_SETTINGS)
└── sanitize.ts          (sanitize())
```

外部对 `settings-schema` 的引用全部限于 main-side 3 个文件 (`state.ts` + `state.test.ts` + `ipc.ts`),renderer-side 自有 `features/settings/lib/schemas.ts` 不受影响(见 D-已知缺陷 段)。

## Decision

### D1 — 5 个文件 `git mv` 到 `src/main/features/settings/`

| 原路径 | 新路径 |
| --- | --- |
| `src/main/settings-schema.ts` | `src/main/features/settings/settings-schema.ts` |
| `src/main/settings-schema.test.ts` | `src/main/features/settings/settings-schema.test.ts` |
| `src/main/schemas.ts` | `src/main/features/settings/schemas.ts` |
| `src/main/defaults.ts` | `src/main/features/settings/defaults.ts` |
| `src/main/sanitize.ts` | `src/main/features/settings/sanitize.ts` |

保持文件名原样(per ADR-0042 D1 precedent + 用户确认):barrel 仍叫 `settings-schema.ts`(虽然 `settings-` 前缀在 features/settings/ 内部为冗余,但保持 API surface 不变 + 与 IPC type names / runtime identifier 视觉对齐)。同 MCP 决策:本次只 move 不 rename。

### D2 — 4 处 import 路径调整(depth 缩短)

旧路径 `../../settings-schema` (2 dots) → 新路径 `./settings-schema` (sibling,1 dot)。覆盖:

| 文件 | 行 | 改动 |
| --- | --- | --- |
| `features/settings/state.ts` | L2 | `../../settings-schema` → `./settings-schema` |
| `features/settings/state.test.ts` | L6 | `../../settings-schema` → `./settings-schema` |
| `features/settings/state.test.ts` | L8 (`vi.mock`) | `../../settings-schema` → `./settings-schema` |
| `features/settings/ipc.ts` | L2 | `../../settings-schema` → `./settings-schema` |

共 3 文件 4 行。**depth 缩短** 与 ADR-0042 的 depth 增加方向相反(那里是 `src/main/` → `src/main/features/mcp/`,这里是 `src/main/` → `src/main/features/settings/` 但模块已在 features/settings/ 内部 → 实际是 sibling reference)。

### D3 — `features/settings/` 落地后全景

```
src/main/features/settings/        (post-ADR-0043)
├── defaults.ts             (was src/main/)
├── ipc.ts                  (pre-existing,ADR-0039)
├── ipc.test.ts             (pre-existing,ADR-0039)
├── sanitize.ts             (was src/main/)
├── schemas.ts              (was src/main/)
├── settings-schema.ts      (was src/main/, barrel)
├── settings-schema.test.ts (was src/main/)
├── state.ts                (pre-existing,ADR-0039)
└── state.test.ts           (pre-existing,ADR-0039)

共 9 文件 (4 schema + 4 state/ipc + 1 schema test) — 单一域,
无再 outlier
```

### D4 — 渲染侧未触及(预先已知缺陷,out of scope)

`src/renderer/src/features/settings/lib/schemas.ts` 与待移动的 `src/main/schemas.ts` **同名同概念**(都定义 `ProviderSchema` / `SettingStruct` 等)。这是 **预先存在的设计冗余**(settings schema 在 main + renderer 各实现一份,跨 IPC 边界用 JSON shape 同步),不是本次移动引入。本次只动 main-side,不触及 renderer-side。如要合并需要单独 ADR,讨论跨进程 schema 同步策略(JS object clone vs 共享 src/shared/schema 定义)。

### D5 — 单 atomic commit + `--no-ff` merge

整个 move 是机械操作(0 行为变化,0 public API 变化,barrel surface 完全不变),无中间状态风险。单 atomic commit 落地;merge to master 用 `--no-ff` 满足 AGENTS.md。

**拒绝**:
- A. 多 commit(per-file):5 文件 move 机械操作不需要分多 commit。
- C. rename `settings-schema.ts` → `index.ts` / `schema.ts`:与 codebase 现有风格不一致(mock-server/ + mcp/ 都没有 `index.ts` barrel,使用显式 import)。

## Considered Options

| 选项 | 描述 | 选 / 不选 |
| --- | --- | --- |
| 不动 | 维持 `src/main/{settings-schema,schemas,defaults,sanitize}.ts` 平铺 | 不选 — ADR-0039 D4 locality 失守,5 个文件还是 outlier |
| 只 move barrel | `settings-schema.ts` 单文件 move,其它 3 文件留 root | 不选 — 留下 3 个 stranded files,违反 D4,且 barrel 的 `./schemas` 引用需要改成 `../../schemas`,反而复杂 |
| move 整个 module | 4 文件 + 1 test 一起 move 到 `features/settings/`,无 rename | **选** — 最小 blast radius,机械操作,0 行为变化,与 ADR-0042 同型 |
| move + rename barrel | A + `settings-schema.ts` → `index.ts` | 不选 — codebase 无 `index.ts` barrel 惯例,显式 import 风格更一致 |

## Consequences

### 正面

- **ADR-0039 D4 完全落地**:main-side features 域清单再无 outlier:

```
src/main/features/
├── compaction/        (4 files)
├── conversations/     (4 files)
├── file-ops/          (2 files)
├── mcp/               (13 files, ADR-0042)
├── mock-server/       (12 files)
├── settings/          (9 files, post-ADR-0043)
├── system/            (2 files)
├── webfetch/          (8 files)
└── workspaces/        (4 files)
```

- **Locality 改善**:`features/settings/` 现在覆盖 settings 域全部 9 文件 — runtime (state + ipc) + schema (schemas + defaults + sanitize + barrel)
- **零行为变化**:285 测试全过,公共 API 100% 不变(`Settings` / `Provider` / `DEFAULT_SETTINGS` / `sanitize()` exports 完整保留)
- **IPC contracts 100% 不变**:settings:* channels 不变
- **比 ADR-0042 MCP 移动更干净**:depth 缩短(2 dots → 1 dot)而非增加,且外部 import 改动只有 4 行(MCP 11 行)

### 负面 / 代价

- **4 处 import 路径调整**:`state.ts` × 1 + `state.test.ts` × 2 + `ipc.ts` × 1 — depth 缩短
- **单 commit diff 中等**:5 文件 moves + 3 文件 import tweaks = 单 commit ~10 lines diff

### 不变

- 公共 API 100% 不变(barrel exports 完全相同)
- IPC contracts 100% 不变(settings:* channels)
- 测试数 285(零变化)
- settings 域运行时关注点(state + ipc + IPC schema)完全不变
- renderer-side `features/settings/lib/`(已知缺陷,本 ADR 不修)

## Implementation Outline

```
src/main/                                  src/main/
├── settings-schema.ts (deleted)    →      features/settings/
├── settings-schema.test.ts (deleted) →    ├── defaults.ts (renamed)
├── schemas.ts (deleted)             →     ├── ipc.ts (unchanged)
├── defaults.ts (deleted)            →     ├── ipc.test.ts (unchanged)
├── sanitize.ts (deleted)            →     ├── sanitize.ts (renamed)
└── (no other src/main/ settings files)    ├── schemas.ts (renamed)
                                           ├── settings-schema.ts (renamed)
                                           ├── settings-schema.test.ts (renamed)
                                           ├── state.ts (1 line import)
                                           └── state.test.ts (2 lines import)
```

## Rollout

1 atomic commit on `refactor/settings-schema-move` branch (off master `6668407`):

```
chore(settings): move settings-schema module to features/settings/ — ADR-0039 D4 round 2
```

merge commit `--no-ff` to master。

## Verification gates

合并前:
- `vp run typecheck` → exit 0(typecheck:node + typecheck:web)
- `npm run test:main` → 37 files / 285 passed(零变化)
- `git status` → clean
- 无 `as any` / `@ts-ignore` / `@ts-expect-error` 引入

合并后:
- `git log --oneline master..HEAD` → 单 commit
- `git diff master --stat` → 5 文件 moves + 3 文件 import tweaks

## References

- [ADR-0039](./0039-main-ipc-domain-split.md) — D4 main IPC 模块位置规则
- [ADR-0042](./0042-mcp-move-to-features.md) — MCP 同型 move 先例(D1 文件名保留 + 用户 Option A 确认)
- [AGENTS.md](../../AGENTS.md) — 目录布局图(features/ 约定)+ atomic commit / --no-ff 约束