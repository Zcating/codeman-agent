# src/features/chat/ — Chat Feature (聊天域)

> **chat feature** = AgentRuntime + 2 stores + 4 components + routes。Billing tools (Wave 6) import from `src/features/chat/` once moved。

## 目录布局

```
src/features/chat/
├── index.ts              # Barrel — public API
├── runtime.ts           # AgentRuntime + RuntimeLayer + RuntimeDeps
├── runtime.test.ts      # Runtime 单元测试
│
├── store/
│   ├── conversations.ts  # Effect → Solid bridge: conversations$ + CRUD
│   ├── conversations.test.ts
│   ├── messages.ts       # Effect → Solid bridge: messages$ + stream callbacks
│   └── messages.test.ts
│
├── components/
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

## 硬性规则

- **UI 组件（`components/*.tsx`）禁止导入 `effect`。** 它们是纯 Solid signal 消费者。逻辑层在 `store/` 和 `runtime.ts` 中。
- **`AgentRuntime` 是单例。** `AgentRuntimeLive` 持有 `Ref<Agent | null>`。同一时间只有一个 `run()`。`cancel()` 调用 `agent.abort()`。
- **Store 是唯一的桥接层。** `store/*.ts` 通过 `Effect.runPromiseExit` 将 Effect 结果转换为 Solid signals。组件永远不直接调用 `Effect.runPromise`。
- **组件不调 IPC。** 所有 Tauri IPC 走 `src/shared/lib/tauri.ts` Service Tags。
- **`Sidebar` 用 `createSignal` 做局部状态。** `query` / `debouncedQuery` / `setQuery/setDebouncedQuery` signals 是组件局部的，不与 store 导出冲突。

## Runtime 事件（5 变体）

| 变体 | Payload | UI 副作用 |
|---|---|---|
| `token` | `string` | `appendAssistantMessageDelta` |
| `tool_call` | `ToolCall` | `appendToolCall` |
| `tool_result` | `toolCallId + result + error?` | `finalizeToolResult` |
| `done` | `Message` | `finalizeAssistantMessage` |
| `error` | `{ message: string }` | 仅记录日志 |

## pi-mono 版本漂移（已知问题）

`runtime.ts` 在 ~119 行有 `// pi-ai@0.73.1 vs pi-agent@0.9.0 type drift — `as any` bridge`。
`pi-ai@0.73.1` 导出 `Tool`（无 `AgentTool`）。`pi-agent@0.9.0` 期望 `AgentTool`（有 `label + execute`）。
当前 workaround：`billingTools` 上的 `as any` 转换。**升级 pi-ai 前**，移除 `as any` 转换并通过 `getModel()` 接入真实 Model。

## 测试模式

| 层 | 测试文件 | 框架 |
|---|---|---|
| Runtime | `runtime.test.ts` | `@effect/vitest` + `it.effect()` + `Layer.succeed` |
| Store | `store/*.test.ts` | `@effect/vitest` + `it.effect()` + `Layer.succeed` |
| Components | `components/*.test.tsx` | `vitest` + `@solidjs/testing-library` + `render` |

Component tests 通过 `vi.mock("../store/X")` mock store 模块。Runtime tests 通过 `Layer.mergeAll` 提供 mock `SettingsService` + `BillingService`。

## 图标策略

图标来自 **lucide-solid**（已是项目依赖）。新代码中不要使用 emoji。
`tool-call-card.tsx` 中已有的 emoji（`⏳ ✓ ✗`）暂保留；新 UI 使用 lucide-solid。

## Wave 4 笔记

- 所有文件从 `src/agent/` → `src/features/chat/` 迁移
- Import 路径更新：`../../lib/tauri` → `../../../shared/lib/tauri` 等
- `routes/index.tsx` 更新：`../agent/components/*` → `../../agent/components/*`
- `lucide-solid` 图标已添加：`sidebar.tsx` 中的 `Plus`，`chat-view.tsx` 中的 `Send`/`X`，`routes/index.tsx` 中的 `Settings`
- `runtime.test.ts` 随 `runtime.ts` 一起迁移（测试与实现同目录）
- `src/agent/` 和 `src/routes/index.tsx` 中的旧文件保留，供 Wave 7 清理
