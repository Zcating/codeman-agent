# 0014 — Per-Conversation Agent 实例（多流并行 + 切换保留状态）

**Status**: accepted (2026-06-17)
**Date**: 2026-06-17
**Scope**: codeman-agent V1.6 chat 域 runtime 层
**Supersedes**: `src/features/chat/AGENTS.md` 的 "`AgentRuntime` 是单例" 硬规则（修订为 service 单例 + 托管 per-conversation Agent Map）
**Related**: ADR-0002 (pi-mono agent runtime), ADR-0007 (单 main webview), ADR-0011 (anthropic-messages-only), ADR-0012 (Unified Provider schema), CONTEXT.md 词汇表 Runtime / Per-Conversation Agent / Agent Map / Conversation

## Context

### 触发 1：V1.5 `Ref<Agent | null>` 单例的 3 个痛点

`src/features/chat/lib/runtime.ts:70,163,286,297` V1.5 现状：

```ts
const agentRef = yield * Ref.make<Agent | null>(null);
// ...
yield * Ref.set(agentRef, agent); // 单例 ref 只持"当前" Agent
// run() 完成时:
yield * Ref.set(agentRef, null); // 立刻清空
```

**痛点 A：多轮对话 LLM 看不到历史**

`runtime.ts:155-159` 每次 `new Agent({...})` 时 `initialState.messages: []`。
`agent.appendMessage` 只 push 当前 user 消息，`agent.prompt(content)` 触发 LLM。
LLM 视角：每轮对话都是"白板"开始，**没有跨轮 context**。
多轮对话在 LLM 层面是断的（DB 持久化所有消息，但 LLM 调用时只能看到当前 user 消息）。

**痛点 B：切换 conversation 期间 partial 状态丢失**

用户 A conversation 发消息 → AI 正在 streaming → 用户切到 B → 用户切回 A：

- V1.5 `run()` 不被 cancel（stream 在主线程 fetch 异步跑）
- streaming 持续到 `done` 事件
- 但 `loadMessages(A)` 重载 signal 时，DB 没有 A 的 AI 消息（done 之前的 partial 永远不落库）
- 用户切回 A：AI 输出**消失**

> **V1.5 TDD 修复范围**（已完成）：`persistAssistantMessage` 解决"done 之后切换"场景。
> **V1.6 本 ADR 解决**："切走时仍在 streaming"的 partial 在 V1.5 单例下**无解** —— Agent 已被清空，partial 不在 Agent 也不在 DB。

**痛点 C：chat-view 的 Cancel 按钮是坏的**

`chat-view.tsx:33,64-67`：

```ts
let abortController: AbortController | null = null;
// ...
const cancel = async () => {
  abortController?.abort(); // ← AbortController 没传给 pi-mono
  setRunning(false);
};
```

但 `runtime.ts:295-301` `AgentRuntime.cancel()` 调 `agent.abort()`（pi-mono 真接口）。
chat-view 的按钮**从未接通过 `AgentRuntime.cancel()`** —— `abortController.abort()` 不影响 pi-mono 的 fetch。
实际行为：用户点 Cancel → `running` 变 false → stream 继续跑 → done 事件照常落库。
按钮欺骗用户说"已取消"，实际什么都没发生。

### 触发 2：ADR-0007 单 webview 约束下"后台"的边界

ADR-0007 § "Future maintenance" 确认：V1.5 单 main webview，关闭 → minimize 到任务栏（应用进程存活），File→Quit 才是真正退出。
"后台"在 V1.5 webview 上下文 = **主线程 fetch 异步跑 + UI 不渲染**。
不是 Web Worker、不是独立 webview、不是 Rust 侧。
per-conversation Agent 的"后台" = Agent 实例在 webview 内存中常驻、跨切对话不被销毁；stream 继续跑；切回可看。

## Decision

7 个相互依赖的决策，**按依赖顺序排列**：

### D1. Layer（per-conversation Agent vs singleton Agent）

- **采用**：B（每个 Conversation 一个 pi-mono `Agent` 实例，`AgentRuntime` service 仍单例）
- 理由：
  - 改 `Ref<Agent | null>` → `Ref<Map<ConversationId, Agent>>`，key = `conv.id`
  - `AgentRuntime` service 本身仍是 `Context.Tag` 单例（每进程 1 个 service，符合 ADR-0003 Effect-TS 模式）
  - 痛点 A/B/C 都通过"Agent 实例生命周期 = Conversation 生命周期"解决
- 拒绝：A（per-service Agent 副本 = 复制整个 `Context.Tag` 系统，无收益）、C（引入新层无收益）

### D2. Lifecycle（per-conversation Agent 何时销毁）

- **采用**：A（仅在 conversation 被 delete / archive 时销毁）
- 理由：
  - 匹配用户原话"切换对话时，运行时对象不会销毁" = conversation 存活期内常驻
  - 内存上限：受 `Settings.conversations.max_history: 1000`（CONTEXT.md § F）软约束
  - 真实用户场景活跃 conversation 通常 <50，内存可接受
  - 不引入隐式 LRU 状态机（Agent 突然被 evict = 用户切回发现流断了，比 V1.5 bug 更难诊断）
- 拒绝：B（run() 完成立即销毁 = 实质回到 V1.5 行为，违背"不销毁"意图）、C（LRU 隐式状态机 = 行为不可预测）、D（idle eviction = 定时器 + cleanup 复杂度高）

### D3. "后台"执行位置

- **采用**：A（仅描述现状：Agent 住在 webview 内存 + 主线程 fetch 异步执行）
- 理由：
  - 当前架构已满足（fetch 非阻塞 + 主线程不卡）
  - D1 + D2 下切换对话流自然继续
  - 零额外架构成本
- 拒绝：B（Web Worker = pi-mono 在 worker 跑需验证，跨线程事件传递需 postMessage 包装 Effect Stream）、C（独立 Tauri webview = 违反 ADR-0007 单 webview 约束）、D（Rust 侧 agent = 违反 ADR-0002 pi-mono 锁定）

### D4. Agent state ↔ DB 同步

- **采用**：A（首次 `run()` 一次性拉历史）
- 理由：
  - Agent lazy 创建于该 conv 首次 `run()`，从 `MessageService.list(convId)` 拉所有历史消息
  - 每条历史消息 `agent.appendMessage(...)` 回填
  - 后续 `run()` 累积（不再重拉）
  - 痛点 A（多轮对话 LLM 看不到历史）一次性解决
  - 痛点 B（切走时 partial 丢失）部分解决：partial 在 Agent state 保留，下次同 conv `run()` 累积
  - 接受"Agent state 是 in-memory owner"语义：DB 持久化通过 `done` 事件的 `persistAssistantMessage`（V1.5 TDD 修复）保证
- 拒绝：B（每次 run() 前重拉 = DB read on every send，per-conversation Agent 价值被抵消）、C（不拉历史 = 痛点 A 不解决）、D（write-through 每次 token 事件 = 违反 ADR-0004 SQLite IO 模式）

### D5. 并发流上限

- **采用**：A（每 conv 1 active 流；多 conv 可并行；同 conv 不能并发 send）
- 理由：
  - chat-view 的 `running` 信号从全局 boolean 变为 per-conv（`Map<ConvId, boolean>` 或 store 管理）
  - 跨 conv 并发是 per-conversation Agent 的自然延伸（D1 决定）
  - UI 需要新机制显示 "N 个 conversation 在后台流"（sidebar 状态点 / toast）
- 拒绝：B（全局 1 流 = 违背"后台"期望）、C（每 conv 1 流 + 全局 N 上限 = N 默认值需考究，V1 加复杂度不必要）、D（不限制 = 内存/连接/DB 写不可预测）

### D6. Cancel API + in-flight 状态

- **采用**：A（`cancel(convId)` + 保留 Agent state）
- 理由：
  - `AgentRuntime.cancel(convId: string)`：从 Map 拿对应 Agent 调 `agent.abort()`（pi-mono 真接口）
  - chat-view 的 Cancel 按钮改为 `AgentRuntime.cancel(activeId)` —— **顺手修痛点 C**
  - in-flight Agent state 保留（user msg + partial assistant msg in pi-mono format）
  - DB 不写（未完成不落库）
  - 下次同 conv `run()`：Agent state 累积（partial 在 Agent 内），不重新走历史拉取
- 拒绝：B（持久化 partial = Message schema 需加 `interrupted: boolean`，TS + Rust + 迁移）、C（cancel 后 run() 前重拉 = 放弃 per-conv Agent 价值）、D（保持 `cancel()` 无参 = 并发 A 下"取消哪个"模糊）

### D7. In-flight 删除处理

- **采用**：A（delete / archive 前先 `cancel(convId)`）
- 理由：
  - `archiveConversation` / `deleteConversation` store 入口（D2 决定触发销毁的入口）
  - 在调 `MessageService.delete(convId)` 之前先 `AgentRuntime.cancel(convId)`：清理 SSE 连接 + 丢弃 partial + 释放 Agent 实例
  - 语义干净：删除后什么都留不下
  - 不留 GC 不可预测（SSE 连接不会被自动 GC）
- 拒绝：B（硬终止 = SSE 连接 hold + 临时缓冲写入）、C（禁止删除有 active 流的 conv = UX 差）、D（保留 partial = 同 B 选项的 schema 复杂度）

## Consequences

### 正面

- **多轮对话工作**：LLM 看到跨轮历史（痛点 A 解决）
- **切换对话 partial 保留**：in-flight 流不被 cancel，partial 在 Agent state 中累积（痛点 B 解决）
- **Cancel 按钮真工作**：调 `AgentRuntime.cancel(convId)` 真正 abort pi-mono fetch（痛点 C 解决）
- **多 conv 并行流**：自然支持；UI 通过 sidebar 状态点反馈
- **Agent 实例内存可控**：受 `max_history: 1000` 软上限，真实场景 <50 个常驻

### 负面

- **冷启动 cost**：每个 conversation 首次 `run()` 需从 DB 拉历史 + 喂给 Agent。N 条历史消息 = N 次 `agent.appendMessage`。V1 消息量小可接受，V2 需考虑 lazy load 优化。
- **Agent state 与 DB 漂移风险**：Agent state 在生命周期内不与 DB 重新同步（D4 选择）。同一 conversation 在两处修改 DB 会产生偏差。V1 单 webview 下不发生；V2 跨 webview / 跨设备需新策略。
- **chat-view 重构**：`running` 信号从 boolean 变 per-conv，需 store 管理或 Map 暴露。
- **UI 新增负担**：sidebar 需 streaming 状态点 + chat-view 需 per-conv Cancel 按钮上下文。
- **3 处 store 入口跨层调用**：`archiveConversation` / `deleteConversation` / chat-view send 全部需接触 `AgentRuntime` —— 之前 service 边界由 runtime 单一调用方（chat-view）保持，per-conv Agent 引入两个新调用方（conversations store）。

### 跨文件影响清单

| 文件                                              | 变更                                                                                                       |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `docs/adr/0014-per-conversation-agent.md`         | 本 ADR（新增）                                                                                             |
| `src/features/chat/AGENTS.md:50`                  | 硬规则修订（"singleton Agent" → "singleton service + Map<ConvId, Agent>"）                                 |
| `src/features/chat/lib/runtime.ts`                | `Ref<Map<ConvId, Agent>>` + 3 方法（`run` / `cancel` / `destroy`） + lazy create + history feed            |
| `src/features/chat/lib/runtime.test.ts`           | 新增 per-conversation API surface 测试（cancel/destroy 签名 + 幂等性）                                     |
| `src/features/chat/stores/conversations.ts`       | `archiveConversation` / `deleteConversation` 加 `AgentRuntime.cancel(convId)` + `destroy(convId)` 前置调用 |
| `src/features/chat/stores/conversations.test.ts`  | 验证 cancel-before-delete（mock AgentRuntime）                                                             |
| `src/features/chat/components/chat-view.tsx`      | Cancel 按钮调 `AgentRuntime.cancel(activeId)`（修 V1.5 bug）；`running` 信号 per-conv                      |
| `src/features/chat/components/chat-view.test.tsx` | mock 加 `AgentRuntime` 服务；新增 cancel 按钮触发 + per-conv running 行为                                  |
| `src/features/chat/components/sidebar.tsx`        | streaming 状态点（per-conv 反馈）                                                                          |
| `src/features/chat/components/sidebar.test.tsx`   | 新增 streaming 状态点测试                                                                                  |
| `CONTEXT.md` 词汇表                               | 新增 "Per-Conversation Agent" + "Agent Map"，更新 "Runtime" / "Conversation"                               |

### 不可逆性

推翻本 ADR 需：

- 改 `runtime.ts` `Ref` 形态（撤销 D1）
- 改 `chat-view.tsx` Cancel 按钮 + running 信号（撤销 D6）
- 改 `conversations.ts` 2 个 store 入口（撤销 D7）
- 改 `sidebar.tsx` streaming 状态点（撤销 D5）
- 改 `AGENTS.md` 硬规则
- 撤回本 ADR
- 写新 ADR 论证"为什么又改回 singleton / 跨切取消 / 一次性 Agent"

总改动 ≥ 7 处代码 + 1 个 ADR + 1 处硬规则。成本有意义 → 不可逆标记成立。

## References

- pi-mono Agent API: `https://github.com/badlogic/pi-mono`
- pi-mono `Agent.abort()` method: `agent.abort()` 是 V1 已验证的 abort 入口（`runtime.ts:299`）
- ADR-0007 § "Future maintenance": 单 main webview 约束
- ADR-0002 § "Decision": pi-mono 锁定
- ADR-0003 § "Effect-TS 逻辑层": service 模式
- ADR-0004 § "SQLite FTS5 持久化": `MessageService.list` 性能
- CONTEXT.md § "Settings F": `max_history: 1000` 软上限
