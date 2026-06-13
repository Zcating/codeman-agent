# src/agent/ — Effect-TS 逻辑层 + UI 组件

LLM 对话代理的**核心层**。包含 agent runtime（包装 pi-mono agent loop）、Effect → Solid 桥接、LLM 工具定义、设置子层，以及所有 Solid UI 组件。是项目里**唯一**允许 `import { Effect, Stream, Layer, Context }` 的前端子目录（UI 组件除外——见"硬性规则"）。

## 目录布局

```
src/agent/
├── runtime.ts             # AgentRuntime：Effect Stream 包装 pi-agent loop
├── runtime.test.ts        # Runtime 单测
│
├── store/                 # **Effect → Solid signal 桥接层**（bridge）
│   ├── conversations.ts   #   - 会话列表（loadConversations, createConversation, ...）
│   ├── messages.ts        #   - 消息流（appendUserMessage, runConversationStream, ...）
│   ├── conversations.test.ts
│   └── messages.test.ts
│
├── tools/                 # LLM 可调用的类型化工具
│   ├── billing.ts         #   - get_balance + get_plan_quota（V1 billing 工具）
│   └── billing.test.ts
│
├── settings/              # 设置子层（业务逻辑 + 验证 + 默认值）
│   ├── system_prompt.ts   #   - 系统提示词编辑
│   ├── llm_providers.ts   #   - LLM provider CRUD + 启用状态
│   ├── system_prompt.test.ts
│   └── llm_providers.test.ts
│
└── components/            # **Solid UI 组件**（不许 import 'effect'）
    ├── ChatView.tsx       #   - 主聊天视图（被 index.tsx 渲染；处理 #/settings 路由）
    ├── Sidebar.tsx        #   - 会话列表侧边栏
    ├── MessageBubble.tsx  #   - 单条消息气泡
    ├── SettingsModal.tsx  #   - 设置弹窗（被 ChatView 在 #/settings 触发）
    ├── ProviderCard.tsx   #   - 计费 provider 卡片（DeepSeek / MiniMax）
    ├── ToolCallCard.tsx   #   - 工具调用 / 结果展示卡片
    └── <Name>.test.tsx    # 1:1 旁挂测试
```

## 硬性规则

- **UI 组件不导入 `effect`。** `src/agent/components/*.tsx` 只能 `import { createSignal, createMemo, createEffect, For, Show }` from `solid-js` 以及从 `agent/store` 读 `Accessor<T>`。逻辑层封装在 `runtime.ts` / `store/` / `tools/` / `settings/`。详见 ADR-0003。
- **store 是 Effect → Solid 唯一桥接点。** `agent/store/*.ts` 用 `Effect.runPromiseExit()` / `Stream.runForEach` 喂信号；UI 永远不直接 `Effect.runPromise`。
- **Runtime 单实例。** `AgentRuntimeLive` 持有 `Ref<Agent | null>`，**同一时刻只允许一个 `run()`**。`cancel()` 调 `agent.abort()` 中止飞行中请求。
- **Tool 定义只声明不执行。** `tools/billing.ts` 暴露 `Tool` schema（`Type.Object({})`），实际 `execute` 由 `runtime.ts` 内的 `agent.subscribe` 监听 `tool_execution_end` 事件 → 写 Store → 渲染 `ToolCallCard`。**不要**把 HTTP 写在 tool 的 execute 里——billing 工具最终走 `BillingService.getSnapshot`。
- **Settings 子层不做 IPC。** `settings/*.ts` 是纯函数 / 数据结构（验证、合并、默认值）；IPC 走 `agent/store/` 或直接 `invoke`（不推荐，**用 Service**）。
- **Solid signals 只装 plain data。** 不能把 `Effect` / `Stream` / `Layer` 实例塞进 signal。`AgentRuntime` 自己用 `Context.Tag` 注入，不暴露给组件。
- **`Agent` 内部状态（`messages: []`）从 `Conversation` 重建。** 不要试图把整段历史传给 `pi-agent`；每次 `run()` 用空 messages 数组 + 当前 prompt，让 LLM 看到的是"这一轮的对话"。

## 模式

- **Runtime 事件流是 `Stream<RuntimeEvent, never, never>`。** 5 个变体：`token` / `tool_call` / `tool_result` / `done` / `error`。组件订阅 → 增量更新消息气泡。
- **桥接层测试用 `it.effect()`。** mock `Layer.succeed(Service, ...)` 后跑 `Effect.runPromise`；UI 侧用 `@solidjs/testing-library`。
- **SettingsService 走 Settings 镜像。** `getSettingsBridge()` 是 promise 包装的 effect program；UI 调用前 await。
- **错误上抛是 `AppError` 判别联合**（`lib/types.ts` 定义）。桥接层用 `Exit.isSuccess(result)` 过滤后写信号；UI 显示错误用 `MessageBubble` 的 error 变体。
- **运行时工具列表来自 `billingTools` 常量。** `runtime.ts` 内 `new Agent({ ..., tools: billingTools })`；新增工具 = 在 `tools/<name>.ts` 写 `Type.Object` schema，加进 `billingTools` 数组。

## 查阅指南

| 任务 | 文件 |
|---|---|
| 改 agent 循环行为 | `runtime.ts`（`AgentRuntime` 内部 Effect.gen） |
| 新增 LLM 工具 | `tools/<name>.ts`（schema + dispatch handler）；注册到 `runtime.ts::billingTools` |
| 新增会话/消息 IPC 调用 | `store/conversations.ts` 或 `store/messages.ts`（桥接层） |
| 新增设置项业务逻辑 | `settings/<name>.ts`（纯函数 + schema） |
| 新增 UI 视图 | `components/<Name>.tsx`；被 `ChatView` 引入；订阅 `store/*$` 访问器 |
| 新增主视图（非 chat/settings） | 先确认是不是 V1 范围内；当前 V1 只有 `ChatView` + `SettingsModal` |
| 桥接层测试 | `store/*.test.ts`（`it.effect` + mock Layer） |
| UI 测试 | `components/<Name>.test.tsx`（`@solidjs/testing-library`） |

## 反模式（明确禁止）

- UI 组件 `import { Effect, Stream, Context, Layer, ... } from "effect"`。
- UI 组件直接调 IPC：`getSettingsBridge` / `updateSettingsBridge` 可以，但**不要** `await invoke(...)`。
- 在 `runtime.ts` 之外构造 `new Agent(...)`。
- 把 `Effect` / `Stream` / `Layer` 实例塞进 Solid signal。
- 工具 `execute` 写 HTTP：工具的 execute 在 `runtime.ts` 内部 dispatch；HTTP 走 `BillingService` IPC 链。
- `runtime.ts` 内 `import { invoke }`——所有 IPC 走 Service Tag。
- 测试用 `as any` 绕过 pi-ai 版本不匹配——明确写 `// pi-ai@0.73.1 vs 0.9.4 type drift` 注释。
- 把 LLM provider key 写进 log——`Secret` 走 `getApiKey`，runtime 内 transport 处理；**不要** `console.log(apiKey)`。

## 与 pi-mono 的版本错位（已知坑）

`runtime.ts` 顶部有注释：`pi-ai@0.73.1` 装了 `Tool`，但 `pi-agent@0.9.0` 期望 `AgentTool`（带 `label + execute`）。当前用 `as any` 桥接，配合 `// TODO (T35): wire real Model from pi-ai getModel() once provider key is available` 标记。**升 pi-ai 前**先解掉这个 `as any`，否则编译期保护消失。

## 测试

```bash
pnpm test                              # 全跑
pnpm vitest run src/agent/runtime      # 单跑 runtime
```

- `runtime.test.ts` 用 fake `Agent` mock + `Effect.runPromise` 断言 stream 事件序列。
- `store/*.test.ts` 用 `Layer.succeed` 提供 mock service。
- `settings/*.test.ts` 纯函数单测。
- `components/*.test.tsx` 渲染断言 + 用户交互。
