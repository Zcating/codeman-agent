# 0044 — Skills fs 侧代码移入 main/features/skills/(主进程依赖方向修正)

- **Status**: accepted
- **Date**: 2026-08-02
- **Scope**: src/renderer/src/plugins/skills/lib/{skill-loader,skill-loader.test,skill-loader-schema}.ts → src/main/features/skills/lib/
- **Supersedes**: 无 — 与 / 互补(它们修 features/ locality,本 ADR 修 **main→renderer 反身依赖**)
- **Related**:
  -  — D4 main IPC 模块位置规则(features/)
  -  — MCP 域同型 move(直接先例)
  -  — settings-schema 域同型 move
  - [AGENTS.md](../../AGENTS.md) — 目录布局(features/ 约定)

## Context

ADR-0042 + 已将 MCP / settings-schema 域统一进 `src/main/features/<domain>/`。但**本次 move 揭示了一类新问题**:main-side 文件从 renderer-side 源码树导入。

发现路径:用户 review `src/main/skills-host.ts` 时注意到:

```ts
import {
  loadSkillContent,
  scanSkillsDir,
} from "../renderer/src/plugins/skills/lib/skill-loader";  // ← 主进程摸到渲染层源码树
```

Electron 主进程不应该依赖渲染层源码。这种相对路径能编译过是因为 `tsconfig.node.json` 也定义了 `@codeman-frontend/*` 别名指向 `./src/renderer/src/*` —— **这是个 band-aid,把架构违例藏起来了**。

`loadSkillContent` / `scanSkillsDir` / `parseFrontmatter` 都是纯 fs / 字符串操作(Effect-TS + `node:fs/promises`),**全代码库 runtime 调用方只有 1 处**:`src/main/skills-host.ts` 通过 IPC handler (`skillsScan` / `skillsLoad`)。renderer 侧只通过 `skills.store` / `skill-injector` 等拿到数据,**不直调 fs**。

→ 这些 fs 侧代码本来就属于 main,只是历史遗留位置在 renderer。

## Decision

### D1 — 3 个文件 `git mv` 到 `src/main/features/skills/lib/`

| 原路径 | 新路径 |
| --- | --- |
| `src/renderer/src/plugins/skills/lib/skill-loader.ts` | `src/main/features/skills/lib/skill-loader.ts` |
| `src/renderer/src/plugins/skills/lib/skill-loader.test.ts` | `src/main/features/skills/lib/skill-loader.test.ts` |
| `src/renderer/src/plugins/skills/lib/skill-loader-schema.ts` | `src/main/features/skills/lib/skill-loader-schema.ts` |

**保持文件名原样**(per + precedent + 用户确认「只 move」):`skill-loader.ts` 仍叫 `skill-loader.ts`,`skill-loader-schema.ts` 仍叫 `skill-loader-schema.ts`(虽然 `skill-` 前缀在 features/skills/ 内部为冗余,但保持 API surface 不变)。rename 留作未来 follow-up。

### D2 — `src/main/skills-host.ts` 改 1 行 import

```ts
// before
import {
  loadSkillContent,
  scanSkillsDir,
} from "../renderer/src/plugins/skills/lib/skill-loader";

// after
import {
  loadSkillContent,
  scanSkillsDir,
} from "./features/skills/lib/skill-loader";
```

第 10 行的 type import 保留:
```ts
import type { SkillManifest } from "../renderer/src/shared/lib/types";  // 不变
```
理由:类型归属问题(out of scope,见 D-已知缺陷);本次只修 fs 代码位置,不修类型归属。

### D3 — 渲染层 4 处 import 路径调整

schema 文件 move 后,renderer 侧 4 个文件原本 import 该 schema 的路径失效:

| 文件 | 行 | 改动 |
| --- | --- | --- |
| `src/renderer/src/plugins/skills/index.ts` | L1-2 | 删 `scanSkillsDir`/`loadSkillContent`/`parseFrontmatter` re-export;L2 类型 re-export 改源 |
| `src/renderer/src/plugins/skills/lib/skill-injector.ts` | L1 | `SkillManifest` 类型源:`@codeman-frontend/plugins/skills/lib/skill-loader-schema` → `@codeman-frontend/shared/lib/types` |
| `src/renderer/src/plugins/skills/lib/skill-injector.test.ts` | L4 | 同上 |
| `src/renderer/src/plugins/skills/stores/skills.store.test.ts` | L14 | 同上 |

类型 re-export 的 canonical 源选 `@codeman-frontend/shared/lib/types`(原 schema 文件也是从这里 import + re-export 类型),消除多级间接。

**renderer barrel `index.ts` 保留**。原文件 re-export 函数 + 类型;函数那行删除(types re-export 留下,改源)。整个 barrel 当前在代码库中**没有任何 importer**(grep `@codeman-frontend/plugins/skills` barrel = 0 命中),属于 pre-existing dead code,按 AGENTS.md 「无关死代码提一嘴就行,别删」规则保留文件结构,只删函数 re-export 行(由本次 move 强制的改动)。

### D4 — moved 文件内部 import 调整

`src/main/features/skills/lib/` 内文件 import 同级文件:`./skill-loader-schema` / `./skill-loader`(原 `@codeman-frontend/plugins/skills/lib/skill-loader-schema` 别名失效,因为该路径在 renderer 侧已不存在)。

### D5 — 单 atomic commit + `--no-ff` merge

整个 move 是机械操作(0 行为变化,0 public API 变化),单 atomic commit 落地;merge to master 用 `--no-ff` 满足 AGENTS.md。

## 落地后全景

```
src/main/features/skills/                  (post-ADR-0044)
├── lib/
│   ├── skill-loader.ts                    (was src/renderer/...)
│   ├── skill-loader.test.ts               (was src/renderer/...)
│   └── skill-loader-schema.ts             (was src/renderer/...)
└── (后续可加 ipc.ts / sandbox 等)

src/renderer/src/plugins/skills/           (保留渲染侧 plugin 入口)
├── index.ts                               (只 re-export 类型,无函数)
├── lib/
│   ├── skill-injector.ts                  (渲染侧专属,formatter)
│   ├── skill-injector.test.ts
│   └── skill-meta-tool.ts                 (渲染侧专属,LLM tool config)
└── stores/
    ├── skills.store.ts                    (渲染侧专属)
    └── skills.store.test.ts
```

## Considered Options

| 选项 | 描述 | 选 / 不选 |
| --- | --- | --- |
| 不动 | 维持 `src/renderer/.../skill-loader` + main 跨边界 import | 不选 — 架构违例未修,tsconfig band-aid 掩盖 |
| 只 move(本次) | 3 文件 move + 1 行 import + 4 处渲染层路径调整 | **选** — 直接答用户问题,最小 blast radius |
| move + rename 去 `skill-` 前缀 | A + `skill-loader.ts` → `loader.ts` 等 | 不选(本次)— 用户确认选项 A,rename 留作未来 |
| 引入 `src/shared/` | move + 同步修 `jsonrpc.ts` cross-boundary import + 改 tsconfig.node.json 别名 | 不选(本次)— scope 翻倍,作为 follow-up |

## Consequences

### 正面

- **主进程依赖方向修正**:`src/main/skills-host.ts` 不再 import renderer 源码树
- **fs 侧代码归属清晰**:scanner / loader / schema 归 main;store / injector / meta-tool 归 renderer
- **IPC 边界自然**:renderer 拿到 `SkillManifest[]` 是经 IPC 来的纯数据,不再需要 import 任何 main-side fs 代码
- **可发现性提升**:`grep "scanSkillsDir\|loadSkillContent"` 现在只在 `src/main/features/skills/` 命中
- **285 → 303 测试**:skill-loader.test.ts 从 web 项目(因 jest-dom env 问题在 web 项目失败)移到 main 项目,18 个原本 broken 的测试现在通过。**净 +18**

### 负面 / 代价

- **`@codeman-frontend/*` 别名还在 `tsconfig.node.json`**:本次未删除,因为 main 仍需通过该别名 import `@codeman-frontend/shared/lib/types`(类型归属问题未解)。见 D-已知缺陷
- **类型源迁移**:3 个 renderer 文件 + 1 个 barrel 的 `SkillManifest` import 改从 `@codeman-frontend/shared/lib/types` 而非经 schema 中转

### 不变

- `SkillManifest` / `SkillFrontmatter` / `SkillSource` 仍在 `src/renderer/src/shared/lib/types.ts`(类型归属 out of scope)
- `@codeman-frontend/*` 别名同时存在于 tsconfig.node.json + tsconfig.web.json(本次未删)
- `src/main/jsonrpc.ts` + `src/main/jsonrpc.test.ts` 的 cross-boundary import 仍未修(同类型问题,见)
- `src/main/skills-host.ts` L10 的 `SkillManifest` 类型 import 路径仍指向 `../renderer/src/shared/lib/types`(本次未修)
- 公共 API 100% 不变
- IPC contracts 100% 不变(`skillsScan` / `skillsLoad` channels)

## 已知缺陷(已识别,本次未修)

### 类型归属问题

`SkillManifest` / `SkillFrontmatter` / `SkillSource` 类型定义在 `src/renderer/src/shared/lib/types.ts`,但本次 move 后:

- main 侧 `skill-loader.ts` + `skill-loader-schema.ts` 通过 `@codeman-frontend/shared/lib/types` 别名消费(别名定义在 tsconfig.node.json,指向 `./src/renderer/src/*`)
- 3 个 renderer 文件改从同一个别名消费

→ 类型实际**定义在 renderer 侧,但被 main + renderer 共同消费**。正确的归属应是 `src/shared/lib/types.ts`(真正跨 main/renderer 共享的类型)。本次 move 暴露了这个 smell 但不修。

### `src/main/jsonrpc.ts` 同型 cross-boundary import

grep `from "../renderer/"` 在 `src/main/` 范围内命中 4 处,其中 3 处是本次修的 skills-host.ts 相关,**剩 1 处未修**:

```ts
// src/main/jsonrpc.ts:2  (与 skills-host.ts L10 同型)
import { JsonRpcProtocolError, JsonRpcTimeoutError } from "../renderer/src/shared/lib/errors";

// src/main/jsonrpc.test.ts:5  (测试侧)
import { JsonRpcProtocolError, JsonRpcTimeoutError } from "../renderer/src/shared/lib/errors";
```

`JsonRpcProtocolError` / `JsonRpcTimeoutError` 是 IPC 错误,被 main + renderer 共同消费(`@codeman-frontend/shared/lib/errors` 别名),但定义在 renderer 侧。

→ 类型归属问题的同型实例。本次未修。

## Rollout

1 atomic commit on `refactor/skills-move-to-features` branch (off master `0f59fbb`):

```
chore(skills): move skill-loader to features/skills/ — fix main→renderer cross-boundary import
```

merge commit `--no-ff` to master。

## Verification gates

合并前:
- `vp run typecheck` → exit 0(typecheck:node + typecheck:web)
- `rtk npm run test:main` → 38 files / 303 passed(285 baseline + 18 from moved test)
- `git status` → clean
- 无 `as any` / `@ts-ignore` / `@ts-expect-error` 引入(纯 move 操作)

合并后:
- `git log --oneline master..HEAD` → 单 commit
- `grep "from ['\"]\.\./renderer/" src/main/` → 仅剩 `jsonrpc.ts` + `jsonrpc.test.ts` + `skills-host.ts:10`(type import),前两者归,后者已知缺陷
- `grep "scanSkillsDir\|loadSkillContent\|parseFrontmatter" src/renderer/` → 0 命中(fs 函数全部在 main)

## Follow-up(明确不属于本次)

- **ADR-0045**:引入 `src/shared/`(或 `src/main/shared/`)真正跨 main+renderer 共享目录,搬 `SkillManifest` / `SkillFrontmatter` / `SkillSource` / `JsonRpcProtocolError` / `JsonRpcTimeoutError` / `NotFound` / `InvalidConfig` / `Unknown` 等类型;删除 `tsconfig.node.json` 的 `@codeman-frontend/*` 别名;修 `src/main/jsonrpc.ts` + `src/main/jsonrpc.test.ts` + `src/main/skills-host.ts:10` 的 3 处 type import
- **未来 rename**:`features/skills/lib/skill-loader.ts` → `loader.ts`,`skill-loader-schema.ts` → `schema.ts`,对齐 `features/mock-server/` 命名风格(`cors.ts` / `sse.ts` / `request-parser.ts` 无 `mock-server-` 前缀)

## References

-  — D4 main IPC 模块位置规则
-  — MCP 域同型 move(直接先例)
-  — settings-schema 域同型 move
- [AGENTS.md](../../AGENTS.md) — features/ 目录约定 + atomic commit / --no-ff 约束