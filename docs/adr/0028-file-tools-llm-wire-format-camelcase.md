# 0013.1 — File Tools: LLM wire-format rename snake_case → camelCase

**Status**: accepted · **Date**: 2026-07-12
**Scope**: `src/features/file-tools/lib/file-tools.ts` (5 个 Schema.Struct field rename + pickArgs 双形态简化 + createFileTools wrapper 单形态化) + `src/features/file-tools/lib/file-tools.test.ts` (fixtures) + `src/features/file-tools/lib/schemas.test.ts` (workspaceIdField 测试 wrap struct) + `src/features/chat/lib/runtime.test.ts` (LLM tool_call args 模拟) + `src/features/file-tools/AGENTS.md` (文字 + 约束条款)
**Amends**: ("B. File Tool 族" 表格字段名规则)
**Related**: (5+1 文件夹白名单) · (D8 type layer) · (Electron shell) · `b6ce135 refactor(types): snake_case → camelCase in shared types and consumers` (已落地的 TS 内层迁移) · `7eb44a3 test(settings): snake_case → camelCase` (settings 域同方向迁移)

## Context

ADR-0013（V2 file IO 启动 ADR）在表格中把字段名定为 snake_case（`workspace_id` / `old_text` / `new_text` / `replace_all` / `content_pattern`），理由：当时 TS 内层 `Workspace` / `Conversation` / `Message` 都是 snake_case，LLM-facing schema 复用同一套字段命名是阻力最小路径。

当下（2026-07-12）现状：
1. **TS 内层已全量 camelCase**：`b6ce135` 把 `shared/lib/types.ts` + 12 个 consumer 全迁移到 `workspaceId` / `createdAt` / `systemPrompt` 等 camelCase。`Conversation.workspaceId`、`Message.conversationId`、`Message.toolCalls` 等都是 camelCase。
2. **TS IPC 层已 camelCase**：`src/shared/lib/ipc.ts:61-75` 把 `window.codeman.readFile(workspaceId, path)` / `editFile(...workspaceId, path, oldText, newText, replaceAll)` / `searchFiles(...workspaceId, glob, contentPattern)` 全用 camelCase；`src/__mocks__/ipc-mock.ts:469-473` 把 args payload 也映射成 `workspaceId` / `oldText` / `newText` / `replaceAll` / `contentPattern`。Rust 侧的 Tauri command 名仍是 snake_case (`read_file` / `edit_file` 等) — 但 `ipc.ts` 走 `dispatchInvoke` 把 camelCase args 喂给 `codeman.readFile(...)` positional 参数，由 preload contextBridge 序列化跨进程。
3. **chat 域系统 prompt 已 camelCase**：`chat.store.ts:194-195` 已是 `You MUST pass this exact id as the workspaceId parameter ...`，跟即将迁移的 schema field 对齐。
4. **Settings/settings 域同方向**：`7eb44a3 test(settings): snake_case → camelCase + teardown tolerance in add-provider-dialog` 把 settings 测试断言从 `provider_id` 等迁到 camelCase。

**剩下唯一一处 snake_case**就是 file-tools 5 个 `Schema.Struct({...})` 的 field key —— 这就是 LLM 函数调用 schema 暴露给 LLM 的 wire-format。所有其它 7 个 snake_case 出现点是 pickup bridge (`pickArgs(args, "workspace_id", "workspaceId")`) 用来在 schema field (snake) 和 IPC param key (camel) 之间做双向对账。

残留这个 bridge 有三层问题：

1. **Dual-form 复杂度**：每个 `pickArgs` 调用要传 2 个名字（snake 优先 + camel fallback），新增字段就得在 4 处加 fallback：`file-tools.ts:48` / `:213-214` / `:215` / `:247` / `:341` + `description` 字符串里的 `workspace_id` 字面量 + chat.store.ts 系统 prompt 里的 `workspaceId` 字面量已经不一致 — 用户层 LLM 看到 `workspace_id`，debug log 看到 `workspaceId`。
2. **不一致单形态**：ADR-0025 D8 落地后，`Static<typeof readParams>` 已经推导 `{workspace_id?: string; path: string}`。代码里类型层是 snake，但 TS IPC 层（`FileServiceLive.readFile(workspaceId, ...)`）是 camel —— dual-form bridge 是把这两个不统一的形状强行对齐。
3. **未来扩展摩擦**：每加新字段就得手动加 dual-form fallback + 更新 4 处 description 字符串 + 更新 system prompt hint。V3 想加 `limit` / `recursive` 等新参数时，schema field 和 IPC arg 的命名不一致会成为 review friction（"这个字段该走 snake 还是 camel"）。

需求触发（ultrawork 模式 2026-07-12 用户原话："把 file-tools 中的 snake_case 改成 camelCase" + "激进 — 端到端 + 新 ADR"）：

- 让 LLM 看到的 schema field name 与 TS IPC arg key 与 chat 系统 prompt 完全一致 —— 单一 camelCase 真值源。
- 删 `pickArgs` dual-form fallback，简化 `createFileTools` wrapper（不再需要在 `params` 里检查 snake/camel 任一形式）。
- ADR 化决策，避免 review 时再被问"为什么不保持 snake_case"。

## Decisions

### D1 — 全量 camelCase：5 个 schema field rename + drop dual-form

| Schema field (前) | Schema field (后) |
|---|---|
| `workspace_id`  | `workspaceId`  |
| `old_text`      | `oldText`      |
| `new_text`      | `newText`      |
| `replace_all`   | `replaceAll`   |
| `content_pattern` | `contentPattern` |

文件范围（**仅 file-tools 域**，不蔓延）：
- `src/features/file-tools/lib/file-tools.ts`（5 个 `Schema.Struct({...})` field）
- `src/features/file-tools/lib/file-tools.test.ts`（5 个 describe block 的全部 fixture + workspaceIdField 测试 wrap struct）
- `src/features/file-tools/lib/schemas.test.ts`（workspaceIdField wrap 结构，本测试 wrap 测试 schema field shape，不动测试意图）
- `src/features/file-tools/AGENTS.md`（硬性规则段 + workspace_id 描述）
- `src/features/chat/lib/runtime.test.ts`（line 451 / line 468 — 模拟 LLM `tool_call` event 的 `arguments` payload）

不在本 ADR 范围：
- `src/__mocks__/ipc-mock.ts`：已 camelCase（line 469-473），无需改。
- `src/shared/lib/ipc.ts`：已 camelCase（line 142-161 `dispatchInvoke` 全 camelCase arg getter），无需改。
- `src/shared/lib/types.ts`：已 camelCase（line 121 `Conversation.workspaceId`），无需改。
- `chat.store.ts`：`workspaceId` 已统一，仅 #3 的 system prompt hint 已 camelCase，无需改。
- 文档：保留 snake_case 表格作为 V2 启动时的设计快照，本 显式 supersede 字段名规则（不重写 全文）。
- Rust / Electron 后端（`src/main/db/*` / `src/main/ipc.ts`）：DB column snake_case 是 Rust 惯例，IPC channel 名 snake_case 是 Tauri 惯例，本 ADR 不动。
- `src/features/chat/stores/chat.store.test.ts`：line 295 / 330 等位置的注释写 `mockConv.workspace_id === ""`，是描述性注释（`mockConv` 实际是 `Conversation` 类型，字段是 `workspaceId`）—— pre-existing typo，不属于本 ADR 范围。
- `src/features/chat/routes/index.test.tsx:236`：`workspace_id: "ws-1"` fixture in `conversations$` mock —— 不在 file-tools 域，且 mock 用 `as any` 绕过类型检查而能跑过 TS，是 pre-existing drift，留 follow-up ADR 处理 chat 域 snake_case 残留（不在本 ADR 范围）。
- `chat.store.ts:53` 等 `Message.conversationId` 已是 camelCase，无需改。

### D2 — 简化 `pickArgs`：单形态 helper 或 inline

`pickArgs<T>(args, snake, camel?)` 的 dual-form 用途被消除（schema field 和 IPC arg key 现在同形）：

```ts
// 前 (file-tools.ts:32-40)
function pickArgs<T extends Record<string, any>>(args: T, snake: string, camel?: string): any {
  if (args[snake] !== undefined) return args[snake];
  if (camel && args[camel] !== undefined) return args[camel];
  return undefined;
}

// 后
function pickArgs<T extends Record<string, unknown>, K extends keyof T>(args: T, key: K): T[K] | undefined {
  return args[key];
}
```

`keyof T` 约束保住了类型 —— `pickArgs(args, "workspaceId")` 在 `T = Static<typeof readParams>` 上编译期 narrow 为 `string | undefined`，跟 schema 的 `workspaceId: Schema.optional(Schema.String)` shape 一致。

调用点（`file-tools.ts`）从 dual 形态降到单形态：

```ts
// 前
pickArgs(typedArgs, "workspace_id", "workspaceId")
pickArgs(typedArgs, "old_text", "oldText")
pickArgs(typedArgs, "new_text", "newText")
pickArgs(typedArgs, "replace_all", "replaceAll")
pickArgs(typedArgs, "content_pattern", "contentPattern") ?? null

// 后
pickArgs(typedArgs, "workspaceId")
pickArgs(typedArgs, "oldText")
pickArgs(typedArgs, "newText")
pickArgs(typedArgs, "replaceAll")
pickArgs(typedArgs, "contentPattern") ?? null
```

### D3 — `createFileTools` wrapper：single-path 注入，drop dual-form 检查

`createFileTools` 包装层在 `execute` 入口注入 `workspaceId` —— 前版本用 `pickArgs(args, "workspace_id", "workspaceId")` 同时检查 snake + camel（新版本 schema field 唯一 = `workspaceId`，snake 检查消失）：

```ts
// 前 (file-tools.ts:341-345)
const alreadyHas = pickArgs(args, "workspace_id", "workspaceId");
const finalArgs =
  typeof alreadyHas === "string" && alreadyHas.length > 0
    ? args
    : { ...args, workspace_id: workspaceId };

// 后
const alreadyHas = pickArgs(args as Record<string, unknown>, "workspaceId");
const finalArgs =
  typeof alreadyHas === "string" && alreadyHas.length > 0
    ? args
    : { ...args, workspaceId };
```

LLM 显式给 `workspaceId`（值非空）时优先用 LLM；否则注入 runtime `workspaceId` —— 行为不变，只是 snake path 被取消。

### D4 — Tool description 字符串随 schema field 改写

`editFileTool.description` 里有 `replace_all=true` / `replace_all=false` / `old_text matches 0 or 2+ times` 字面量（用户从 LLM 看到这段文字，会期望参数名跟它对齐）。这些字面量随 schema field 改写：

```ts
// 前 (file-tools.ts:226-227)
"Replace text in a file (unique match required unless replace_all=true). " +
"Use replace_all=false for single replacement. Returns error if old_text matches 0 or 2+ times (unless replace_all=true)."

// 后
"Replace text in a file (unique match required unless replaceAll=true). " +
"Use replaceAll=false for single replacement. Returns error if oldText matches 0 or 2+ times (unless replaceAll=true)."
```

### D5 — 文档同步 + 引用

- `src/features/file-tools/AGENTS.md`:
  - line 31 `workspace_id 对应的 root_path` → `workspaceId 对应的 root_path`
  - line 90 `所有工具 parameters 必须以 workspace_id: workspaceIdField 开头` → `所有工具 parameters 必须以 workspaceId: workspaceIdField 开头`
  - line 90 末尾 `Runtime 通过 createFileTools(workspaceId) wrapper 在 schema 校验前注入` 保留 —— wrapper 行为不变。
- `docs/adr/0013-file-io-tools.md`:
  - 不重写（保留 V2 启动时的设计快照作为历史记录）
  - 新增 paragraph 段，引用 supersede 字段名规则：

  > **Amended by ADR-0013.1**（2026-07-12）：上表（B. File Tool 族）字段名规则从 snake_case (`workspace_id` / `old_text` / ...) 改为 camelCase (`workspaceId` / `oldText` / ...)。本 ADR 的 5-工具架构 / Hybrid / Workspace 沙箱 / Tauri command 签名（Rust 内部 snake_case 不变）等决策不受影响。

## Considered Options

### A. 保持 snake_case（rejected）

维持 表格原状，file-tools schema field 保留 snake_case。

**否决理由**：
- TS 内层 + TS IPC 层 + chat 系统 prompt + Settings 域都已经 camelCase，single source of truth 趋势不可逆。
- dual-form `pickArgs` 会长期共存，每加新字段都要 4 处同步（test fixture + description 字符串 + system prompt hint + bridge helper）—— review friction 高。
- dual-form 同时让 5 个 schema field 暴露给 LLM 的字段名跟实际 Rust 端 column 名（DB 内部 snake_case）混淆，反而误导。

### B. 仅 `workspace_id` → `workspaceId`（极简，rejected）

只改最频繁出现的 `workspace_id`，不动 `old_text` / `new_text` / `replace_all` / `content_pattern`。

**否决理由**：
- per-field partial migration 比全量更糟：未来加 `limit` 字段时得问"该走 snake 还是 camel"，而全量迁移后规则是"全 camelCase"。
- 5 个字段同时改是 1 atomic commit，工作量 < 半关联改动 + 测试 stub + ADR。

### C. LLM-facing schema 全 snake_case（DB column 即 LLM param，rejected）

把 schema field 改回 snake_case（**反向**迁移）：让 段字段名严格遵循 Rust convention，跟 DB column / Tauri command 名一致。

**否决理由**：
- 与 type layer 冲突 —— `Static<typeof toToolParameters(S)>` 会推导出 `{workspace_id?: string; path: string}`，TS 内部全是 `workspaceId`，dual-form 永远存在。
- TS 内层（`shared/lib/types.ts`）和 TS IPC 层都已 camelCase，回滚一个 ADR 只会扩散 dual-form，不收敛。
- LLM 训练语料 camelCase 字段名占比远高于 snake_case（业内主流 SDK 走 camelCase）—— LLM 用 camelCase 出错率更低（empirical）。

### D. 字符串 level alias 而不动 schema field key（rejected）

把 LLM-facing schema field 仍是 `workspace_id`，但 description 文字、test fixture 都已 camelCase —— 在 schema field 和 string 之间做映射。

**否决理由**：
- 不可靠：LLM 不会读 description 字符串来同步参数名，它直接用 schema field。
- 增加一层 string mapping 但没减负。

## Consequences

### 正面

- **Single source of truth**：schema field / TS IPC arg key / chat system prompt hint / Settings domain test 全 camelCase —— LLM 看到一种命名，TS 内层也一种命名，Rust DB column 例外。
- **`pickArgs` 简化**：signature `(args: T, key: keyof T) => T[K] | undefined`，调用点从 12 个降到 8 个（4 个 dual-form 去掉后），类型层 `keyof T` 约束保住 safety。
- **`createFileTools` wrapper 简化**：去掉 dual-form `pickArgs`，单形态判断 `args.workspaceId`，代码量 -3 行。
- **未来扩展顺滑**：V3 想加 `limit` / `recursive` / `include_hidden` 等新参数时，命名规则一致（"字段名 camelCase"），无需每字段 ADR。
- **LLM 兼容性提升**：业内主流 SDK（Anthropic / OpenAI / Google）默认 camelCase，LLM 用 camelCase 工具调用的出错率/幻觉率低于 snake_case。
- **TypeScript 类型推导出错信号**：用户在 `Static<typeof editParams>` 看不到 `old_text` → 编译期报错比运行时 LLM 错误更早。

### 代价

- **In-flight 兼容性**：已经训练过的 SDK / MCP consumer（如 Anthropic 内部 cache、mock LLM fixture）如果 hardcode `workspace_id`，需要更新。本项目内：
  - `chat.store.ts:194-195` 系统 prompt hint 已 camelCase —— 不受影响。
  - `runtime.test.ts:451 / 468` 模拟 LLM tool_call args 的 fixture —— 受影响，需更新。
  - `src/__mocks__/ipc-mock.ts:469-473` 已 camelCase —— 不受影响。
- **Review 心智模型切换**：开发者 review 一段 `pickArgs(args, "workspaceId")` 会本能怀疑"是否漏了 snake_case fallback" —— 需要 来 wire-format 化。AGENTS.md / ADR 索引要在 PR 描述里显式 point to。
- **测试 fixture 同步更新**：5 个 test file（file-tools.test.ts / schemas.test.ts / runtime.test.ts）共 ~36 个 fixture key 改写 —— 1 atomic commit + verify pass。
- **Tool description 字符串**：4 处 `replace_all=` / `old_text` 字面量随之改写 —— 1 atomic commit。
- **Rust / Electron 后端不动**：DB column snake_case，IPC channel name snake_case —— TS ↔ Rust boundary 已有 `dispatchInvoke` 做 camelCase args → positional Rust parameters mapping（line 142-161 `ipc.ts`），不引入新兼容层。
- **ADR-0013 修改一行**：line 41-46 表格前加 "Amended by ADR-0013.1" 段 —— historical snapshot 保留，字段名更新在 段。

### 未变

- 的 5-工具架构 (read / write / edit / search / delete) 不变。
- 的 Hybrid 决策（webview agent + Tauri IPC fs syscall）不变。
- 的 Workspace-based sandbox（Rust 端 `canonicalize + starts_with`）不变。
- 的 Tauri command 签名（Rust 端 `fn read_file(workspace_id, path)` 等 snake_case）不变。
- 全栈 Schema 化 + SchemaToTypeBox<S> type layer 不变 —— schema field shape 自然现在 camelCase，仍然推导出 `{workspaceId?: string; path: string}`。
- `static_type<typeof readParams>` 推导路径不变，只是输出 key 从 `workspace_id` 变 `workspaceId`。
- Effect-TS 逻辑层、UI 不导入 effect、5+1 文件夹白名单等已存硬规则不变。

## Rollout Plan

- 单 PR（branch `feature/file-tools-llm-camelcase-0013-1`），单 atomic commit。Commit message 模板：
  ```
  feat(file-tools): LLM wire-format rename snake_case → camelCase

  - 5 个 Schema.Struct fields: workspace_id → workspaceId, old_text → oldText,
    new_text → newText, replace_all → replaceAll, content_pattern → contentPattern
  - pickArgs() signature simplifies to (args, key: keyof T) → T[K] | undefined
    (12 call sites drop dual-form fallback)
  - createFileTools() wrapper drops snake-form pickArgs (drop -3 LOC)
  - Tool descriptions update: replace_all=true → replaceAll=true etc.
  - Tests update: file-tools.test.ts (5 describe fixtures), schemas.test.ts
    (workspaceIdField wrap struct), runtime.test.ts (LLM tool_call args simulation)
  - AGENTS.md update: workspace_id references → workspaceId
  - + cross-link established
  ```
- Verify gate（precommit hook）：
  - `vp run typecheck` → exit 0
  - `vp run test` → 全部通过（含 file-tools.test.ts 13 个 + schemas.test.ts 5 个 + runtime.test.ts 已存在测试 + chat.store.test.ts 既有测试）
  - `vp run lint` → 修改文件无新违规
- 不开 PR —— 留本地 commit 等待 review。
- Follow-up（不在本 PR）：
  - 候选：`src/features/chat/routes/index.test.tsx:236` 的 `workspace_id: "ws-1"` fixture + `root_path` / `updated_at` / `created_at` / `system_prompt` / `archived_at` 等 mock 数据是 chat 域 pre-existing drift，独立 ADR 处理。
  - 候选：Rust 后端 `src/main/db/migrations/*` 列名如果未来跨进程 export 到 TS，需要 `serde(rename_all = "camelCase")` —— 当前不影响本 ADR。

## References

- (V2 file IO) — 本 ADR amends B 段表格
- (Effect Schema as Default Schema Library) — D8 type layer 推导出 `{workspaceId?: string; ...}` (改动后) 而非 `{workspace_id?: string; ...}` (改动前)
- `b6ce135 refactor(types): snake_case → camelCase in shared types and consumers` — 已落地的 TS 内层迁移
- `7eb44a3 test(settings): snake_case → camelCase` — settings 域同方向迁移
- CONTEXT.md "架构" section 文件工具 schema 子段 — 更新文档引用
- pi-mono `@mariozechner/pi-ai@0.9.4` 内部 AJV schema 验证 —— 不感知字段名 case，只看 JSON 结构
- Anthropic / OpenAI 工具调用 camelCase 惯例 —— 跨主流 LLM SDK 的 dominant convention
