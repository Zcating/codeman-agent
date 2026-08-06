# 0039 — Main IPC domain split: per-domain IpcDeps + shared sandboxHandler + state locality

- **Status**: accepted
- **Date**: 2026-08-01
- **Scope**: codeman-agent V3.x main process IPC layer (`src/main/`)
- **Supersedes**: 无 — 纯结构性 refactor
- **Related**:
  - [ADR-0010](./0010-frontend-5-1-folder-whitelist.md) — renderer 侧 5+1 → 6+1 域拆分精神
  - [ADR-0026](./0026-electron-persistence-and-ipc-channel-camelcase.md) — IPC channel camelCase rename
  - [ADR-0019](./0019-per-run-transient-agent.md) — `chat.store.ts` Store = single source of truth
  - `src/main/ipc.ts` — 当前 526 行 / 29 handlers / 6 隐式域
  - `src/main/ipc.test.ts` — 当前 287 行 / 35 channel 注册验证
  - `src/main/index.ts` — boot sequence 调用 `registerIpcHandlers({ getMainWindow })`
  - `src/main/mcp-ipc.ts` — MCP 已按 `registerMcpIpcHandlers(mcpManager)` 模式拆分（precedent）

## Context

`src/main/ipc.ts` 是 main process 中最大的单点集中：526 行 / 29 个 `ipcMain.handle` 调用，覆盖 6 个隐式域（settings ×3 / conversations ×7 / messages ×3 / workspaces ×5 / file I/O ×5 / system ×6）外加 1 个 webfetch handler。

文件级有 3 个模块级单例：

| 单例                | 用途                                       | 用户           |
| ------------------- | ------------------------------------------ | -------------- |
| `settingsCache`     | `loadSettings` / `saveSettings` / `updateSettings` | 3 个 settings handlers |
| `abortControllers`  | 取消 in-flight webfetch 请求                | 1 个 webfetch handler   |
| `dbReady`           | `dbInit()` 幂等 guard                       | 全部 29 个 handlers     |

还有：

- `sandboxHandler` — 把 `AppError` 序列化为 IPC error response 的 try/catch 包装（出现在多处 inline）
- 3 个 inline row mapper：`toConversation` / `toMessage` / `toWorkspace`（在文件作用域）

`src/main/ipc.test.ts` 是一个 287 行的集成测试，验证 35 个 channel（29 + 6 MCP）全部注册。

### 痛点

1. **Bouncing**：理解一个 handler（如 `updateSettings`）需要读整个 526 行文件，无法定位到相关逻辑
2. **Leaky seam**：module-level 单例（`settingsCache`）让 settings handlers 隐式依赖未声明的全局状态，无法独立测试
3. **Hidden duplication**：6 个域每个都隐式依赖 `dbInit()` / `settingsCache` 的初始化时机
4. **Hard-to-test**：register 函数接受 `{ getMainWindow }` 但 `dbInit` / `settingsCache` 不能 mock — 单元测试需要 spin up 整个 ipc.ts
5. **ADR-0010 不对称**：renderer 侧已按 features/ 域拆分，main 侧仍 monolithic

### 现存 precedent

`src/main/mcp-ipc.ts` 已按此模式拆分（20 行）：

```ts
export function registerMcpIpcHandlers(mcpManager: McpManager): void {
  ipcMain.handle("mcp:list-servers", () => mcpManager.listServers());
  // ... 6 handlers
}
```

`mcpManager` 是显式 deps 注入 — 这是 project 内第一个 register-function-with-deps 的实例。本 ADR 将该模式推广到 5 个主域。

## Decision

10 个相互依赖的决定，单次原子 commit 落地。

### D1 — Register 函数 seam 形状: `(deps: IpcDeps) => void`

延续 `registerMcpIpcHandlers(mcpManager)` precedent。每个 register 函数接受其所需的 deps 对象，返回 `void`。

**拒绝**：
- A. `() => void`（无参数）：保留模块级状态，无法独立测试
- C. `(deps: IpcDeps) => Effect<void, never>`：为 IPC handler 加 Effect 抽象层，入侵性高，收益低

### D2 — IpcDeps: 每域不同 deps 接口

每个 register 函数只声明它需要的依赖。例如：

```ts
registerFileOpsIpc({ sandbox, db, getMainWindow });
registerConversationsIpc({ db, getMainWindow });
registerSettingsIpc({ settings, getMainWindow });
```

**拒绝**：
- A. 单个全局 `IpcDeps`：interface 表面积大，未使用项会泄漏
- C. 两层（共享 core + 域可选）：TS 表达型冗余

### D3 — 域粒度: 5 + webfetch = 6 个 register 函数

5 个主域（合并 conversations + messages）+ 1 个 webfetch（独立）：

| Register 函数                | Channel 数 | deps                                          |
| ---------------------------- | ---------- | --------------------------------------------- |
| `registerSettingsIpc`        | 3          | `settings, getMainWindow`                     |
| `registerConversationsIpc`   | 10         | `db, getMainWindow`（含 messages handlers）   |
| `registerWorkspacesIpc`      | 5          | `db, getMainWindow`                           |
| `registerFileOpsIpc`         | 5          | `sandbox, db, getMainWindow`                  |
| `registerSystemIpc`          | 6          | `getMainWindow`                               |
| `registerWebfetchIpc`        | 1          | `sandbox, cancelMap, getMainWindow`           |

**拒绝**：
- B. 6 域（messages 单独）：messages 与 conversations 共用同一张 db 表、共享 `dbInit` guard，合并符合 data locality
- D. 仅 4 域（合并更多）：workspaces / file-ops 在数据模型与生命周期不同，强制合并会引入跨域 coupling

### D4 — 模块位置: `src/main/features/<domain>/ipc.ts`

所有 6 个 register 函数位于 `src/main/features/<domain>/ipc.ts`，与 webfetch 既有 `src/main/features/webfetch/` 结构对齐。

**拒绝**：
- A. `src/main/ipc/<domain>.ts`：创造新 IPC 子目录，与 `features/` 模式不对称
- B. `src/main/<domain>-ipc.ts` 扁平：`src/main/` 根级已 14 个 .ts 文件，再加 5 个会变 19 个根级文件

### D5 — 模块级单例各随其域

| 单例               | 新位置                                          | 接口                                       |
| ------------------ | ----------------------------------------------- | ------------------------------------------ |
| `settingsCache`    | `src/main/features/settings/state.ts`            | `SettingsState` (load/save/update/deleteProvider) |
| `abortControllers` | `src/main/features/webfetch/cancel-map.ts`       | `CancelMap` (register/unregister/abortAll) |
| `dbReady`          | `src/main/db/mod.ts`                            | `getOrInitDatabase()` 幂等函数替换 `dbInit()` |

每个域拥有自己的状态 — locality 最大化，interface 缩到 0。

**拒绝**：
- B. 全部走 deps 参数：6 个 register 函数都拿同一个 deps 类型，state locality 丢失
- C. 合成 Settings Service + Webfetch Service class：与项目 `factory / module function` 习惯不一致

### D6 — sandboxHandler: 抽到 `src/main/lib/sandbox-handler.ts` 共享

```ts
// src/main/lib/sandbox-handler.ts
export function sandboxHandler<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
): (event: unknown, args: TArgs) => Promise<TResult | SerializedAppError> { ... }
```

6 个域 import 同一份 — 1 个 instance、跨域测试覆盖。

**拒绝**：
- A. 每个域复制 1 份：cross-cutting logic 重复 6 份，bug 修复需扫 6 处
- C. 抽 HOF `withErrorMapping<T>()`：入侵性高，需改 29 个 handler 的写法

### D7 — 测试策略: 6 域测试 + 1 集成测试

| 文件                                          | 测什么                                          |
| --------------------------------------------- | ----------------------------------------------- |
| `src/main/features/<domain>/ipc.test.ts` × 6  | 该域 handler 的行为 + 错误处理                  |
| `src/main/ipc.test.ts`（保留，缩到 ~80 行）   | 调用 `registerIpcHandlers()` 后 35 channel 全部注册 |

集成测试是回归护栏 — 确保 register 函数调用错不会静默丢 channel。

**拒绝**：
- A. 仅 1 个集成测试：失去域隔离的单元测试覆盖
- B. 仅 6 域测试：丢失"全部注册过"的回归检测

### D8 — Row mappers: 抽到 `features/<domain>/mappers.ts`

`toConversation` / `toMessage` / `toWorkspace` 抽到纯函数模块，可被未来的 migration / test fixture / preload 复用。

**拒绝**：
- A. inline 在每域 `ipc.ts`：locality 最高但失去复用点
- C. 抽到 `src/main/db/mappers.ts`：与 db/mod.ts 的"迁移 + Schema"职责混淆

### D9 — 文件结构（10 个新文件 + 1 个 barrel 重写）

```
src/main/
├── ipc.ts                          # ~30 行 barrel（重写）
├── ipc.test.ts                     # 缩到 ~80 行（保留）
├── lib/sandbox-handler.ts          # 新建（cross-cutting utility）
├── features/
│   ├── settings/
│   │   ├── ipc.ts                  # 新建 registerSettingsIpc
│   │   ├── ipc.test.ts             # 新建
│   │   ├── state.ts                # 新建（settingsCache + load/save/update）
│   │   └── mappers.ts              # 新建（如需 toProvider）
│   ├── conversations/              # 合并 messages
│   │   ├── ipc.ts                  # 新建 registerConversationsIpc（10 handlers）
│   │   ├── ipc.test.ts             # 新建
│   │   └── mappers.ts              # 新建 toConversation + toMessage
│   ├── workspaces/
│   │   ├── ipc.ts                  # 新建 registerWorkspacesIpc
│   │   ├── ipc.test.ts             # 新建
│   │   └── mappers.ts              # 新建 toWorkspace
│   ├── file-ops/
│   │   ├── ipc.ts                  # 新建 registerFileOpsIpc
│   │   └── ipc.test.ts             # 新建
│   ├── system/
│   │   ├── ipc.ts                  # 新建 registerSystemIpc
│   │   └── ipc.test.ts             # 新建
│   └── webfetch/
│       ├── ipc.ts                  # 新建 registerWebfetchIpc（从既有 ipc.ts 迁出）
│       ├── ipc.test.ts             # 新建
│       ├── cancel-map.ts           # 新建（abortControllers）
│       ├── handler.ts              # 既有
│       └── ssrf.ts                 # 既有
└── db/mod.ts                       # 增 getOrInitDatabase()，删除 dbReady
```

### D10 — 落地: 1 个原子 commit

单次 atomic commit，单 PR：

- 满足 `AGENTS.md` "atomic commit" 约束
- 中间不留下坏状态
- 易于 revert

**拒绝**：
- B. 2-3 阶段 PR：原子性丧失，partial state 期间可能 break 集成
- C. 每域 1 PR（6 PRs）：重复发 6 套类似 PR，review overhead 不值得

## Considered Options (高层)

| 选    | 描述                                | 选 / 不选                                          |
| ----- | ----------------------------------- | -------------------------------------------------- |
| 全部  | 不动 ipc.ts，依赖现有模块级状态    | 不选 — bouncing / hidden coupling 持续恶化        |
| 仅抽  | 只抽 sandboxHandler，state 留在原位 | 不选 — module-level 单例仍是测试障碍              |
| 全 HOF | 用 Effect HOF 包装所有 handler     | 不选 — 入侵 29 个 handler，与项目 module-function 习惯不符 |

## Consequences

### 正面

- **Locality**：每个域的 handlers + state + mappers 集中在一个 `features/<domain>/` 目录
- **Leverage**：`registerFileOpsIpc` 等 6 个函数可在测试中独立调用，不必 spin up 整个 IPC 层
- **Interface shrinks**：`ipc.ts` 从 526 行 → ~30 行 barrel；每个 register 函数 deps 最小化
- **Deletion test**：删除 `registerFileOpsIpc` 只删 file handlers；删除 `features/settings/state.ts` 只删 settings state
- **测试改进**：
  - 域测试可独立验证 handler 行为
  - 集成测试验证 35 channel 全部注册（回归护栏）
- **ADR-0010 对称**：renderer 侧按 features/ 拆分，main 侧按 features/ 拆分
- **Precedent 复用**：与 `registerMcpIpcHandlers(mcpManager)` 一致，未来新增域（如 permissions）按同样模式

### 负面 / 代价

- **9 个新文件**：6 个 `ipc.ts` + 6 个 `ipc.test.ts` + `lib/sandbox-handler.ts` + `state.ts` × 1 + `cancel-map.ts` × 1 + `mappers.ts` × 3 = 17 个新文件（实际）
- **AGENTS.md / 治理文档同步**：需更新 `src/main/AGENTS.md`（若存在）或在 commit message 说明
- **`src/main/index.ts` boot 不变**：`registerIpcHandlers({ getMainWindow })` 签名保留 → 调用方零改动
- **Row mappers 拆分可能过度**：当前 mappers 只被 IPC handler 使用；如未来 1 处都用不到 `features/<domain>/mappers.ts`，是 speculative 抽象
- **`dbInit()` → `getOrInitDatabase()` 是名字 + 行为双改**：所有 `dbInit()` 调用点需更新（目前只在 ipc.ts 内 → 改 db/mod.ts 内定义即可）

### 不变

- `registerIpcHandlers({ getMainWindow })` 签名（`src/main/index.ts` 调用点零改动）
- IPC channel name 字符串（per ADR-0026 D1 已锁定 camelCase）
- IPC handler 的 arg types（per ADR-0026 D2 已 strict camelCase）
- Anthropic transport 链路（renderer 侧，不在 main）
- DB schema / migrations（per ADR-0024 D10）
- `WorkspaceService` / `Provider` / `Settings` 类型（在 shared lib）
- MCP 既有结构（`mcp-ipc.ts` 已按相同模式拆分）

## Implementation Outline

```ts
// src/main/lib/sandbox-handler.ts
export function sandboxHandler<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
): (_event: unknown, ...args: TArgs) => Promise<TResult | SerializedAppError> {
  return async (_event, ...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof AppError) {
        return { __error: serializeAppError(err) };
      }
      throw err;
    }
  };
}

// src/main/features/settings/state.ts
export class SettingsState {
  private cache: Settings | null = null;
  load(): Settings { ... }
  update(patch: Partial<Settings>): Settings { ... }
  deleteProvider(id: string): Settings { ... }
}
export const settingsState = new SettingsState();

// src/main/features/settings/ipc.ts
export function registerSettingsIpc(deps: {
  settings: SettingsState;
  getMainWindow: () => BrowserWindow | null;
}): void {
  ipcMain.handle("getSettings", () => deps.settings.load());
  ipcMain.handle("updateSettings", (_, patch) =>
    sandboxHandler(() => deps.settings.update(patch)));
  ipcMain.handle("deleteProvider", (_, id) =>
    sandboxHandler(() => deps.settings.deleteProvider(id)));
}

// src/main/ipc.ts (barrel)
export function registerIpcHandlers(deps: { getMainWindow: () => BrowserWindow | null }): void {
  registerSettingsIpc({ settings: settingsState, getMainWindow: deps.getMainWindow });
  registerConversationsIpc({ db: getOrInitDatabase(), getMainWindow: deps.getMainWindow });
  registerWorkspacesIpc({ db: getOrInitDatabase(), getMainWindow: deps.getMainWindow });
  registerFileOpsIpc({ sandbox: getSandbox(), db: getOrInitDatabase(), getMainWindow: deps.getMainWindow });
  registerSystemIpc({ getMainWindow: deps.getMainWindow });
}

// src/main/index.ts (unchanged)
import { registerIpcHandlers } from "./ipc";
// ...
app.whenReady().then(() => {
  // ...
  registerIpcHandlers({ getMainWindow: () => mainWindow });
  // ...
});
```

## Rollout

**单 atomic commit** on `refactor/main-ipc-domain-split-0039` branch (off master):

```
refactor(main): split ipc.ts by domain + per-domain IpcDeps + state locality (ADR-0039)

Split src/main/ipc.ts (526L / 29 handlers) into 6 per-domain register functions
under src/main/features/<domain>/ipc.ts:

- registerSettingsIpc        (3 handlers: getSettings, updateSettings, deleteProvider)
- registerConversationsIpc   (10 handlers: list/get/create/archive/delete/rename/clear conversations + list/append/search messages)
- registerWorkspacesIpc      (5 handlers: list/add/rename/delete/pickPath)
- registerFileOpsIpc         (5 handlers: read/write/edit/search/delete)
- registerSystemIpc          (6 handlers: setLoginItem, notify, openExternal, getLogPath, abortRequest, webfetch:fetch)
- registerWebfetchIpc        (1 handler: webfetch:fetch — moved to features/webfetch/ipc.ts per ADR-0038)

Each register function takes its own typed deps object (per-domain IpcDeps).
The new src/main/ipc.ts is a ~30-line orchestration barrel.

Module-level singletons migrate to their owning domains:
- settingsCache       -> features/settings/state.ts (SettingsState class)
- abortControllers    -> features/webfetch/cancel-map.ts (CancelMap class)
- dbReady + dbInit()  -> db/mod.ts getOrInitDatabase() (idempotent)

Cross-cutting utility extracted:
- sandboxHandler -> src/main/lib/sandbox-handler.ts (6 domains import same instance)

Row mappers extracted:
- toConversation, toMessage -> features/conversations/mappers.ts
- toWorkspace               -> features/workspaces/mappers.ts

Test strategy:
- 6 per-domain ipc.test.ts (settings, conversations, workspaces, file-ops, system, webfetch)
- src/main/ipc.test.ts retained as integration test (~80 lines, verifies 35 channels registered)

Verified (post-merge gate):
- vp run typecheck -> exit 0
- vp run test      -> all pass
- vp run lint      -> no new violations on modified files

Reference: ADR-0039 supersedes nothing; aligns with ADR-0010 renderer-side split spirit.
```

**Verify gate**:
- `vp run typecheck` → exit 0
- `vp run test` → 全部通过
- `vp run lint` → 修改文件无新违规
- `src/main/index.ts` 不需要改动（`registerIpcHandlers({ getMainWindow })` 签名保留）

## References

- [ADR-0010](./0010-frontend-5-1-folder-whitelist.md) — renderer 5+1 → 6+1 域拆分精神
- [ADR-0026](./0026-electron-persistence-and-ipc-channel-camelcase.md) — IPC channel camelCase rename（已锁定 channel name）
- [ADR-0019](./0019-per-run-transient-agent.md) — chat.store.ts = single source of truth
- [ADR-0024](./0024-electron-shell-migration.md) — V3 Electron shell（main / preload / renderer 三段）
- [ADR-0038](./0038-webfetch-agent-tool.md) — webfetch AgentTool（webfetch 已在 features/webfetch/）
- `src/main/mcp-ipc.ts` — `registerMcpIpcHandlers(mcpManager)` precedent
- `src/main/index.ts` — `app.whenReady()` boot sequence 调用 `registerIpcHandlers({ getMainWindow })`
- Effect-TS / Solid 既有约定不变
- AGENTS.md — "atomic commit" / "精准修改" / "简单优先"

## Addendum (2026-08-01)

> 实施后的对抗式 review(`/code-review` + 对抗式补充)发现以下 5 类共 10 个 finding。本节显式记录 spec 矛盾、pre-existing 死功能、judgement call 豁免,以保留审计轨迹。

### Add-1: D3 表 vs Rollout 矛盾(spec 内部)

ADR-0039 line 87-93 的 D3 表说 `registerSystemIpc = 6 channels`(deps `getMainWindow`),而 line 314-319 的 Rollout 把 `webfetch:fetch` 同时列在 `registerSystemIpc` 6 handlers 与 `registerWebfetchIpc` 1 handler 中,`abortRequest` 在 Rollout 算 system 的 6 个之一,但 D3 表又要求 abortControllers → webfetch/cancel-map.ts(`D5` CancelMap locality 决策)。

**实现选择**:`abortRequest` 归 `registerWebfetchIpc`(操作 cancelMap,locality 优先于 D3 字面归置)。最终 `registerSystemIpc = 4`(setLoginItem, notify, openExternal, getLogPath),`registerWebfetchIpc = 2`(abortRequest, webfetch:fetch)。Channel 总数 4+10+5+5+2+4=30 本地 + 6 MCP = 36,拆分前后一致。D3 表的 system/webfetch 行视为 typo,以本次实现归置为准。

### Add-2: sandbox-handler 协议(spec outline 错)

ADR-0039 line 254-261 的 Implementation Outline 描述 sandboxHandler 走 `if (err instanceof AppError) return { __error: serializeAppError(err) }; throw err`,但实际 renderer 契约是 `ipcRenderer.invoke` reject 时 `Error.message` 含 JSON `{kind, message}`,由 `src/renderer/src/shared/apis/invoke.api.ts:133-147 mapIpcError` 解析。

原始 `src/main/ipc.ts:415` sandboxHandler 走 throw JSON 路径。Refactor 保留旧行为以保 renderer 契约不变 — outline 是 spec 作者设想,实际契约以 renderer `mapIpcError` 为权威。返回类型 `Promise<TResult>`(非 `Promise<TResult | SerializedAppError>`),`SerializedAppError` 类型保留 export 但仅作占位,加注释说明。

### Add-3: `getMainWindow` 为死参数(pre-existing)

`registerIpcHandlers(_deps: { getMainWindow: () => BrowserWindow | null })` 在 barrel 接收但不传给任何 register 函数 — 原始 `src/main/ipc.ts:244` 同样 `_deps` 未使用。ADR-0039 D10 "不变"要求保留外部签名以保 `src/main/index.ts` 零改动。**死参数属 pre-existing,refactor 未引入。**

### Add-4: webfetch abort 是 pre-existing 死功能

`features/webfetch/cancel-map.ts` `CancelMap.register()` 生产代码零调用(grep 证实仅测试调用);`webfetch:fetch` handler 调 `fetchSafe(args.url, { timeoutSeconds })`,fetchSafe 内部用 `AbortSignal.timeout` 创建 signal,从未接受外部 AbortController 或注册到 cancelMap;`abortRequest` 因此永远 abort 失败。原始 `src/main/ipc.ts:19 abortControllers` map 同样从未被写入。

**这是 pre-existing dead feature,refactor 原样搬入 CancelMap。修复需后续 task:** `fetchSafe` 接受 `signal` 参数,`webfetch:fetch` 中 `cancelMap.register(requestId, ctrl)` + ctrl 在 fetchSafe 完成后 unregister。本次 refactor 仅抽象了壳,功能未接通。

### Add-5: Judgement call 豁免

#### Add-5.1 `getOrInitDatabase` 是 middle-man/冗余抽象

`db/mod.ts:67-70 getOrInitDatabase()` = `if (_db) return _db; return initDatabase()`,而 `initDatabase(): DB` 自身已幂等(`if (_db) return _db`)。两者功能等价。

**豁免理由**: ADR-0039 D5 明确要求 `getOrInitDatabase` 作为独立入口,删除会偏离 spec。保留并接受这一层包装作为 D2 deps locality 的边界情况,后续如有清理 task 可二选一收敛。

#### Add-5.2 `file-ops` 用 module import 而非 deps 接收 sandbox

`features/file-ops/ipc.ts:9-10` 直接 `import` file-sandbox.js 的纯函数,未通过 deps 注入。ADR-0039 D3 表要求 `registerFileOpsIpc deps = sandbox, db, getMainWindow`。

**豁免理由**: file-sandbox.js 是纯函数模块(无状态、无 IO 副作用),模块级 import 与 deps 注入等价。D2 "最小 deps" 精神优先于 D3 字面。

#### Add-5.3 `RawWorkspace` 在 file-ops 与 workspaces mappers 重复

`features/file-ops/ipc.ts:12-17 RawWorkspace` 与 `features/workspaces/mappers.ts:1-6 RawWorkspace` 同形但未 import 复用。

**豁免理由**: minor 改善,留为后续 task(file-ops import workspaces/mappers.ts 的 `RawWorkspace`)。

#### Add-5.4 `getWorkspaceById` 在 file-ops 与 workspaces 域 SQL 重复

`features/file-ops/ipc.ts:19-25 getWorkspaceById(db, id)` 与 `features/workspaces/ipc.ts` 内联 workspaces 表查询重复。

**豁免理由**: minor 改善,留为后续 task(抽共享 workspace data access)。