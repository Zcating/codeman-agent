# 0019 — Per-Run Transient Agent + Store as Source of Truth

**Status**: accepted (2026-06-25)
**Date**: 2026-06-25
**Scope**: codeman-agent V2.x chat 域 runtime 层 + store 层
**Supersedes**: D1(`AgentRuntime` service 单例 + `Ref<Map<ConvId, Agent>>`)、D4(`Agent` 是 in-memory owner,DB 是 mirror)
**Related**: ADR-0003(Effect-TS 逻辑层)、ADR-0011(anthropic-messages-only)、ADR-0016(chatAgentStore 抽象)、ADR-0017(Queue-based runtime 内部)

## Context

### 触发 1:ADR-0014 D1/D4 在 V1.x 暴露的 2 个架构代价

ADR-0014 决策:

- **D1**:`AgentRuntime` = `Context.Tag` service 单例,内部 `Ref<Map<ConversationId, Agent>>`
- **D4**:`Agent` 是 in-memory owner,DB 是 mirror,首次 `run()` 拉历史回填一次

运行 1.x 后观察到的 2 个架构代价:

**痛点 A:Service 边界与"工厂"语义不符**

`AgentRuntime` service 是单例,但每个 conv 有独立 `Agent` 实例;跨 conv 操作(`cancel(convId)` / `destroy(convId)` / archive/delete)需要传 `convId` 路由。这种"单例 service + 内部 Map"是 service 模式的退化形态——service 设计意图是"全局共享能力",这里只有"工厂方法"语义。ADR-0003 Effect-TS 模式也假设 service 有清晰的所有权边界,这里"service 自己是工厂"模糊了边界。

**痛点 B:in-memory `Agent` 与 store 之间的 sync 漂移**

`Agent` 累积 messages,DB 也存 messages;run 之间可能存在差异(比如 store 端有 tool_result 但 `Agent` 端没,因为 决定的"首次拉历史 + 后续累积"模式)。V1.5 早期已经因为 partial 不落库(per D6:partial 保留在 `Agent` state)出过"切换对话 partial 消失" bug——`Agent` 与 DB 双 source-of-truth 增加心智负担。

### 触发 2:bug — streaming state leak between convs

V1.x 报告的 bug:

- 用户在 conv A 发送消息,LLM 开始 streaming
- 用户切到 conv B
- conv A 的 stream 仍在运行(in-flight 不 cancel,per)
- conv A 的下一个 token 事件通过 `chat-view.tsx handleEvent` 写到 `messages.store.ts` 的全局 signal `messages$`
- `messages$` 在用户切到 B 时被 `loadMessages(B)` 整体替换;但 A 的 stream 闭包不知道这事,继续写
- 结果:B 视图显示 A 的内容

根因:`messages.store` 全局 signal 设计 + chat-view 闭包绑 `convId` 写全局 signal。runtime 本身 per-conv(per + D5)是正确的,问题在 messages 状态层。

## Decision

3 个相互依赖的决策:

### D1.Runtime = 工厂函数(反转)

**采用**:B(纯工厂函数,无 `Context.Tag`,无 Layer DI)

接口:

```ts
export interface ProviderConfig {
  apiKey: string | null;
  baseUrl: string;
  defaultModel: string;
  systemPrompt: string;
  tools: AgentTool[];
}

export interface RunOptions {
  /** 浅拷贝,含最新用户输入 */
  context: Message[];
  provider: ProviderConfig;
}

export interface AgentRuntime {
  run(opts: RunOptions): Stream<RuntimeEvent>;
  cancel(): void;
}

export function createAgentRuntime(): AgentRuntime;
```

**拒绝**:

- A(`Context.Tag` service + `Ref<Map>`)— 原设计
- C(`class` 形式)— 同样引入 indirection,但语法差异不带来语义收益

理由:

- `AgentRuntime` 语义上是"工厂"(每个调用产生独立 entity),不是"service"(全局共享能力)
- 工厂函数 + closure 自带封装,无需 `this` / `class` 语法
- 不依赖 Effect Layer DI,call site 直接 `createAgentRuntime()`,无需 `Effect.provide(Layer)`
- per-conv 实例化通过 `conversations.store` 的 createStore 实现(每个 `ConversationState.runtime` 字段 = 一次 `createAgentRuntime()` 调用),无需 `Map`

### D2.Agent = per-run transient(反转)

**采用**:B(每次 `run()` 调用新建 pi-mono `Agent`,store 是 single source of truth)

流程:

1. `run({ context, provider })` 调用
2. 创建新 `AbortController`,赋给 closure 变量 `currentAbortController`
3. 创建新 pi-mono `Agent`,`initialState.messages = context`(store 来的浅拷贝)
4. 创建新 `Queue.unbounded<RuntimeEvent>()` + fork 新 fiber
5. `agent.subscribe` → 翻译为 `RuntimeEvent` → `Queue.unsafeOffer`
6. 返回 `Stream.fromQueue(queue)`
7. `cancel()` 调 `currentAbortController.abort()` 触发 fetch abort

**拒绝**:

- A(per-conv `Agent` 累积)— 原设计
- C(per-request `Agent` via factory)— 等价于 per-run,术语差异

理由:

- Store 通过 subscribe 拿到每个 event,`store.byId[convId].messages` 实时更新
- Done 事件触发后,store 有完整的最新状态
- 下次 `run()` 调用时,store 提供 `context` 包含全部历史,新 `Agent` 看到一致视图
- 无 `Agent` 与 store 之间的 sync 漂移
- `Agent` 是"stateless LLM caller",生命周期 = 单次 run,语义清晰
- 取消时:AbortController 触发 fetch abort,fiber 退出,finalizers 清 queue,stream 自然 end

**`agentRef = Ref<Map<ConvId, Agent>>` 不再需要**——跨 conv 共享 `Agent` 的需求被 D1(per-conv runtime instance)+ D2(per-run `Agent`)消除。

### D3.Store = single source of truth(新决策,supersede 的 store 拆分意图)

**采用**:B(`messages.store` 全局 signal + `agent.store` 桥接层合并到 `conversations.store`,per-conv state 由 Solid `createStore` 管理)

`ConversationState` 结构:

```ts
export interface ConversationState {
  // DB-backed fields(mirror shared/lib/types.ts 的 Conversation)
  id: string;
  title: string;
  system_prompt: string | null;
  created_at: number;
  updated_at: number;
  archived_at: number | null;
  // Per-conv reactive state(createStore proxy-managed)
  messages: Message[];
  streamingMessageId: string | null;
  // Per-conv runtime(createAgentRuntime factory 产物)
  runtime: AgentRuntime;
}

const [store, setStore] = createStore<{
  activeId: string | null;
  byId: Record<ConvId, ConversationState>;
}>({
  activeId: null,
  byId: {},
});
```

`sendMessage(convId, content, provider)` 流程:

1. 取 `conv = store.byId[convId]`,append user message(`setStore("byId", convId, "messages", msgs => [...msgs, userMsg])` + DB persist)
2. `context = [...store.byId[convId].messages]`(浅拷贝)
3. `conv.runtime.run({ context, provider })` → `Stream<RuntimeEvent>`
4. `Stream.runForEach(stream, evt => Effect.sync(() => handleEvent(convId, evt)))`
5. `handleEvent` 按 `evt.type` 调 `setStore("byId", convId, ...)` 更新 messages / streamingMessageId;`done` 事件额外触发 `persistAssistantMessage(evt.message)` 异步落库

**拒绝**:

- A(messages.store + agent.store 各自保留)— 维持多 store 边界,但增加跨 store import,signal 跨 store 路由复杂
- C(每个 conv 独立 Solid root)— Solid 不支持跨 root reactivity,不可行

理由:

- `ConversationState` 是"对话的完整视图",包含 DB 数据 + 内存状态 + 运行时——单一类型统一表达
- `createStore` 提供 fine-grained 反应式:只读 `store.byId[convId].messages` 的组件在该路径变更时重算,跨 conv streaming 不互相影响
- store 订阅 stream 事件 → `setStore("byId", convId, ...)` 更新——唯一写路径,反应式自动传播
- 跨 store import 消除:ConvState 类型 + reactive state + DB 桥接 + runtime wiring 都在 `conversations.store.ts`
- D4-D5-D6(chatAgentStore 抽象层)的"组件不直接 import runtime"约束仍然成立,只是中间层从 `agent.store` 移到 `conversations.store` 内 inline

## Consequences

### 正面

- **Bug 直接修复**:stream 事件通过 store 订阅路由到 `byId[convId]`,切换 conv 不影响其他 conv 的 slot
- **代码量减少**:`agent.store.ts` + `messages.store.ts` 删除,合并到 `conversations.store.ts`(预计 400-500 行单文件,之前 ~3 个 store 各 150-200 行)
- **架构简化**:无 service / Layer / Map / class,只剩 factory + createStore
- **心智负担减少**:store 是唯一 source of truth,无 `Agent`-DB sync 漂移问题
- **测试简化**:`createAgentRuntime()` 是纯函数,易于 mock + 直接 unit test;`conversations.store` 的 store 操作通过 Solid Testing Library 测试
- **Provider 切换灵活**:provider 是 run 时参数,下次 run 自动用新值(in-flight 不变)
- **Cancel 行为改进**:原 是"partial 保留在 `Agent` state",新设计 partial 在 store(subscription 实时写)。cancel 后用户切回 conv 还能看到 partial 进度(不是"丢失")

### 负面

- **每次 run 重建 `Agent`**:微秒级开销,可忽略(pi-mono `Agent` 构造无 IO)
- **Provider 切换时机**:每次 run 传 provider,无"conv 锁定 provider"语义——如果产品想锁定需要额外 store 字段 `lockedProvider`
- **ADR-0014 D5(每 conv 1 active 流)需要 store 层 enforce**:`sendMessage` 入口检查 `streamingMessageId !== null` 时拒绝(否则并发 run 会创建 2 个 fiber 写同一 store slot)
- **`AbortController` 与 pi-mono `Agent.abort()` 二选一**:本设计选 `AbortController`(transport signal 链路),放弃 pi-mono 原生 `Agent.abort()` 接口。迁移到 pi-mono 新版本时需要检查 transport 是否仍接 signal

### 跨文件影响清单

| 文件                                                   | 改动                                                                                                                                                                                                     |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/adr/0019-per-run-transient-agent.md`             | 本 ADR(新增,supersede 0014 D1 + D4)                                                                                                                                                                      |
| `src/features/chat/lib/runtime.ts`                     | 完全重写:删除 `Context.Tag` + `AgentRuntimeLive` Layer + `Ref<Map<ConvId, Agent>>` + per-conv history 回填逻辑;导出 `createAgentRuntime` factory + `ProviderConfig` / `RunOptions` / `AgentRuntime` 类型 |
| `src/features/chat/lib/runtime.test.ts`                | 改测试:factory 模式 + mock `Agent` + per-run lifecycle                                                                                                                                                   |
| `src/features/chat/lib/anthropic-transport.ts`         | 适配:`AbortSignal` 改为由 `createAgentRuntime` 注入,而不是走 pi-mono `Agent.abort()`                                                                                                                     |
| `src/features/chat/stores/conversations.store.ts`      | 扩大:内嵌 `ConversationState` 类型 + `createStore` + `sendMessage` + `handleEvent` + `archiveConversation` + `deleteConversation`(合并 `agent.store` + `messages.store`)                                 |
| `src/features/chat/stores/conversations.store.test.ts` | 加 ConvState 初始化 / `sendMessage` stream 订阅 / cross-conv isolation 测试                                                                                                                              |
| `src/features/chat/stores/agent.store.ts`              | **删除**                                                                                                                                                                                                 |
| `src/features/chat/stores/agent.store.test.ts`         | **删除**                                                                                                                                                                                                 |
| `src/features/chat/stores/messages.store.ts`           | **删除**                                                                                                                                                                                                 |
| `src/features/chat/stores/messages.store.test.ts`      | **删除**                                                                                                                                                                                                 |
| `src/features/chat/components/chat-view.tsx`           | 改用 `conversations.store` API;删除对 `messages$` / `chatAgentStore` 的 import;`running` 改从 `store.byId[activeId()]?.streamingMessageId !== null` 派生                                                 |
| `src/features/chat/components/chat-view.test.tsx`      | 改 mock + 加 streaming state per-conv 断言                                                                                                                                                               |
| `src/features/chat/components/sidebar.tsx`             | 加 streaming 状态点(per "N 个 conversation 在后台流" UI 要求):读 `Object.values(store.byId).filter(c => c.streamingMessageId !== null)`                                                      |
| `src/features/chat/components/sidebar.test.tsx`        | 加 streaming 状态点测试                                                                                                                                                                                  |
| `src/features/chat/AGENTS.md`                          | 硬规则改:删除"`AgentRuntime` service 单例 + Map";加"`createAgentRuntime` factory + ConvState per-conv";删除"Store 是唯一桥接层"旧表述,加"conversations.store 是唯一 store"                               |
| `src/AGENTS.md`                                        | 查阅指南更新:`messages.store` / `agent.store` 引用替换为 `conversations.store`                                                                                                                           |
| `CONTEXT.md`                                           | 词汇表改:`Per-Conversation Agent` → `Per-Conversation Runtime`;`Agent Map` 删除;新增 `Conversation State` 词汇                                                                                           |
| `src-tauri/src/...`                                    | 不变(DB schema / Tauri command 不动)                                                                                                                                                                     |
| `src/shared/lib/types.ts`                              | 不变(`Conversation` / `Message` 类型不变)                                                                                                                                                                |

### 不可逆性

推翻本 ADR 需:

- 改 `runtime.ts` factory 函数 → `Context.Tag` service + `Ref<Map>`
- 改 `conversations.store.ts` ConvState 结构 → 拆分为 `messages.store` + `agent.store`
- 改 `chat-view.tsx` 的 reactive 路径(回到全局 `messages$`)
- 撤回 + 重新激活 D1/D4
- 改 `chat/AGENTS.md` 硬规则 + `CONTEXT.md` 词汇表
- 加 sidebar 状态点的反向移除(per UI 要求)

总改动 ≥ 8 处代码 + 2 处文档 + 1 处 UI 还原。成本有意义 → 不可逆标记成立。

## References

- pi-mono Agent API: `https://github.com/badlogic/pi-mono`
- D1(原 `AgentRuntime` service 单例 + `Ref<Map>`):被 supersede
- D4(原 `Agent` 是 in-memory owner):被 supersede
- ADR-0017(Queue-based runtime):保留,`run()` 内部仍用 `Queue.unbounded` + `Effect.fork` + `Stream.fromQueue`
- ADR-0003(Effect-TS 逻辑层):保留,`createAgentRuntime` 内部仍用 `Effect` / `Stream`
- ADR-0016(`chatAgentStore` 抽象):保留意图(组件不直接 import runtime),中间层移到 `conversations.store` 内 inline
- § "Future maintenance":单 main webview 约束下"后台"语义不变——per-conv `AgentRuntime` 实例在 webview 内存常驻
- V1.x bug 报告:"streaming state leak between convs"(2026-06-25,本 ADR 触发)
