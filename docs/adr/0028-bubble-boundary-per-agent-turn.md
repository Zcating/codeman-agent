# Bubble Boundary: per agent turn

Adopt pi-mono's contract — 每个 agent turn = 1 个 assistant message = 1 个 bubble。Revert V3.1 cross-turn thinking aggregation（turn-1 的 thinking block 不再搬到 turn-2 的 bubble 顶部）。Tool result 仍 inline 在触发它的 turn 的 `toolResults[]` 字段（不走独立 `role:tool` bubble）。Runtime emit 模式从「一次 `agent_end` 聚合 → 1 个 `done`」改为「每个 `turn_end` → 1 个 `done`」，跟上游 pi-agent-core 的事件契约对齐。

## 上下文

V3.1 fix 跨 turn 聚合了 thinking + tool_calls 到最后一个 assistant bubble 的顶部，原因是 thinking 块往往在 turn-1（agent 决定要不要 tool_use 时产生），final answer 在 turn-N，跨 turn 聚合能让用户在一个 bubble 顶部看到完整 reasoning。代价是 1 user input 永远 = 1 个 assistant bubble，多 turn 任务无法独立滚动/折叠，scroll position / thinking 折叠状态耦合。

## 决策

- **Bubble boundary = Agent-turn boundary**：runtime 监听 `turn_end` 事件，每个 turn emit 1 个 `done`（含该 turn 的 assistant message）；不再监听 `agent_end` 聚合。
- **Tool result inline**：`ToolCallPanel` 继续渲染在所属 turn 的 assistant message 的 toolResults[] 字段内（当前 V3 MessageBubble 行为不变）。
- **跨 turn 不聚合**：turn-1 的 thinking block 只在 turn-1 的 bubble 顶部，不搬到 turn-2 bubble。AGENTS.md runtime events 表的 `done` 行附注改为「per turn, not per run」。
- **chat.store.ts**：`streamingMessageId` 从「1 run 1 stub」改为「1 turn 1 stub」——`turn_end` 后清 stubId 让下一个 turn 创建新 stub。`persistAssistantMessage` 仍按 `done` 调一次。

## 状态

proposed

## Considered Options

- **C. Logical-unit boundary（V3.1 现状）**：1 个完整回答 = 1 assistant message，跨 turn thinking/tool/text 全 inline。代价 0，但多 turn 任务不可拆，未来接 steering / follow-up 会乱。
- **B. Content-type boundary**：tool_result 走独立 `role:tool` bubble。贴近 ChatGPT graph 模型。代价最大（DB schema、scroll state 重做）。
- **D. Hybrid**：runtime 保持 1 bubble，UI 层加「expand steps」控件。平常跟 C 一样，需要时展开看到内部 N 个 turn。代价小，但 UI 状态机复杂化。

## Consequences

- 多 turn 任务可独立滚动 / 折叠 / 持久化。Debug 时 1 turn = 1 DB row。
- 跟 pi-agent-core 上游事件契约对齐（每 turn 有独立 lifecycle），未来接 steering / follow-up 时不用再拆 V3.1 aggregation。
- **V3.1 fix 撤掉**：用户失去「跨 turn reasoning 上下文完整性」的体验。Mitigation：thinking 仍按 turn 渲染，turn-1 的 reasoning 完整在 turn-1 bubble 顶部；用户可滚动回 turn-1 看。
- ChatStore 测试要新增「1 run 多 stub」的场景覆盖（runtime.test.ts 已经证明 multi-turn agent_end 含 N assistant messages，但 chat.store 的 streamingMessageId 生命周期要重测）。

## 不在 scope

- ToolCallPanel 视觉变化（保持 inline 卡片）。
- DB schema 变化（`messages` 表字段不动）。
- 旧 session history 迁移（DB 里现存的跨轮聚合 message 保留原状不动）。
- runtime events 协议升级到 ts-pattern / 6 变体类型签名（那是 V3.1 已落地的，跟本次 boundary 决策正交）。

## 后续：V2.8 拆分 per-turn stub 与 per-message running 状态

ADR-0028 让 `streamingMessageId`「1 turn 1 stub」（`done` 时清 → 下一 turn 创建新 stub），正确实现了多 turn 任务独立 stub。但 `done` 同时清 `streamingMessageId` 也成了 chat-view `isRunning()` 唯一的真值信号，导致多 turn 场景下中间 `done` 触发会让 UI isRunning 在 turn 间抖动（Stop → Send → Stop → Send）。

**V2.8（chat-view V2.8，2026-07-29）**：拆出 `isAgentActive: boolean` 作为 per-message running 信号。`done` 仍清 `streamingMessageId`（per-turn 行为不变，符合 ADR-0028 决策），但**不**碰 `isAgentActive`。`isAgentActive` 由 sendMessage 起始置 true，由新增的 `message_stop` RuntimeEvent 变体（runtime 在 `agent_end` 时 emit）置 false。chat-view 的 `isRunning()` 改读 `isAgentActive`，Send/Stop 按钮只在 message 真正结束时切一次，不在中间 turn 间抖动。

新增变体：

```ts
| { type: "message_stop" }  // V2.8: agent_end 时 emit; chat.store 清 isAgentActive
```

详见 `src/renderer/src/features/chat/lib/runtime.ts` 的 `handleAgentEnd` 注释与 `chat.store.ts` 的 `ConversationState.isAgentActive` 字段。