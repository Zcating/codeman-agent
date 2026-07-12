# 0026 — Electron IPC channel + dual-form args: drop snake_case remnants

**Status**: accepted · **Date**: 2026-07-12

**Scope**:
- `electron/main/ipc.ts` — 24 个 `ipcMain.handle("snake_name", ...)` 字符串 → camelCase + drop dual-form arg types in 8 handlers (cluster C)
- `electron/main/ipc.test.ts` — `EXPECTED_CHANNELS` 数组字符串 → camelCase
- `electron/preload/index.ts` — 24 个 `ipcRenderer.invoke("snake_name", ...)` 字符串 → camelCase
- `src/__mocks__/ipc-mock.ts` — 24 个 `methodToCmd.cmd` 字符串 → camelCase
- `CONTEXT.md` — Provider.llm / Settings / Domain shape / Settings interface 同步 camelCase + drive-by `src-tauri/*` 路径 references 移除(current-state docs only)

**Amends**: ADR-0024 (D10 amend 由 fd36f6207 在 master 已落地 schema rename + migration,本 ADR 跟进 transport layer 完成)

**Related**:
- ADR-0013 / ADR-0013.1 (file-tools wire-format rename) — 直接 precedent,本 ADR 是其向 Electron transport layer 的扩展
- ADR-0015 (Provider.apiKey 单字段) — 同方向
- ADR-0024 + D10 (V3.1 兼容 amend) — schema 字段已 camelCase,本 ADR 跟进 IPC channel + dual-form
- ADR-0025 (effect/Schema 全栈) — D8 type layer 与 settings-schema 对齐
- `fd36f6207 fix(e2e): wire format snake→camel (ADR-0024 D10) + qa fixtures + UNIQUE constraint` — 本 ADR 的 schema 部分已由这个 commit 落地;本 ADR 锁定 transport 剩余
- `b6ce135 refactor(types): snake_case → camelCase in shared types and consumers` — TS 内层现状
- `151beec refactor(CONTEXT.md): update terminology from snake_case to camelCase for consistency` — glossary 现状

## Context

ADR-0024 + D10 (in fd36f6207) 已把 settings-schema 字段全量 camelCase + 加 `migrateV15SnakeToCamel()` 做 V3 pre-D10 V15-snake → V3.1 V15-camel 单次迁移 + `ipc.ts loadSettings()` 启动 eager 调用,migration 在 `migrationsV0ToV15()` passthrough 检查之前完成。

**当下 (2026-07-12) 现状的三处不对称**:

1. **24 个 IPC channel name 字符串仍是 snake_case**:`electron/main/ipc.ts` 的 `ipcMain.handle("get_settings", ...)` / `"update_settings"` / `"create_conversation"` / `"read_file"` 等 24 个 channel name 字符串。`electron/preload/index.ts` 把它们 `invoke("snake", ...)` 出去;`src/__mocks__/ipc-mock.ts:453-487` 的 `methodToCmd.cmd` 反查;`electron/main/ipc.test.ts:34-58` 的 `EXPECTED_CHANNELS` 数组。channel name 是 Electron 内部 transport layer 标识符,不暴露给 LLM(LLM 看到的是 tool `name` = `"edit_file"` snake 由 Anthropic 协议锁定,per ADR-0013/0013.1)。

2. **`electron/main/ipc.ts` arg 类型保留 dual-form V2 兼容桥**:`create_conversation` handler 接 `{ workspaceId | workspace_id }` / `{ systemPrompt | system_prompt }`;`add_workspace` 接 `{ rootPath | root_path }`;`list_messages` 接 `{ conversationId | conversation_id }`;`append_message` 接 `{ toolCalls | tool_calls }` / `{ toolResults | tool_results }`;5 个 file tools handler 接 `{ workspaceId | workspace_id }`。V3 V15-camel 已经是 strict camelCase (per D10 schema rename),dual-form bridge 是 V2 Tauri 时代残留 dead code。

3. **CONTEXT.md prose 仍是旧 snake 形态**:`Settings` interface code 块 (`api_key` / `base_url` / `api_type` 等)、Provider.llm gloss (`{ defaultModel, base_url, api_type, ... }`)、Settings gloss 字段列表 (`system_prompt / conversations / user_language / start_at_login`)、Settings::Default prose (`base_url: "..."` / `api_type: "..."`)、`src-tauri/src/lib.rs` + `src-tauri/src/settings.rs` 路径引用 —— 全是 V3 pre-D10 快照,需要 sync 到 V3.1+ canonical camelCase 现状。

**需求触发 (ultrawork 模式 2026-07-12 用户原话)**:
- "把 electron 中的 snake_case 改成 camelCase,只需要改动 typescript 和 md 文件"
- "drop cluster C" (Q2 决策:dual-form 一起 drop)
- "全改名 + 全 MD 同步" (Q3 决策:CONTEXT.md + 历史 ADR prose 跟随,SQLite DDL 例外)
- "顺带移除所有 src-tauri 的所有描述" (drive-by,current-state docs only)

**Out of scope (master 已落地,不重复)**:
- `electron/main/settings-schema.ts` interface field rename (per fd36f6207)
- `migrateV15SnakeToCamel()` 函数 (per fd36f6207)
- `ipc.ts loadSettings()` eager 调用 migration 的 wiring (per fd36f6207)
- ADR-0024 D10 文字 (per fd36f6207)
- `SettingsV15` interface 名字、`migrateV15SnakeToCamel` 函数名、`schemaVersion` 字面量 `"1.5"` —— 都是命名/版本相关小决策,master 已选,本 ADR 不动。理由:AGENTS.md "简单优先 / 精准修改 / 沿用现有代码风格"。

**Out of scope (drive-by,current-state docs only — 不入本 ADR 决策)**:
- 清理 `CONTEXT.md` / `src/AGENTS.md` / `docs/translation-rules.md` 里 stale `src-tauri/src/*.rs` file path references。Historical ADRs (0001..0025 + 0013.1) 不动 — ADR 本质是历史 record。
- 历史 ADR prose 中提到的 snake_case 字段名(`api_key` 等)只在已落地的 ADR-0024 D10 是 V3.1+ 状态描述;其他 ADR 是 V2 时代决策记录,保留原文是 record-of-why 的完整性。

## Decisions

### D1 — IPC channel name 字符串全量 camelCase (24 个 channel × 4 文件)

**24 个 channel name rename 一一对应**:

| Channel (前 snake) | Channel (后 camel) |
|---|---|
| `get_settings`            | `getSettings`            |
| `update_settings`         | `updateSettings`         |
| `clear_all_history`       | `clearAllHistory`        |
| `list_conversations`      | `listConversations`      |
| `get_conversation`        | `getConversation`        |
| `create_conversation`     | `createConversation`     |
| `archive_conversation`    | `archiveConversation`    |
| `delete_conversation`     | `deleteConversation`     |
| `list_messages`           | `listMessages`           |
| `append_message`          | `appendMessage`          |
| `search_messages`         | `searchMessages`         |
| `list_workspaces`         | `listWorkspaces`         |
| `add_workspace`           | `addWorkspace`           |
| `rename_workspace`        | `renameWorkspace`        |
| `delete_workspace`        | `deleteWorkspace`        |
| `pick_workspace_path`     | `pickWorkspacePath`      |
| `read_file`               | `readFile`               |
| `write_file`              | `writeFile`              |
| `edit_file`               | `editFile`               |
| `search_files`            | `searchFiles`            |
| `delete_file`             | `deleteFile`             |
| `delete_provider`         | `deleteProvider`         |
| `notify`                  | `notify` (单字)      |
| `open_external`           | `openExternal`           |
| `set_login_item`          | `setLoginItem`           |
| `get_log_path`            | `getLogPath`             |

**4 个文件同步改**:
- `electron/main/ipc.ts` — 24 个 `ipcMain.handle("...", ...)` 字符串
- `electron/preload/index.ts` — 24 个 `ipcRenderer.invoke("...", ...)` 字符串 (`add_workspace` 调用点同步 `root_path: rootPath` → `rootPath: rootPath`)
- `src/__mocks__/ipc-mock.ts` line 453-487 — 24 个 `methodToCmd.cmd` 字符串 (mockState 单一源,测试基础设施)
- `electron/main/ipc.test.ts` line 34-58 — `EXPECTED_CHANNELS` 数组 (channel registration 测试)

**`src/shared/lib/ipc.ts` Service Tag 完全封装** channel name 字符串,**不接触** —— 无需改。

**`notify` 单字 channel name 不变** —— 已经是单字 (不是双字 snake)。

**Tool LLM-facing label vs IPC channel 区分 (有意保留分歧)**:
- File Tool 的 LLM-facing tool name (`read_file` / `write_file` / `edit_file` / `search_files` / `delete_file`) 仍是 snake_case,Anthropic tool dispatch protocol 锁定 (per ADR-0013 + ADR-0013.1)
- 内部 IPC channel 是 camelCase (`readFile` / `writeFile` / `editFile` / `searchFiles` / `deleteFile`) —— 这是 TS-side transport layer 用 camelCase 跟其它 IPC channel 对齐

### D2 — Drop dual-form arg types in `electron/main/ipc.ts` (Cluster C)

V2 caller 兼容桥(`{ workspaceId | workspace_id }` 双形态接收)在 V3 V15-camel 时代是 dead code —— schema 字段已 strict camelCase + 所有真实 caller 已 camelCase (`src/__mocks__/ipc-mock.ts` line 469-473 已经 camelCase,V2 caller 已无 caller 路径)。全 drop:

| Handler (channel camelCase) | arg type BEFORE | arg type AFTER |
|---|---|---|
| `createConversation` | `{ title?: string; workspaceId?: string; workspace_id?: string; systemPrompt?: string | null; system_prompt?: string | null }` | `{ title?: string; workspaceId?: string; systemPrompt?: string | null }` |
| `listMessages` | `{ conversationId?: string; conversation_id?: string }` | `{ conversationId?: string }` |
| `appendMessage` | `{ conversationId? | conversation_id?; role; content; thinking?; toolCalls? | tool_calls?; toolResults? | tool_results?; model? }` | `{ conversationId?: string; role; content; thinking?: string | null; toolCalls?: string; toolResults?: string; model?: string | null }` |
| `addWorkspace` | `{ label?: string; rootPath?: string; root_path?: string }` | `{ label?: string; rootPath?: string }` |
| `readFile` | `{ workspaceId?: string; workspace_id?: string; path: string }` | `{ workspaceId?: string; path: string }` |
| `writeFile` | `{ workspaceId?: string; workspace_id?: string; path: string; content: string }` | `{ workspaceId?: string; path: string; content: string }` |
| `editFile` | `{ workspaceId?: string; workspace_id?: string; path: string; oldText: string; newText: string; replaceAll?: boolean }` | `{ workspaceId?: string; path: string; oldText: string; newText: string; replaceAll?: boolean }` |
| `searchFiles` | `{ workspaceId?: string; workspace_id?: string; glob: string; contentPattern?: string | null }` | `{ workspaceId?: string; glob: string; contentPattern?: string | null }` |
| `deleteFile` | `{ workspaceId?: string; workspace_id?: string; path: string }` | `{ workspaceId?: string; path: string }` |

**V2 caller silent rejection**:V2 Tauri 时代 caller 残留(理论上 0 个真实 caller)会被 ipcMain.handle silent miss field,不抛 graceful error —— V3 V15-camel 启动后 V2 IPC contract 已终结,无 caller 路径,自然 reject。

**required-ification 注意**:`workspaceId` 不强制 required,保持 optional —— e2e 测试可能 missed 字段,handler 内部 `args.workspaceId ?? ""` fallback 已经存在 (master 当前),无需改。

### D3 — `CONTEXT.md` 同步 + drive-by `src-tauri/*` cleanup

**CONTEXT.md 同步**(camelCase 跟随):
- Line 20 (Provider.llm gloss shape):`{ defaultModel, baseUrl, apiType, models, modelsEndpoint }` + inline `apiType` + `modelsEndpoint` 字面量
- Line 24 (ModelMeta gloss prose):`ProviderService.fetchModels(id)` 调 `modelsEndpoint`
- Line 25 (Models Endpoint term):`Provider.llm.modelsEndpoint`
- Line 36 (File Tool term):`replace_all` → `replaceAll` (per ADR-0013.1)
- Line 65 (Settings gloss fields):`systemPrompt / conversations / userLanguage / startAtLogin`
- Line 99 (Fake LLM Provider gloss):`baseUrl`、llm 子 shape、`ipcMain.handle('updateSettings', ...)`
- Line 100 (Mock Server term):`baseUrl` 都受理
- Line 101 (Q→A Table term):移除 `src-tauri/src/lib.rs` 历史 reference;只用 `electron/main/index.ts`
- Line 103 (Add Provider Dialog Mock Template):pre-fill 值 shape (`baseUrl` / `apiType` / `modelsEndpoint`) + `updateSettings` IPC channel
- Line 125 (User Language term):`Settings.userLanguage`
- Line 128 (UI String term):`userLanguage`
- Line 141-145 (Domain shape file tools):`edit_file(..., replace_all)` → `replaceAll`
- Line 143 (Domain shape edit_file):`replace_all` → `replaceAll` (per ADR-0013.1 配套更新)
- Line 165 (Domain shape Provider.llm):`{ defaultModel, baseUrl, apiType, models[], modelsEndpoint }`
- Line 171 (Settings schema description):移除 `src-tauri/src/settings.rs` 历史 reference + 新增 ADR-0026 cross-link + `autoArchiveAfterDays` / `maxHistory` sanitize prose
- Line 174-225 (Settings interface code block):整体 camelCase (Provider 17 字段 + Settings 顶层 16 字段 + ModelMeta 1 字段)
- Line 237 (Settings::Default prose):`baseUrl` / `apiType` 字面量

**Drive-by src-tauri cleanup (current-state docs only)**:
- Line 101 `src-tauri/src/lib.rs` → 删除 (V3 启动钩子在 `electron/main/index.ts`)
- Line 171 `src-tauri/src/settings.rs` → 删除 (V3 schema 在 `electron/main/settings-schema.ts`)
- `src/AGENTS.md` 和 `docs/translation-rules.md` 已 clean (无 stale `src-tauri/*`)
- Historical ADRs (0001..0025 + 0013.1) 不动 —— ADR 是历史 record,retain `src-tauri/*` references 是为了"为什么这样决策"的完整性

## Considered Options

### A. 只动 IPC channel,不动 dual-form — rejected

只 rename IPC channel name 字符串,不改 ipc.ts handler arg types 的 dual-form:

**否决理由**:
- 半关联改动,V2 caller 兼容桥保留 review friction
- master 的 schema 已是 strict camelCase,dual-form 永远是 dead code
- 跟 ADR-0013.1 不对称(file-tools 内层 strict camelCase,IPC arg layer 还留 dual-form 是内部矛盾)

### B. IPC channel + dual-form,但不动 MD — rejected

只动 ipc.ts / preload / ipc-mock / ipc.test,不动 CONTEXT.md + 历史 ADR:

**否决理由**:
- CONTEXT.md 仍是 V3 pre-D10 snake snapshot,跟新代码不一致
- 历史 ADR 的 code 示例(`base_url` 等)让 reader 困惑 —— 这是 "documentation drift",与 "ADR record-of-why" 不同概念
- drive-by `src-tauri/*` 没顺手清

### C. 重命名 `SettingsV15` → `Settings` interface + bump `schemaVersion` literal `"1.5"` → `"2.0"` — rejected

不只是 IPC channel,还 rename interface + bump schemaVersion:

**否决理由**:
- 跟 master 的命名 (per fd36f6207) 不一致,重复劳动
- AGENTS.md "简单优先 + 沿用现有代码风格" —— master 已经定好 `SettingsV15` / `migrateV15SnakeToCamel` / `schemaVersion: "1.5"` 命名,本 ADR 不应在 master schema rename 之后又改名
- 8 个文件的 blast (settings-schema.ts + settings-schema.test.ts + ipc.ts + ipc-mock.ts + 2 个 settings 测试 + 2 个 ADR 引用) vs IPC channel 的 4 文件 blast 性价比差

### D. bridge layer 而不是 rename schema + IPC — rejected

保留 snake on-disk + runtime transcode layer (与 ADR-0013.1 D2 类似):

**否决理由**:
- master (per fd36f6207) 已经做了"on-disk snake → in-memory camel"单次 migration,不需加 runtime bridge
- bridge 是 permanent work,migration 是 single-shot —— 选便宜的 (per fd36f6207)

## Consequences

### 正面

- **IPC transport 全 camelCase**:4 文件 24 channel 同步,test 列表也 sync,blast radius 完整覆盖
- **dual-form drop 简化**:8 个 handler 的 arg 类型不再有 `?? args.snake ?? ""` 的 fallback 样板,reader 直接看 camelCase-only
- **CONTEXT.md ↔ master code 一致**:Settings interface code 块 / Provider.llm gloss / Domain shape 全部跟随 V3.1+ canonical
- **drive-by cleanup 顺手**:`src-tauri/*` 路径 references 在 current-state docs (CONTEXT.md) 全部清掉,跟 V3 Electron shell 现状对齐;historical ADRs 不动
- **ADR-0024 D10 (in fd36f6207) 在 transport layer 完成**:schema rename 是源头,IPC channel rename 是 transport tail,本 ADR tail-off

### 代价

- **blame diff 散落在 fd36f6207 + ADR-0026**:schema rename 在 fd36f6207,transport rename 在 ADR-0026。Reader 看 git log 时需要穿越 2 个 commit,migration rename 的 rationale 需要 ADR-0024 D10 + ADR-0026 两个引用
- **Tool LLM-facing name 与 IPC channel 永久分裂**:Anthropic protocol 的 `name: "edit_file"` 与 internal transport 的 `editFile` 不同名,debug 时需要明确 layer 边界
- **V2 caller silent rejection**:无 graceful error path,V3.0 + D10 + ADR-0026 之后所有 V2 IPC contract 已终结
- **CONTEXT.md 14+ 处改动 + 2 处 drive-by**:commit message 描述会冗长

### 未变

- `SettingsV15` interface 名字 + `schemaVersion: "1.5"` literal + `migrateV15SnakeToCamel()` 函数名 —— 全部按 master 现状保留
- LLM-facing tool `name` (Anthropic protocol 锁定 snake):`read_file` / `write_file` / `edit_file` / `search_files` / `delete_file`
- SQLite DDL 列名 (`_migrations.applied_at`、`journal_mode = WAL`、`foreign_keys = ON`) —— SQL identifier convention
- env var 名 (`CODEMAN_MOCK_PORT` / `CODEMAN_MOCK_DELTA_SIZE` / `CODEMAN_TEST_QA_TABLE`) —— OS env 惯例
- UPPER_SNAKE / single-word 常量 (`MIN_SIZE_WIDTH`、`MINIMAX_BASE_URL`、`kind`、`theme`) —— TS 常量惯例
- File Tool wire-format schema field (`workspaceId` / `oldText` / `newText` / `replaceAll` / `contentPattern`) —— per ADR-0013.1 已落地
- Effect-TS、Solid 5+1 文件夹白名单、ADR-0025 D8 type layer —— 既有硬规则

## Rollout Plan

**单 atomic commit** on `feature/electron-camelcase-0026` branch (off master `f086f30`):

```
feat(electron): IPC channel rename snake_case → camelCase + drop dual-form (ADR-0026)

IPC channel name (24 channels × 4 files):
- electron/main/ipc.ts: 24 ipcMain.handle("...", ...) strings snake → camel
- electron/preload/index.ts: 24 invoke("...", ...) strings snake → camel
- src/__mocks__/ipc-mock.ts (line 453-487): 24 methodToCmd.cmd snake → camel
- electron/main/ipc.test.ts (line 34-58): EXPECTED_CHANNELS array snake → camel

Drop dual-form V2 caller bridges (ipc.ts):
- 9 handlers: createConversation / listMessages / appendMessage / addWorkspace /
  readFile / writeFile / editFile / searchFiles / deleteFile
- arg types: from "{ camelCase | snake_case }" dual-form to strict camelCase-only
- handler logic inlines: `args.workspaceId ?? args.workspace_id ?? ""` → `args.workspaceId ?? ""`

CONTEXT.md inline sync:
- Provider.llm / Settings / Domain shape / Settings interface code 块
  camelCase 跟随 master V3.1+ canonical
- File Tool term: replace_all → replaceAll (per ADR-0013.1 配套)
- drive-by: 移除 current-state docs 中 stale `src-tauri/src/*.rs` 路径 references

Verify:
- vp run typecheck: exit 0
- vp run test: 全部通过
- vp run lint: 修改文件无新违规

Reference:
- ADR-0026 supersede fd36f6207 ADR-0024 D10 剩余 transport tail
- Tool LLM-facing name ("read_file" 等) 不变 (Anthropic protocol snake)
```

**Verify gate**:
- `vp run typecheck` → exit 0
- `vp run test` → 全部通过 (含 settings-schema.test.ts 已有的 19 migration tests + ipc.test.ts channel registration + settings.test.tsx + ipc-mock 测试)
- `vp run lint` → 修改文件无新违规
- 新测试 (可选,可加可不加):`ipc.ts registerIpcHandlers()` 调 `ipcMain.handle("readFile", ...)` 后,`fakeIpcMain.handle.mock.calls[0]` 第一个 arg 是 `"readFile"` 而非 `"read_file"` —— 现有 `it("registers all 23 expected ipcMain.handle channels ...")` 自动覆盖。

**不开 PR**(per project convention;本地 commit 等 user review 指令)。

## References

- ADR-0013 (V2 file IO) — B 段 table 字段名被 ADR-0013.1 supersede
- ADR-0013.1 (file-tools wire-format rename) — 直接 precedent,本 ADR 是其 Electron transport layer 对应
- ADR-0015 (Provider.apiKey 单字段) — 同方向(TS 内层 + provider record)
- ADR-0024 + D10 (fd36f6207 落地) — schema rename 在 schema 层完成,本 ADR 跟进 transport 层
- ADR-0025 (effect/Schema 全栈) — D8 type layer 与 settings-schema 对齐
- `fd36f6207 fix(e2e): wire format snake→camel (ADR-0024 D10)` — schema 字段已落地
- `b6ce135 refactor(types): snake_case → camelCase in shared types and consumers` — TS 内层现状
- `151beec refactor(CONTEXT.md): update terminology from snake_case to camelCase for consistency` — glossary 已部分统一,本 ADR 进一步 sync
- `electron-store` (persistence layer) — 不感知 schema key case,只关心 JSON 结构
- Anthropic tool dispatch protocol — tool `name` field 在 API 边界用 snake (`read_file` / `edit_file` 等)
