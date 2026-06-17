# src/features/chat/ — Chat Feature (聊天域)

> **chat feature** = lib (AgentRuntime) + stores (Effect→Solid bridge) + components (4 UI 原子) + routes。
> 本目录结构遵循 [ADR-0010](../../docs/adr/0010-frontend-5-1-folder-whitelist.md) 的 5 子目录白名单（`stores` / `components` / `routes` / `hooks` / `lib`）。
> Billing tools（`src/features/billing/lib/billing.ts`）由本 feature 的 `lib/runtime.ts` 引用注册。

## 目录布局（ADR-0010 V1.5）

```
src/features/chat/
├── index.ts              # Barrel — public API（feature 根级唯一允许的文件之一）
├── AGENTS.md             # 本文件
│
├── lib/                  # 纯逻辑 / Effect-TS 运行时
│   ├── runtime.ts        # AgentRuntime + RuntimeLayer + RuntimeDeps（从根级迁入）
│   └── runtime.test.ts   # Runtime 单元测试
│
├── stores/               # 反应式状态（Solid signal / store / Accessor）
│   ├── conversations.ts  # Effect → Solid bridge: conversations$ + CRUD
│   ├── conversations.test.ts
│   ├── messages.ts       # Effect → Solid bridge: messages$ + stream callbacks
│   └── messages.test.ts
│
├── components/           # UI 组件
│   ├── sidebar.tsx       # Conversation list + search (reads chatStore)
│   ├── sidebar.test.tsx
│   ├── message-bubble.tsx # Role-aware message renderer (user/assistant/tool/system)
│   ├── message-bubble.test.tsx
│   ├── tool-call-card.tsx # Tool invocation card (running/success/error states)
│   ├── tool-call-card.test.tsx
│   ├── chat-view.tsx     # Main chat UI (subscribes runtime events → store)
│   └── chat-view.test.tsx
│
└── routes/
    └── index.tsx         # ChatLayout — Sidebar + ChatView + Settings link
```

> **ADR-0010 前后路径对照**：
>
> - `runtime.ts`（feature 根级） → `lib/runtime.ts`（feature 根级只允许 `index.ts` + `AGENTS.md`）
> - `store/conversations.ts` → `stores/conversations.ts`（单数 → 复数）
> - `store/messages.ts` → `stores/messages.ts`
> - 旧 `types/` 目录（空）已删除
>
> `hooks/` 目录 V1 暂无，未来首个 `use-` 钩子（候选：`useConversations` / `useDebouncedQuery`）落地时创建。

## 硬性规则

- **UI 组件（`components/*.tsx`）禁止导入 `effect`。** 它们是纯 Solid signal 消费者。逻辑层在 `stores/*.ts` 和 `lib/*.ts` 中。
- **`AgentRuntime` service 是单例，但托管 per-conversation Agent 映射表。**（V1.6 起，按 [ADR-0014](../../docs/adr/0014-per-conversation-agent.md) 修订。）
  - `AgentRuntimeLive` 持有 `Ref<Map<ConversationId, Agent>>`。
  - 每个 Conversation 至多 1 个 active 流；多 Conversation 可并行 streaming（见 ADR-0014 D5）。
  - `run(conv, msg)`：按 `conv.id` 在 Map 中查找/创建 Agent；首次创建时从 `MessageService.list(convId)` 拉历史消息一次性回填（见 D4）。
  - `cancel(convId)`：从 Map 拿对应 Agent 调 `agent.abort()`；in-flight partial 保留在 Agent state，不落库。
  - `destroy(convId)`：从 Map 移除该 Agent 实例（用于 `archiveConversation` / `deleteConversation` 入口）。
  - `archiveConversation` / `deleteConversation` store 入口在调 DB 删之前**必须**先 `AgentRuntime.cancel(convId)`，再 `AgentRuntime.destroy(convId)`，确保 SSE 连接被显式清理（避免 JS GC 不可预测）。
- **Store 是唯一的桥接层。** `stores/*.ts` 通过 `Effect.runPromiseExit` 将 Effect 结果转换为 Solid signals。组件永远不直接调用 `Effect.runPromise`。
- **组件不调 IPC。** 所有 Tauri IPC 走 `src/shared/lib/tauri.ts` Service Tags。
- **`Sidebar` 用 `createSignal` 做局部状态。** `query` / `debouncedQuery` / `setQuery/setDebouncedQuery` signals 是组件局部的，不与 store 导出冲突。streaming 状态点（per-conv 反馈）走 `streaming$` store accessor（来自 `conversations` 或独立 streaming store）。

## Runtime 事件（5 变体）

| 变体          | Payload                        | UI 副作用                     |
| ------------- | ------------------------------ | ----------------------------- |
| `token`       | `string`                       | `appendAssistantMessageDelta` |
| `tool_call`   | `ToolCall`                     | `appendToolCall`              |
| `tool_result` | `toolCallId + result + error?` | `finalizeToolResult`          |
| `done`        | `Message`                      | `finalizeAssistantMessage`    |
| `error`       | `{ message: string }`          | 仅记录日志                    |

## pi-mono 版本漂移（已知问题）

`lib/runtime.ts` 在 ~119 行有 `// pi-ai@0.73.1 vs pi-agent@0.9.0 type drift — `as any` bridge`。
`pi-ai@0.73.1` 导出 `Tool`（无 `AgentTool`）。`pi-agent@0.9.0` 期望 `AgentTool`（有 `label + execute`）。
当前 workaround：`billingTools` 上的 `as any` 转换。**升级 pi-ai 前**，移除 `as any` 转换并通过 `getModel()` 接入真实 Model。

## 测试模式

| 层         | 测试文件                | 框架                                               |
| ---------- | ----------------------- | -------------------------------------------------- |
| Runtime    | `lib/runtime.test.ts`   | `@effect/vitest` + `it.effect()` + `Layer.succeed` |
| Store      | `stores/*.test.ts`      | `@effect/vitest` + `it.effect()` + `Layer.succeed` |
| Components | `components/*.test.tsx` | `vitest` + `@solidjs/testing-library` + `render`   |

Component tests 通过 `vi.mock("../stores/X")` mock store 模块（**路径从 `store/` 改为 `stores/`**——ADR-0010）。Runtime tests 通过 `Layer.mergeAll` 提供 mock `SettingsService` + `BillingService`。

## 图标策略

图标来自 **lucide-solid**（已是项目依赖）。新代码中不要使用 emoji。
`components/tool-call-card.tsx` 中已有的 emoji（`⏳ ✓ ✗`）暂保留；新 UI 使用 lucide-solid。

## 跨 feature 引用

- **Billing tools**：`src/features/billing/lib/billing.ts` 导出 `billingTools`，本 feature `lib/runtime.ts` 注册到 `Agent`。
- **跨域类型**：从 `src/shared/lib/types.ts` 导入（ADR-0010 后从 `shared/types/` 迁）。
- **跨域 IPC**：从 `src/shared/lib/tauri.ts` 导入 Service Tags。

## Wave 笔记

- **Wave 4**（2026-06-14）：从 `src/agent/` → `src/features/chat/` 迁移
- **Wave V1.5**（2026-06-15，ADR-0010）：`runtime.ts` 从根级入 `lib/`；`store/` → `stores/`；删空 `types/`
