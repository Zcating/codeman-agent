# 0045 — skills-host.ts 拆分为 features/skills/ipc.ts + skills-host.ts(完成 ADR-0039 D4 全集落地)

- **Status**: accepted
- **Date**: 2026-08-02
- **Scope**: `src/main/skills-host.ts` → `src/main/features/skills/{ipc,skills-host}.ts`(2 新文件 + 删 1 旧文件)+ `src/main/index.ts` 2 行 + `src/main/ipc.test.ts` 加 2 channel + mock 调用
- **Supersedes**: 无 — 续 ADR-0044(它修了 fs 侧 cross-boundary,本 ADR 修 D4 IPC 文件位置)
- **Related**:
  - [ADR-0039](./0039-main-ipc-domain-split.md) — D4 main IPC 模块位置规则(`features/<domain>/ipc.ts`)
  - [ADR-0044](./0044-skills-move-to-features.md) — skills fs 侧同型 move(本 ADR 的直接上半截)
  - [ADR-0042](./0042-mcp-move-to-features.md) / [ADR-0043](./0043-settings-schema-move-to-features.md) — features/ locality 同型先例
  - [AGENTS.md](../../AGENTS.md) — features/ 目录约定 + atomic commit / --no-ff 约束

## Context

ADR-0044 (2026-08-02) 把 skills **fs 侧代码** (`skill-loader.ts` / `skill-loader.test.ts` / `skill-loader-schema.ts`) 搬到 `src/main/features/skills/lib/`,消除了 main→renderer cross-boundary import smell。但该 ADR §Known Issues 显式标注了一件事未做:

> `src/main/skills-host.ts` 仍在 `src/main/` 根,违反 ADR-0039 D4 ("所有 6 个 register 函数位于 `src/main/features/<domain>/ipc.ts`")。

ADR-0039 D4 是 main-side features locality 的总规则,5 域(settings / conversations / workspaces / file-ops / system / webfetch) + MCP 早先已落地。skills 是最后一个 outlier。**本次 ADR 关闭这个最后的 gap,让 ADR-0039 D4 在 main-side 8 个域全集满足**(settings / conversations / workspaces / file-ops / system / webfetch / mcp / **skills**)。

### 当前状态(pre-ADR-0045)

```
src/main/
├── skills-host.ts                       ← 78L,4 关注点混在一起,违反 ADR-0039 D4
├── index.ts                             ← L10 import + L130 registerSkillHandlers()
├── ipc.test.ts                          ← EXPECTED_CHANNELS = 38,**不含** skillsScan/skillsLoad
└── features/skills/
    └── lib/                             ← (ADR-0044 已就位)
        ├── skill-loader.ts
        ├── skill-loader.test.ts
        └── skill-loader-schema.ts
```

`src/main/skills-host.ts` 内容(78 行,4 关注点):

| 关注点 | 函数 / 行 | 性质 |
| --- | --- | --- |
| IPC register | `registerSkillHandlers()` (skillsScan + skillsLoad) L67-78 | **IPC** |
| IPC wrappers | `listSkills()` / `readSkillFile(name)` L26-32 | IPC-facing,被 register 调 |
| Path helpers | `getSkillsDir()` / `getPreinstalledDir()` / `getBundledDir()` L13-23 | 共享 |
| Boot 一次性 | `ensurePreinstalledSkills()` L35-64 | **非 IPC**(bundled → user dir 复制) |

### 触发:用户 review `skills-host.ts` 路径

ADR-0044 落地后用户指出:「按 0039 模式,应该新增 features/skills」。本次 ADR 直接答这个问题:不只 move(ADR-0044 已做),还要把 register 函数挪到 ADR-0039 D4 字面要求的 `ipc.ts` 位置。

## Decision

7 个相互依赖的决定,单 atomic commit 落地。

### D1 — 拆 2 文件:`features/skills/ipc.ts` + `features/skills/skills-host.ts`

| 文件 | 内容 | 行数 |
| --- | --- | --- |
| `src/main/features/skills/ipc.ts` (NEW) | `registerSkillsIpc()` 函数(2 handlers) | ~14 |
| `src/main/features/skills/skills-host.ts` (was `src/main/skills-host.ts`) | 3 path helpers + `listSkills` / `readSkillFile` / `ensurePreinstalledSkills` | ~64 |
| `src/main/skills-host.ts` (DELETED) | — | 0 |

**理由**:
- ADR-0039 D4 字面要求 register 函数位于 `<domain>/ipc.ts`,且 5 域均严格遵循
- `ensurePreinstalledSkills()` 是 boot 一次性任务,**非 IPC**,塞进 `ipc.ts` 名不副实
- 拆分对齐 MCP precedent: `features/mcp/mcp-ipc.ts`(register 只调 `McpManager`)+ `mcp-manager.ts`(业务)
- 78 行拆 2 个而非 3 个,符合 AGENTS.md 「简单优先 / 不做投机性抽象」
- 文件名 `skills-host.ts` 保留(per ADR-0042 D1 + ADR-0044 D1 precedent:rename 留作未来)

**拒绝**:
- A. 不拆单文件 `features/skills/skills-host.ts`:违背 ADR-0039 D4 字面,register 函数不在 `ipc.ts`
- C. 拆 3 个(`ipc.ts` + `paths.ts` + `boot.ts`):78 行拆 3 个过度,AGENTS.md 「简单优先」否决

### D2 — register 函数命名:`registerSkillsIpc()`

```ts
// src/main/features/skills/ipc.ts
export function registerSkillsIpc(): void {
  ipcMain.handle("skillsScan", async () => await listSkills());
  ipcMain.handle("skillsLoad", async (_event, args: { name: string }) => {
    const name = args?.name;
    if (typeof name !== "string" || name.length === 0) {
      throw new Error("skillsLoad: name required");
    }
    return await readSkillFile(name);
  });
}
```

**命名依据**:
- 对齐 ADR-0039 5 域命名: `registerSettingsIpc` / `registerConversationsIpc` / `registerFileOpsIpc` / `registerSystemIpc` / `registerWebfetchIpc`
- 与 D1 锁定的文件名 `ipc.ts` 视觉一致
- `registerSkillsIpc()` 无 deps 参数(对齐 `registerSystemIpc({ getMainWindow })` 的 zero-deps 简化形态,因为 skills IPC 无 module-level state,所有路径从 `app.getPath` 取)

**拒绝**:
- A. `registerSkillsIpcHandlers()`(对齐 MCP `registerMcpIpcHandlers` 后缀):MCP 是 pre-ADR-0039 历史遗留命名,5 域正文惯例是 `...Ipc`
- B. 保留 `registerSkillHandlers()`(零改名):失去 ADR-0039 D4 字面对齐

### D3 — 调用方式:直接调(对齐 MCP precedent),不走 `registerIpcHandlers` barrel

`src/main/index.ts` boot sequence(per ADR-0039 D9):

```ts
// before
import { ensurePreinstalledSkills, registerSkillHandlers } from "./skills-host";
// ...
registerSkillHandlers();  // L130

// after
import { ensurePreinstalledSkills } from "./features/skills/skills-host";
import { registerSkillsIpc } from "./features/skills/ipc";
// ...
registerSkillsIpc();  // L130 (rename only)
```

`ensurePreinstalledSkills()` 调用点(L133-135)不变,只 import 路径调整。

**调用方式依据**:
- MCP precedent: `registerMcpIpcHandlers(mcpManager)` 在 `index.ts:138` 直接调,**不走** `registerIpcHandlers({ getMainWindow })` barrel
- skills 选择对齐 MCP 而非 ADR-0039 5 域的 barrel 编排
- 调用方式(直接调 / 走 barrel)和文件位置(`ipc.ts` / `mcp-ipc.ts`)是两个正交维度——skills 在「文件位置」上对齐 ADR-0039,在「调用方式」上对齐 MCP

**拒绝**:
- A. 走 `registerIpcHandlers` barrel:要求 `registerSkillsIpc` 接 `getMainWindow` deps,实际不用(per ADR-0039 Add-3 「getMainWindow 为死参数」),会引入死参数
- C. barrel + index.ts 双调:会注册 2 次 handler,违背 IPC 单注册原则

### D4 — `src/main/ipc.test.ts` 集成测试补盲区(channel 38 → 40)

#### D4.1 — EXPECTED_CHANNELS 末尾加 2 个

```ts
const EXPECTED_CHANNELS = [
  // ... (现有 38 个不变)
  "skillsScan",   // NEW
  "skillsLoad",   // NEW
];
```

测试名 + 描述更新:`"registers all 38 expected"` → `"registers all 40 expected"`。

#### D4.2 — 测试用例加 mock 调用 `registerSkillsIpc()`

```ts
// src/main/ipc.test.ts L105 块
it("registers all 40 expected ipcMain.handle channels", async () => {
  const { registerIpcHandlers } = await import("./ipc.js");
  const { McpManager } = await import("./features/mcp/mcp-manager.js");
  const { registerMcpIpcHandlers } = await import("./features/mcp/mcp-ipc.js");
  const { registerSkillsIpc } = await import("./features/skills/ipc.js");  // NEW
  registerIpcHandlers({ getMainWindow: () => fakeWin as any });
  registerMcpIpcHandlers(new McpManager());
  registerSkillsIpc();  // NEW — 对齐 MCP L107-110 直接调补 channel 的模式
  const channels = fakeIpcMain.handle.mock.calls.map((c) => c[0]);
  expect(channels).toEqual(expect.arrayContaining(EXPECTED_CHANNELS));
  expect(channels.length).toBe(EXPECTED_CHANNELS.length);  // 40 === 40
});
```

**依据**:
- MCP precedent (ipc.test.ts L107-110):虽然 MCP 从 `index.ts` 直接调,但 `ipc.test.ts` 单独 mock 调用 `registerMcpIpcHandlers(new McpManager())` 补 channel
- skills 走 D3 「直接调」,同样需要 ipc.test.ts 单独 mock 调用 `registerSkillsIpc()`
- 测试环境已 mock `app.getPath`(`fakeApp.getPath.mockReturnValue("/tmp/codeman-agent-test")`),register 时 handler 不立即执行,fs 操作不会发生,安全

**补盲区意义**:
- pre-existing:`skillsScan` / `skillsLoad` 从未被任何测试断言过
- post-ADR-0045:这 2 个 channel 进入 EXPECTED_CHANNELS,ipc.test.ts 失败 = skills IPC 注册丢失的回归护栏

### D5 — skills-host.ts 内部 import 路径深度调整

`src/main/features/skills/skills-host.ts` 从 `src/main/skills-host.ts` move 进来后,line 3 的 `app.getPath` 不变,line 10 的类型 import 路径深度需要调整(文件位置深度从 1 层 `src/main/` → 3 层 `src/main/features/skills/`,所以相对路径 +2):

```ts
// before (src/main/skills-host.ts:10)
import type { SkillManifest } from "../renderer/src/shared/lib/types";

// after (src/main/features/skills/skills-host.ts:10)
import type { SkillManifest } from "../../../renderer/src/shared/lib/types";  // depth +2
```

### D6 — 不新增 `features/skills/ipc.test.ts`(对齐 MCP precedent)

`registerSkillsIpc()` 仅 2 行 `ipcMain.handle`,**无 handler 行为逻辑可单测**(handler 内部就是 `return await listSkills()` / `return await readSkillFile(name)`,已 100% 在 `src/main/features/skills/lib/skill-loader.test.ts` 覆盖)。MCP precedent:无 `features/mcp/mcp-ipc.test.ts`,只靠 `ipc.test.ts` 集成覆盖。skills 保持一致。

**拒绝**:
- B. 新建 `features/skills/ipc.test.ts`:与 MCP 不一致 + 无可测业务逻辑(违反 AGENTS.md 「简单优先 / 不做投机性编码」)
- 备用 B. 给 register 函数加 mock test:是**新设计**而非「拆文件」的范畴,超出本 ADR

### D7 — 单 atomic commit + `--no-ff` merge(per AGENTS.md)

整个 move + 拆分 + 测试盲区修复是机械操作(0 行为变化,channel 名不变,handler body 不变),单 atomic commit 落地;merge to master 用 `--no-ff` 满足 AGENTS.md。

## Considered Options

| 选 | 描述 | 选 / 不选 |
| --- | --- | --- |
| 不动 | 维持 `src/main/skills-host.ts` | 不选 — ADR-0039 D4 locality 失守,skills 是最后一个 outlier |
| 只 move(ADR-0044 已做) | 只搬 fs 侧 lib/ | 不选 — IPC 文件仍在 root,未完成 D4 |
| move + 拆分(本 ADR) | D1-D7 全套: 拆 2 文件 + register 命名 + 直接调 + ipc.test.ts 补盲 + 单 commit | **选** — 完成 ADR-0039 D4 全集落地 |
| move + 拆分 + 走 barrel | 本 ADR + 把 `registerSkillsIpc` 加入 `registerIpcHandlers` 编排 | 不选 — 死参数 `getMainWindow`(per ADR-0039 Add-3),打破 MCP precedent 一致性 |

## Consequences

### 正面

- **ADR-0039 D4 全集满足**:main-side 8 域全部在 `features/<domain>/`(settings / conversations / workspaces / file-ops / system / webfetch / mcp / **skills**)
- **架构层 cross-boundary smell 全清**:ADR-0044 (fs 侧) + 本 ADR (IPC 文件位置),main→renderer 反身依赖全部清除
- **测试盲区关闭**:`EXPECTED_CHANNELS` 38 → 40,`skillsScan` / `skillsLoad` 首次进入回归护栏
- **locality 最大化**:`features/skills/` 现在 = `ipc.ts`(register)+ `skills-host.ts`(业务)+ `lib/`(fs scanner),关注点全聚一域
- **0 行为变化**:公共 API 100% 不变,IPC handler 名 `skillsScan` / `skillsLoad` 不变(per ADR-0026 channel 锁定),handler body 1:1 搬移

### 负面 / 代价

- **新文件 1 个**:`features/skills/ipc.ts`(~14 行)
- **改文件 3 个**:`features/skills/skills-host.ts`(删 register fn)+ `index.ts`(2 行 import + 函数 rename)+ `ipc.test.ts`(EXPECTED_CHANNELS +2 + mock 调用)
- **删文件 1 个**:`src/main/skills-host.ts`(内容已搬)
- **测试断言更新**:`ipc.test.ts` L105 测试名 "38 → 40",描述微调
- **index.ts boot sequence 1 处函数 rename**:`registerSkillHandlers()` → `registerSkillsIpc()`(rename-only,不影响外部行为)

### 不变

- `skillsScan` / `skillsLoad` channel 名(per ADR-0026 锁定)
- IPC handler arg types / return types
- `ensurePreinstalledSkills()` 调用点(`index.ts:133-135`)
- `registerMcpIpcHandlers` / `registerSettingsIpc` 等其他域 register 函数
- `src/main/ipc.ts` barrel(不参与本 ADR)
- `src/main/features/skills/lib/`(ADR-0044 已就位)
- 测试计数 303 → 303(本 ADR 不新增 test case,只更新 `EXPECTED_CHANNELS` 列表 — 285 → 303 是 ADR-0044 的 delta,本 ADR 不变)

## 已知缺陷(从 ADR-0044 继承,本 ADR 不修)

### K1 — `SkillManifest` 类型归属

`SkillManifest` / `SkillFrontmatter` / `SkillSource` 定义在 `src/renderer/src/shared/lib/types.ts`,但:
- main 侧 `features/skills/skills-host.ts` 通过 `@codeman-frontend/shared/lib/types` 别名消费(别名定义在 `tsconfig.node.json`,指向 `./src/renderer/src/*`)
- 3 个 renderer 文件改从同一个别名消费(ADR-0044 D3)

→ 类型**定义在 renderer 侧,被 main + renderer 共同消费**。正确归属应是 `src/shared/lib/types.ts`(真正跨 main+renderer 共享)。本 ADR 沿用 ADR-0044 不修策略(用户确认 type ownership 留作未来 ADR)。

### K2 — `src/main/jsonrpc.ts` 同型 cross-boundary type import

```ts
// src/main/jsonrpc.ts:2
import { JsonRpcProtocolError, JsonRpcTimeoutError } from "../renderer/src/shared/lib/errors";
// src/main/jsonrpc.test.ts:5  同上
```

`JsonRpcProtocolError` / `JsonRpcTimeoutError` 是 IPC 错误,被 main + renderer 共同消费,但定义在 renderer 侧。本 ADR 不修。

### K3 — `tsconfig.node.json` 的 `@codeman-frontend/*` 别名

K1 + K2 不修,`tsconfig.node.json` 的 `@codeman-frontend/*` 别名就还在(用于 main 通过别名访问 renderer 侧 shared 类型)。本 ADR 不删。

### K4 — `features/skills/skills-host.ts:10` 类型 import 路径深度+1

ADR-0044 已在文件中改过相对路径。本次 D5 让该 import 深度再加一层(`../renderer/...` → `../../renderer/...`),**类型归属未变**(仍在 renderer)。K1 不修的话,深度会随 features/ 嵌套层级递增。本 ADR 不修。

## Rollout

1 atomic commit on `refactor/skills-ipc-split` branch (off master `a92be73`,本 session 已 merge 的 `refactor/skills-move-to-features` 之后):

```
refactor(skills): split skills-host.ts into ipc.ts + skills-host.ts — complete ADR-0039 D4 for skills
```

merge commit `--no-ff` to master。

## Verification gates

合并前:
- `vp run typecheck` → exit 0(typecheck:node + typecheck:web)
- `rtk npm run test:main` → 38 files / 303 passed(基线不变,本 ADR 不新增 test case)
- `rtk npm run test` → ipc.test.ts L105 注册 40 channel 断言通过(`channels.length === EXPECTED_CHANNELS.length`)
- `git status` → clean
- 无 `as any` / `@ts-ignore` / `@ts-expect-error` 引入(纯 move + split 操作)

合并后:
- `git log --oneline master..HEAD` → 单 commit
- `git diff master --stat` → +1 文件 + 3 文件改动 + -1 文件
- `grep "from ['\"]\.\./renderer/" src/main/` → 仅剩 `jsonrpc.ts` + `jsonrpc.test.ts` 2 处(K2 已知缺陷)
- `grep "skillsScan\|skillsLoad" src/main/ipc.test.ts` → 命中 EXPECTED_CHANNELS + mock 调用

## Follow-up(明确不属于本 ADR)

- **ADR-0046**:引入 `src/shared/`,搬 `SkillManifest` / `SkillFrontmatter` / `SkillSource` / `JsonRpcProtocolError` / `JsonRpcTimeoutError` / `NotFound` / `InvalidConfig` / `Unknown` 等真正跨 main+renderer 共享类型;删除 `tsconfig.node.json` 的 `@codeman-frontend/*` 别名;修 `jsonrpc.ts` + `jsonrpc.test.ts` 类型 import + skills-host.ts:10 路径。完成 K1+K2+K3+K4 全部 closure。
- **未来 rename**:`features/skills/skills-host.ts` → `host.ts`,对齐 `features/mock-server/` 命名风格(`cors.ts` / `sse.ts` / `request-parser.ts` 无 `mock-server-` 前缀)。

## References

- [ADR-0026](./0026-electron-persistence-and-ipc-channel-camelcase.md) — IPC channel camelCase 锁定(本 ADR 保持 `skillsScan` / `skillsLoad`)
- [ADR-0039](./0039-main-ipc-domain-split.md) — D4 main IPC 模块位置规则(本 ADR 的总依据)
- [ADR-0042](./0042-mcp-move-to-features.md) — MCP 域同型 move(直接先例)
- [ADR-0043](./0043-settings-schema-move-to-features.md) — settings-schema 域同型 move
- [ADR-0044](./0044-skills-move-to-features.md) — skills fs 侧同型 move(直接上半截)
- [AGENTS.md](../../AGENTS.md) — features/ 目录约定 + atomic commit / --no-ff 约束