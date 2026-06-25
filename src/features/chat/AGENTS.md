# src/features/chat/ — Chat Feature (聊天域)

> **chat feature** = lib (`createAgentRuntime` 工厂) + stores (`conversations.store` Solid createStore) + components (4 UI 原子) + routes。
> 本目录结构遵循 [ADR-0010](../../docs/adr/0010-frontend-5-1-folder-whitelist.md) 的 5 子目录白名单（`stores` / `components` / `routes` / `hooks` / `lib`）。
> Billing tools（`src/features/billing/lib/billing.ts`）由本 feature 的 `lib/runtime.ts` 引用注册。

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
├── stores/               # 反应式状态（Solid createStore）
│   ├── conversations.store.ts  # ConversationState 类型 + createStore + sendMessage + handleEvent + CRUD
│   └── conversations.store.test.ts
│
├── components/           # UI 组件
│   ├── sidebar.tsx       # Conversation list + search + streaming 状态点
│   ├── sidebar.test.tsx
│   ├── message-bubble.tsx # Role-aware message renderer
│   ├── message-bubble.test.tsx
│   ├── tool-call-card.tsx # Tool invocation card
│   ├── tool-call-card.test.tsx
│   ├── chat-view.tsx     # Main chat UI（用 conversations.store，不再 import messages.store / agent.store）
│   └── chat-view.test.tsx
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

## 硬性规则

- **UI 组件（`components/*.tsx`）禁止导入 `effect`。** 它们是纯 Solid signal / createStore 消费者。逻辑层在 `stores/*.ts` 和 `lib/*.ts` 中。
- **`createAgentRuntime` 工厂函数，无 `Context.Tag` / Layer DI / Map**（V2 起，按 [ADR-0019](../../docs/adr/0019-per-run-transient-agent.md) supersede [ADR-0014](../../docs/adr/0014-per-conversation-agent.md) D1 + D4）。
  - 每个 Conversation 对应一个 `createAgentRuntime()` 产物，存放在 `ConversationState.runtime`（在 `conversations.store.ts` inline 定义）。
  - `run({ context, provider })`：`context: Message[]` 是 store messages 浅拷贝（含最新 user msg）；`provider: ProviderConfig` 包含 `apiKey` / `baseUrl` / `defaultModel` / `systemPrompt` / `tools`。每次 run 新建 pi-mono `Agent` + `Queue.unbounded<RuntimeEvent>` + `Effect.fork` fiber。
  - `cancel()`：调 closure 内 `AbortController.abort()` 触发 fetch abort。in-flight partial 保留在 store（stream 订阅实时写）。
  - `archiveConversation` / `deleteConversation` store 入口在调 DB 删之前**必须**先调 `runtime.cancel()`，再从 `store.byId` 移除 ConvState（runtime 随 ConvState GC）。
- **`conversations.store.ts` 是 chat 域唯一 store**（V2 起合并 `messages.store` + `agent.store`，per ADR-0019 D3）。
  - 内嵌 `ConversationState` 类型（DB fields + `messages: Message[]` + `streamingMessageId: string | null` + `runtime: AgentRuntime`）。
  - 唯一响应式源：Solid `createStore<{ activeId: string | null; byId: Record<ConvId, ConversationState> }>`。
  - `sendMessage(convId, content, provider)`：`append user msg`（local + DB persist）→ `context = [...byId[convId].messages]` → `runtime.run({ context, provider })` → `Stream.runForEach` 订阅，更新 `byId[convId].messages` / `streamingMessageId`。
  - UI 读 `store.byId[activeId()]?.messages`，Solid proxy 自动按路径细粒度反应式，跨 conv streaming 不互相重算。
  - ADR-0016 D4-D5-D6 的"组件不直接 import runtime"约束保留：组件调 `conversations.store.sendMessage(...)` / `conversations.store.cancel(convId)` / `conversations.store.archiveConversation(convId)`，不直接 import `lib/runtime.ts`。
- **组件不调 IPC。** 所有 Tauri IPC 走 `src/shared/lib/tauri.ts` Service Tags，在 `conversations.store.ts` 内 `yield*` 使用。
- **`Sidebar` 用 `createSignal` 做局部状态。** `query` / `debouncedQuery` / `setQuery/setDebouncedQuery` signals 是组件局部的。streaming 状态点（per-conv 反馈）走 `conversations.store`：读 `Object.values(store.byId).filter(c => c.streamingMessageId !== null)` 列出所有正在 streaming 的 conv，在 sidebar 列表项旁显示 ⏳ 徽标。

## 输入框下方的 provider 选择器

V1.x 起 ChatView 在 textarea 下方（form 第二行）渲染一个 `<select id="provider-select">`，让用户在不进 Settings 的情况下切换活跃 LLM provider。

**数据源**：`appStore.state.value.providers[]`（V1.5 unified schema, ADR-0012 + ADR-0015）。
`ProviderSelect` 内部 filter: `providers.filter(p => p.enabled && p.llm)` — enabled 且有 LLM 配置的 provider 才列出。
billing-only / disabled / 无 llm 的 provider 不显示。

**写路径**：

- 用户切换 → `appStore.set({ default_llm_provider_id: nextId })` 同步更新本地 state
- 然后 `settingsSaver.scheduleSave()` debounced 500ms 刷到后端（跟 settings 域同 pattern, ADR-0015）
- `conversations.store.sendMessage()` 入口从 `appStore` 读当前 `default_llm_provider_id` + 对应 provider 配置,构造 `ProviderConfig` 传给 `runtime.run({ ..., provider })`(per ADR-0019 D2 "provider 是 run-time 参数")

**不变量**（per ADR-0019 D1 + D2）：

- Provider 是 `run({ context, provider })` 的**参数**(per-run)，不是 closure 变量 — 每次 send 都从 `appStore` 读 `default_llm_provider_id` 当前值构造 `ProviderConfig`
- 已 in-flight 的 conversation 在切换 selector 后**不会**改 provider(已在跑的那次 run 闭包锁定的 `ProviderConfig` 保留到 run 结束)
- 新 conversation 下次 send 时取新的 `default_llm_provider_id` 构造新 `ProviderConfig`
- 与 V1.6 ADR-0014 D1 "首次 run 锁定 provider" 的差异:provider 现在跟 `run()` 调用绑定,不再跟 `AgentRuntime` 实例生命周期绑定 — 等价行为(in-flight 不变),但实现更直接

**空状态**：所有 provider 都 disabled / 没 LLM 时，`<select>` 不渲染，改渲染 "无 provider — 前往 settings" 链接（指向 `/settings`），引导用户去配置。

**实现位置**：`ProviderSelect` 是 `chat-view.tsx` 内的本地子组件（非 feature 共享）。它直接读 `appStore` 状态而不是通过 `SettingsService` IPC,避免在每次组件渲染时都触发 IPC。debounced flush 走 `settingsSaver.scheduleSave()`（settings feature 的 lib, 跨 feature import 允许）。

## Runtime 事件（5 变体）

| 变体          | Payload                        | UI 副作用（`conversations.store` 内 `handleEvent`）                                                                                                                                                |
| ------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `token`       | `string`                       | `setStore("byId", convId, "messages", msgs => appendAssistantDelta(msgs, evt.content))`                                                                                                            |
| `tool_call`   | `ToolCall`                     | `setStore("byId", convId, "messages", msgs => appendToolCall(msgs, evt.toolCall))`                                                                                                                 |
| `tool_result` | `toolCallId + result + error?` | `setStore("byId", convId, "messages", msgs => finalizeToolResult(msgs, evt.toolCallId, evt.result, evt.error))`                                                                                    |
| `done`        | `Message`                      | `setStore("byId", convId, "messages", msgs => finalizeAssistantMessage(msgs, evt.message))` + `setStore("byId", convId, "streamingMessageId", null)` + `void persistAssistantMessage(evt.message)` |
| `error`       | `{ message: string }`          | `logger.error("[ChatAgent] runtime error:", evt.error)`                                                                                                                                            |

## 测试模式

| 层         | 测试文件                             | 框架                                                                      |
| ---------- | ------------------------------------ | ------------------------------------------------------------------------- |
| Runtime    | `lib/runtime.test.ts`                | `@effect/vitest` + `it.effect()`，factory 直接调 + mock `Agent` / `Queue` |
| Store      | `stores/conversations.store.test.ts` | `vitest` + Solid Testing Library（`render` + `createRoot`）               |
| Components | `components/*.test.tsx`              | `vitest` + `@solidjs/testing-library` + `render`                          |

**Runtime tests**: `createAgentRuntime()` 无 `Layer` 依赖,直接调用工厂函数 + mock `Agent` / `Queue` / `AbortController`。`run()` 内部 Effect 通过 `Effect.runPromise` 或 `Effect.runSync` 触发,断言 stream 输出。

**Store tests**: Solid Testing Library `createRoot` 包裹 reactive scope,直接读 `store.byId[convId].messages` / `streamingMessageId` 断言反应式更新。Mock `MessageService` / `ConversationService` 在 store 测试 entry 通过 `vi.mock("../../../shared/lib/tauri", ...)` 注入。

**Component tests**: 通过 `vi.mock("../stores/conversations.store")` mock store 模块。`chat-view.test.tsx` 不再 mock `messages.store` / `agent.store`(已删除)。

## 图标策略

图标来自 **lucide-solid**（已是项目依赖）。新代码中不要使用 emoji。
`components/tool-call-card.tsx` 中已有的 emoji（`⏳ ✓ ✗`）暂保留；新 UI 使用 lucide-solid。

## 跨 feature 引用

- **Billing tools**：`src/features/billing/lib/billing.ts` 导出 `billingTools`，本 feature `lib/runtime.ts` 注册到 `Agent`。
- **File tools**：`src/features/file-tools/lib/file-tools.ts` 导出 `fileTools`（5 个：read / write / edit / search / delete），本 feature `lib/runtime.ts` 注册到 `Agent`（与 billingTools 并列）。
- **跨域类型**：从 `src/shared/lib/types.ts` 导入（ADR-0010 后从 `shared/types/` 迁）。
- **跨域 IPC**：从 `src/shared/lib/tauri.ts` 导入 Service Tags。

## Wave 笔记

- **Wave 4**（2026-06-14）：从 `src/agent/` → `src/features/chat/` 迁移
- **Wave V1.5**（2026-06-15，ADR-0010）：`runtime.ts` 从根级入 `lib/`；`store/` → `stores/`；删空 `types/`
- **Wave V2**（2026-06-25，ADR-0019）：`AgentRuntime` service 单例 + Map → `createAgentRuntime()` 工厂 + per-conv `ConversationState.runtime`；`messages.store` + `agent.store` 合并到 `conversations.store`；`createStore<{ activeId, byId }>` 取代全局 signal + Map；supersede ADR-0014 D1 + D4
