# src/features/chat/ — Chat Feature (聊天域)

> **chat feature** = lib (`createAgentRuntime`) + stores (`chat.store` Solid createStore) + components (4 UI 原子 + 2 workspace dialogs) + routes。
> 本目录结构遵循 [ADR-0010](../../../docs/adr/0010-frontend-5-1-folder-whitelist.md) 的 5 子目录白名单（`stores` / `components` / `routes` / `hooks` / `lib`）。
> WorkspaceService **V3+ 提升到 `src/shared/lib/workspace-service.ts`**（共享基础设施）。因 appStore.pickWorkspacePath()（ADR-0016 D4）需要 Effect service 注入，shared/ 不能 import features/，违反 src/shared/AGENTS.md line 52 单向依赖规则。
> File tools（`src/features/file-tools/lib/file-tools.ts`）由本 feature 的 `lib/runtime.ts` 引用注册。
> **注意**：`src/features/billing/` 目录从未落地（ADR-0012 V2 反转时合并到 file-tools 工具 schema 模式）。billing tools 概念已并入 file-tools 的统一 tools 数组。
> Workspace 是 chat 域子概念（per ADR-0023 D8-W），不再归 Settings。

## 目录布局（ADR-0010 V1.5 + ADR-0019 V2）

```
src/features/chat/
├── index.ts              # Barrel — public API（feature 根级唯一允许的文件之一）
├── AGENTS.md             # 本文件
│
├── lib/                  # 纯逻辑 / Effect-TS 运行时
│   ├── runtime.ts        # createAgentRuntime() 工厂 + ProviderConfig / RunOptions / AgentRuntime 类型
│   └── runtime.test.ts   # 工厂模式 + mock Agent + per-run lifecycle
│
│ # WorkspaceService 已 V3+ 提升到 `src/shared/lib/workspace-service.ts`（共享基础设施）。
│ # 因 appStore.pickWorkspacePath()（ADR-0016 D4）需要 Effect service 注入，shared/
│ # 不能 import features/，违反 src/shared/AGENTS.md line 52 单向依赖规则。
│
├── stores/               # 反应式状态（Solid createStore）
│   ├── chat.store.ts     # 原 conversations.store.ts (renamed); ConversationState + workspace CRUD + bridge
│   └── chat.store.test.ts
│
├── components/           # UI 组件
│   ├── home.tsx          # Codex-like 首页（无 active conv 时：CodemanSidebar + HomeAgentForm 两栏）
│   ├── home.test.tsx
│   ├── message-bubble.tsx # Role-aware message renderer
│   ├── message-bubble.test.tsx
│   ├── tool-call-card.tsx # Tool invocation card
│   ├── tool-call-card.test.tsx
│   ├── chat-view.tsx     # Main chat UI（用 chat.store，不再 import messages.store / agent.store）
│   ├── chat-view.test.tsx
│   ├── row-actions.tsx   # Sidebar 行操作（delete inline-confirm + rename inline edit-in-place，三状态机 idle | confirming-delete | editing）
│ # 注意：delete workspace 走 **inline-confirm**（点 trash 按钮 → 在原行位置上显示
│ # `删除` / `取消` overlay, 不弹模态）。rename workspace 同样走 **inline edit-in-place**
│ #（点 pencil 按钮 → 行内出现 input 框，回车确认）。两者均由 RowActions 组件承载，
│ # `idle | confirming-delete | editing` 三状态机，所有 sidebar 行操作（workspace + conv）
│ # 均过 RowActions，取代已删除的 `Dialog.confirm()` modal + `workspace-rename-dialog.tsx` +
│ # `workspace-actions.tsx` + `conv-delete-action.tsx`（per 用户 2026-07-25 反馈）。
│
└── routes/
    └── index.tsx         # ChatLayout — Sidebar + ChatView + Settings link
```

> **路径演变**：
>
> - `runtime.ts`（feature 根级） → `lib/runtime.ts`（ADR-0010）
> - `store/conversations.ts` → `stores/conversations.store.ts`（单数 → 复数，加 `.store` 后缀，ADR-0010）
> - `messages.store.ts` + `agent.store.ts` → **删除**，合并到 `conversations.store.ts`（ADR-0019 D3）
> - 旧 `types/` 目录（空）已删除
>
> `hooks/` 目录 V1 暂无，未来首个 `use-` 钩子（候选：`useConversations` / `useDebouncedQuery`）落地时创建。
>
> **V2.4+ 新增 input-history**：
> ```
> src/features/chat/
> ├── lib/
> │   ├── input-history.ts          # 纯函数:localStorage load/save/recordEntry
> │   └── input-history.test.ts
> └── stores/
>     ├── input-history.store.ts    # Solid signal + navigation cursor
>     └── input-history.store.test.ts
> ```

## 硬性规则

- **UI 组件（`components/*.tsx`）禁止导入 `effect`。** 它们是纯 Solid signal / createStore 消费者。逻辑层在 `stores/*.ts` 和 `lib/*.ts` 中。
- **`createAgentRuntime` 工厂函数，无 `Context.Tag` / Layer DI / Map**（V2 起，按 [ADR-0019](../../../docs/adr/0019-per-run-transient-agent.md) supersede [ADR-0014](../../docs/adr/0014-per-conversation-agent.md) D1 + D4）。
  - 每个 Conversation 对应一个 `createAgentRuntime()` 产物，存放在 `ConversationState.runtime`（在 `conversations.store.ts` inline 定义）。
  - `run({ context, provider })`：`context: Message[]` 是 store messages 浅拷贝（含最新 user msg）；`provider: ProviderConfig` 包含 `apiKey` / `baseUrl` / `defaultModel` / `systemPrompt` / `tools`。每次 run 新建 pi-mono `Agent` + `Queue.unbounded<RuntimeEvent>` + `Effect.fork` fiber。
  - `cancel()`：调 closure 内 `AbortController.abort()` 触发 fetch abort。in-flight partial 保留在 store（stream 订阅实时写）。
  - `archiveConversation` / `deleteConversation` store 入口在调 DB 删之前**必须**先调 `runtime.cancel()`，再从 `store.byId` 移除 ConvState（runtime 随 ConvState GC）。
- **`chat.store.ts` 是 chat 域唯一 store**（V2 起合并 `messages.store` + `agent.store`，per ADR-0019 D3）。
  - 内嵌 `ConversationState` 类型（DB fields + `messages: Message[]` + `streamingMessageId: string | null` + `runtime: AgentRuntime`）。
  - 唯一响应式源：Solid `createStore<{ activeId: string | null; byId: Record<ConvId, ConversationState> }>`。
  - `sendMessage(convId, content, provider)`：`append user msg`（local + DB persist）→ `context = [...byId[convId].messages]` → `runtime.run({ context, provider })` → `Stream.runForEach` 订阅，更新 `byId[convId].messages` / `streamingMessageId`。
  - UI 读 `store.byId[activeId()]?.messages`，Solid proxy 自动按路径细粒度反应式，跨 conv streaming 不互相重算。
  - ADR-0016 D4-D5-D6 的"组件不直接 import runtime"约束保留：组件调 `conversations.store.sendMessage(...)` / `conversations.store.cancel(convId)` / `conversations.store.archiveConversation(convId)`，不直接 import `lib/runtime.ts`。
- **组件不调 IPC。** 所有 IPC 走 `src/shared/lib/ipc.ts` Service Tags（由 preload contextBridge 暴露的 `window.codeman.invoke`），在 `conversations.store.ts` 内 `yield*` 使用。
- ~~**`Sidebar` 用 `createSignal` 做局部状态。**~~（V1.x sidebar 移除 — 由 `shared/components/internal/codeman-sidebar` 替代，详见 [ADR-0022](../../../docs/adr/0022-internal-components-and-design-tokens.md) D1 + D3）
- **CodemanSidebar 是 accordion 模式嵌套 tree**（[ADR-0023 D7-CS](../../../docs/adr/0023-codeman-prefix-and-ark-ui-select.md)）：`CodemanSidebar` 内部维护 `expandedWorkspaceId` signal，workspace 永远不 active，只有 conv 可以 active。Sidebar 不调用任何 `last_used_workspace_id` 相关 API——该字段已删除（D8-W）。
- **Home（无 active conv 时）渲染 CodemanSidebar + HomeAgentForm 两栏布局。** Home 是 `/` 路由在 `activeId === null` 时的形态。`CodemanSidebar` 由 chat feature 喂数据（workspaces + items + handlers），不直接 import `conversations.store`；`HomeAgentForm` 包含 input box（disabled until workspace 选中）+ workspace picker（必选解锁 input）。详见下方 "Home 路由 + Codex form" section。
- **ChatView（有 active conv 时）满屏单页布局，** 顶部加 "← 返回首页" 按钮调 `navigate({ to: "/" })` 清空 `activeId$()`。chat-view 自身不变（消息列表 + input + provider select + send/cancel）。
- **Home → ChatView 切换 = `selectConversation(id)` 设 activeId。** MainContent 切到 ChatView。Home 的 workspace 预选走 `Settings.last_used_workspace_id`（如果存在；D8-W 后该字段已删除，Home 总是要求用户选 workspace）。

## Home 路由 + Codex form

`/` 路由在 chat feature 落地为状态机（`src/features/chat/routes/index.tsx` + `src/features/chat/components/home.tsx`）：

```
ChatLayout
  ├── CodemanSidebar (左侧，always visible when no conv)
  │     └── workspaces + items 由 home 喂 props
  └── MainContent
        ├── activeId === null → HomeAgentForm (右侧居中)
        │     ├── <input> (disabled until workspace 选中)
        │     ├── WorkspacePicker (codeman-select dropdown，1 ws 时 auto-select)
        │     └── <Button> 发送
        └── activeId !== null → ChatView (满屏 + 返回按钮)
```

**Home send 流程**：

1. 用户在 HomeAgentForm 选 workspace + type + 点发送
2. `createConversation(workspaceId, title, firstMessage)` 入 DB
3. `selectConversation(id)` → activeId 设 → MainContent 切到 ChatView
4. `sendMessage(id, firstMessage, provider)` → LLM 立即 streaming

**Workspace 预选状态机**（D8-W 后简化，**无** `last_used_workspace_id`）：

- 0 workspace → HomeAgentForm 永久 disable input + "Add a workspace" CTA 调 picker
- 1 workspace → `setSelectedWorkspaceId(唯一那个)` 自动选，input 立即可用
- 2+ workspace → 无预选，input disable，用户从下拉选 workspace 后 input 解锁

**返回首页**：

ChatView 顶部 "← 返回首页" 按钮调 `navigate({ to: "/" })` 并清空 `activeId$()`。MainContent 切回 HomeAgentForm，**无** workspace 预选（用户必须重新选）。

## 输入框下方的 provider 选择器

V1.x 起 ChatView 在 textarea 下方（form 第二行）渲染一个 `<select id="provider-select">`，让用户在不进 Settings 的情况下切换活跃 LLM provider。

**数据源**：`appStore.state.value.providers[]`（V1.5 unified schema, ADR-0012 + ADR-0015）。
`ProviderSelect` 现在用 `codeman-group-select` 包装（`shared/components/internal/codeman-group-select.tsx`，@ark-ui/solid Select 包装），按 provider 分组渲染（ItemGroup + ItemGroupLabel）；enabled + llm filter 由 `buildEnabledProviders` 提取（`src/features/chat/lib/build-enabled-providers.ts`）；组件位于 `chat-view.tsx` 内作为本地子组件。
billing-only / disabled / 无 llm 的 provider 不显示。

**写路径**：

- 用户切换 → 同步更新 `appStore` 中对应 provider 的 `llm.defaultModel` 为选中模型，并更新 `defaultLlmProviderId` 为其 providerId（ADR-0016 Default Model Invariant）
- 然后 `settingsSaver.scheduleSave()` debounced 500ms 刷到后端（跟 settings 域同 pattern, ADR-0015）
- `conversations.store.sendMessage()` 入口从 `appStore` 读当前 `default_llm_provider_id` + 对应 provider 配置,构造 `ProviderConfig` 传给 `runtime.run({ ..., provider })`(per ADR-0019 D2 "provider 是 run-time 参数")

**不变量**（per ADR-0019 D1 + D2）：

- Provider 是 `run({ context, provider })` 的**参数**(per-run)，不是 closure 变量 — 每次 send 都从 `appStore` 读 `default_llm_provider_id` 当前值构造 `ProviderConfig`
- 已 in-flight 的 conversation 在切换 selector 后**不会**改 provider(已在跑的那次 run 闭包锁定的 `ProviderConfig` 保留到 run 结束)
- 新 conversation 下次 send 时取新的 `default_llm_provider_id` 构造新 `ProviderConfig`
- 与 V1.6 ADR-0014 D1 "首次 run 锁定 provider" 的差异:provider 现在跟 `run()` 调用绑定,不再跟 `AgentRuntime` 实例生命周期绑定 — 等价行为(in-flight 不变),但实现更直接

**空状态**：所有 provider 都 disabled / 没 LLM 时，`<select>` 不渲染，改渲染 "无 provider — 前往 settings" 链接（指向 `/settings`），引导用户去配置。

**实现位置**：`ProviderSelect` 是 `chat-view.tsx` 内的本地子组件（非 feature 共享），内部用 `codeman-group-select` 渲染。它直接读 `appStore` 状态而不是通过 `SettingsService` IPC,避免在每次组件渲染时都触发 IPC。debounced flush 走 `settingsSaver.scheduleSave()`（settings feature 的 lib, 跨 feature import 允许）。

## Runtime 事件（5 变体）

| 变体          | Payload                        | UI 副作用（`conversations.store` 内 `handleEvent`）                                                                                                                                                |
| ------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `token`       | `string`                       | `setStore("byId", convId, "messages", msgs => appendAssistantDelta(msgs, evt.content))`                                                                                                            |
| `tool_call`   | `ToolCall`                     | `setStore("byId", convId, "messages", msgs => appendToolCall(msgs, evt.toolCall))`                                                                                                                 |
| `tool_result` | `toolCallId + result + error?` | `setStore("byId", convId, "messages", msgs => finalizeToolResult(msgs, evt.toolCallId, evt.result, evt.error))`                                                                                    |
| `done`        | `Message`                      | **per-turn (ADR-0028 Bubble Boundary)** — 每个 `turn_end` emit 1 个 `done`，产生 1 个 assistant bubble。`setStore("byId", convId, "messages", msgs => finalizeAssistantMessage(msgs, evt.message))` + `setStore("byId", convId, "streamingMessageId", null)` + `void persistAssistantMessage(evt.message)`。 1 user input → N 个 turn → N 个 done → N 个 assistant bubbles (turn-1's `toolCalls`/`toolResults` 留在 turn-1 bubble，不跨 turn 聚合到 turn-N) |
| `error`       | `{ message: string }`          | `logger.error("[ChatAgent] runtime error:", evt.error)`                                                                                                                                            |

## 测试模式

| 层         | 测试文件                             | 框架                                                                      |
| ---------- | ------------------------------------ | ------------------------------------------------------------------------- |
| Runtime    | `lib/runtime.test.ts`                | `@effect/vitest` + `it.effect()`，factory 直接调 + mock `Agent` / `Queue` |
| Store      | `stores/conversations.store.test.ts` | `vitest` + Solid Testing Library（`render` + `createRoot`）               |
| Components | `components/*.test.tsx`              | `vitest` + `@solidjs/testing-library` + `render`                          |

**Runtime tests**: `createAgentRuntime()` 无 `Layer` 依赖,直接调用工厂函数 + mock `Agent` / `Queue` / `AbortController`。`run()` 内部 Effect 通过 `Effect.runPromise` 或 `Effect.runSync` 触发,断言 stream 输出。

**Store tests**: Solid Testing Library `createRoot` 包裹 reactive scope,直接读 `store.byId[convId].messages` / `streamingMessageId` 断言反应式更新。Mock `MessageService` / `ConversationService` 在 store 测试 entry 通过 `vi.mock("../../../shared/lib/ipc", ...)` 注入。

**Component tests**: 通过 `vi.mock("../stores/conversations.store")` mock store 模块。`chat-view.test.tsx` 不再 mock `messages.store` / `agent.store`(已删除)。

## 图标策略

图标来自 **lucide-solid**（项目依赖）。**所有 UI 不使用 emoji**。统一映射：

| 语义 | lucide icon | 用法 |
|---|---|---|
| running / streaming / thinking | `Loader2` (`class="animate-spin"`) | tool-call-card running, sidebar streaming 徽标, chat-view 思考中 |
| success | `CheckCircle2` | tool-call-card success, message-bubble tool success |
| error | `XCircle` | tool-call-card error, message-bubble tool error |
| folder browse | `FolderOpen` | workspace-card "Browse…" 按钮 |

**测试断言**：`expect(icon?.textContent).toBe("⏳")` 等 emoji 字符串形式已废止，改用 `data-testid` / `aria-label` 选择器（如 `aria-label="streaming"` / `aria-label="running"` / `data-testid="icon-success"`）。

## 跨 feature 引用

- **Billing tools**：**未实现**（见上述 billing 目录未落地的说明）。若未来需要独立 LLM 工具域（web search / image gen），按 ADR-0010 5+1 白名单新建 `features/<domain>/lib/<name>.ts` 并注册到本 feature 的 `lib/runtime.ts`。
- **File tools**：`src/features/file-tools/lib/file-tools.ts` 导出 `fileTools`（5 个：read / write / edit / search / delete），本 feature `lib/runtime.ts` 注册到 `Agent`。
- **跨域类型**：从 `src/shared/lib/types.ts` 导入（ADR-0010 后从 `shared/types/` 迁）。
- **跨域 IPC**：从 `src/shared/lib/ipc.ts` 导入 Service Tags。
- **`codeman-select` / `codeman-group-select` wrappers from `shared/components/internal/`** (2026-07 起从 `ui/` 迁出, 因为引入 @ark-ui/solid 不属于纯 design system atom) — used by HomeAgentForm (workspace picker) + chat-view ProviderSelect (provider picker)
- **`codeman-textarea` from `shared/components/internal/`** — used by HomeAgentForm + ChatView 的 chat input。内部 USE `ui/Textarea` atom + IME-safe onValueChange (中文拼音 composition 安全)。

## Wave 笔记

- **Wave 4**（2026-06-14）：从 `src/agent/` → `src/features/chat/` 迁移
- **Wave V1.5**（2026-06-15，ADR-0010）：`runtime.ts` 从根级入 `lib/`；`store/` → `stores/`；删空 `types/`
- **Wave V2**（2026-06-25，ADR-0019）：`AgentRuntime` service 单例 + Map → `createAgentRuntime()` 工厂 + per-conv `ConversationState.runtime`；`messages.store` + `agent.store` 合并到 `conversations.store`；`createStore<{ activeId, byId }>` 取代全局 signal + Map；supersede ADR-0014 D1 + D4
- **Wave V2.1**（2026-06-27，ADR-0022）：V1.x `sidebar.tsx` **删除**；新增 `home.tsx` (Codex-like 2 栏)；`/shared/components/ui/sidebar.tsx` primitive + `/shared/components/internal/codeman-sidebar.tsx` 业务组合落地（首例 internal/）；emoji 全面迁移 lucide-solid (Loader2/CheckCircle2/XCircle/FolderOpen)；`Conversation.workspace_id` 必填（per-Conv 绑定）；`Settings.last_used_workspace_id` 引入（**D8-W 删除**）
- **Wave V2.1 polish**（2026-06-27，ADR-0023）：`agent-sidebar` → `codeman-sidebar` 原子重命名；`agent-sidebar` → `codeman-sidebar` 全部原子化（单 commit + 全部 consumer 同步）；home.tsx `WorkspaceCard` 卡片网格 → `codeman-select` 下拉（含 Action slot "+ Add new workspace…"）；chat-view.tsx `ProviderSelect` 本地 `<select>` → `codeman-group-select`（按 provider 分组）；`buildEnabledProviders` helper 抽取到 `src/features/chat/lib/build-enabled-providers.ts`；e2e spec 10 重写；CONTEXT.md 加 Codeman Component + UI Primitive 词条；src/shared/AGENTS.md 加 codeman-* 命名空间规则 + Naming convention for internal/ 段。
- **Wave V2.2**（2026-06-28，ADR-0023 D8-W）：`conversations.store.ts` → `chat.store.ts` 重命名；Workspace 所有权从 appStore 迁入 chat domain（WorkspaceService Effect Context.Tag + Electron SQLite + IPC）；`Settings.workspaces[]` + `enabled` 字段删除；`WorkspaceCard` 删除；sidebar hover rename/delete dialog 落地；`shared/components/ui/dialog.tsx` + `internal/codeman-dialog.tsx` 新增。
- **Wave V2.3**（2026-07-04）：Sidebar always-show — 删除 `chat-layout.tsx` 中 `<Show when={workspacesExist()}>` 包裹，sidebar 在 0 workspace 时也渲染（此前仅 workspace>0 时显示）。CodemanSidebar 自身处理 0 workspace 空态。
- **Wave V2.4+ 输入历史**（2026-07-12，feature request）：新增输入历史栈（最多 100 条,localStorage 持久化）。两输入框 (Home + ChatView) 共享同一份；↑/↓ 在空 input 上做历史导航（与 bash readline 同语义）。新增 `lib/input-history.ts` + `stores/input-history.store.ts`，chat-view.tsx / home.tsx 各加 `recordInputEntry(text)` 入 handleSend + ↑/↓ 键处理器。`store.ts` 是 chat 域自治 store，与 chat.store 同模块级 singleton 设计；UI 组件只 import signal 访问器 + handler 辅助函数。
- **Wave V2.5**（2026-07-25，用户反转）：workspace rename 从 modal（`workspace-rename-dialog.tsx`）→ inline edit-in-place；workspace delete 同样是 inline-confirm overlay（取代 `Dialog.confirm()` modal）；统一由 `RowActions` 组件（`idle | confirming-delete | editing` 三状态机）承载。删除废弃组件：`workspace-rename-dialog.tsx` + `workspace-rename-dialog.test.tsx` + `workspace-actions.tsx` + `workspace-actions.test.tsx` + `conv-delete-action.tsx` + `conv-delete-action.test.tsx`。详见 [ADR-0023 D8-W6](./docs/adr/0023-codeman-prefix-and-ark-ui-select.md) 2026-07-25 反转记录。

## 输入历史 (Input History)

> V2.4+ feature：用户在 chat 输入框中提交的消息被记录为历史栈；按 ↑ / ↓ 在空 input 上做历史导航。
>
> **设计原则**：参考 bash readline 行为；UX 简洁优先（无 dropdown 浮层、无位置指示）；存储轻量；跨 Home / ChatView 共享。

### 存储

- localStorage 键 `codeman.input-history.v1`，JSON 数组（newest-first）
- 上限 100 条，FIFO 淘汰；连续相同内容去重；trim() 后空白不记
- **不**走 SQLite / IPC——本项目其它持久化（settings / workspace / conversations）均在 SQLite，但 100 条 × 几 KB 的小规模 + 单进程单窗口假设不值得引 SQL migration + IPC channel
- 持久化是 best effort：`localStorage.setItem` 抛 `QuotaExceededError` 时静默吞，不阻塞主 send 流程（设计裁决）

### 信号 API (`stores/input-history.store.ts`)

```ts
// 公开 accessor
export const inputHistory$: Accessor<string[]>;             // newest-first
export const inputHistoryCursor$: Accessor<number>;          // -1 = 输入态；0..N-1 = 历史位置

// 写入（在 handleSend 调）
export function recordInputEntry(content: string): void;     // trim + dedup + cap + 持久化 + 重置 cursor

// 推进（handler 内部用，但暴露供测试）
export function navigateInputHistoryPrev(): NavResult | null;
export function navigateInputHistoryNext(): NavResult | null;

// UI 集成辅助（在 onKeyDown 调；返回是否 preventDefault）
export function handleArrowUp(getInput, setInput): boolean;
export function handleArrowDown(setInput): boolean;
```

### 键盘契约 (chat-view + home)

| 键 | 触发条件 | 不触发时的行为 |
|---|---|---|
| `↑` | `input().trim() === ""` **且** `inputHistory$.length > 0`，或在历史导航态（cursor !== -1） | 让 textarea 原生 caret 接管（不 preventDefault） |
| `↓` | `inputHistoryCursor$() !== -1` | 同上 |

**边界行为**（与 bash readline 一致）：
- 最老条目上再按 `↑`：no-op（stay）
- 最新条目（cursor=0）上按 `↓`：input 清空、cursor=-1、退出历史态
- 历史为空时按 `↑` / 空 input 上 `↓` (cursor=-1)：no-op
- 在历史内编辑（仅改 input 不动 cursor）后再按 `↑`：`Q5c=I` 继续向旧翻（因为 cursor 仍在历史）

### 提交触发

`recordInputEntry(text)` 在 `setInput("")` **之后** 调用（chat-view.tsx 的 handleSend；home.tsx 的 Step 2）。`text` 已在 trim 校验后通过——`recordInputEntry` 内部仍做 trim + dedup + cap 三层保险。

### 单测覆盖

- `lib/input-history.test.ts`：12 个 it 覆盖 load / save / recordEntry 的 trim、dedup、cap、JSON 损坏、非 string 元素过滤
- `stores/input-history.store.test.ts`：16+ 个 it 覆盖 cursor 状态机 + persistence + handler 辅助函数

### 不变量

- 两输入框共享**同一**份历史（Home 发完后 ChatView 按 ↑ 可见）
- `recordInputEntry` 总是把 cursor 重置回 -1（无论是否真写了 history）
- 持久化失败不抛错（best effort）
- input 触发历史后用户**编辑该历史**保留 cursor（输入态仍处于历史）


