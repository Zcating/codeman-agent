# — Compaction Rewrite as Message Pair (opencode-style)

**Status**: accepted · **Date**: 2026-08-14

**Supersedes**:

## Context

### 1. 实现的过度设计

ADR-0040（2026-08-01）为 codeman-agent 引入"context compaction"，落地形态是：

- 独立 SQLite 表 `compaction_entries(id, conversation_id, summary, model, tokens_before, kind, created_at, first_kept_message_id)`
- 独立 `RuntimeEvent` 联合变体 `compactionStarted` / `compactionCompleted(entry)` / `compactionFailed(reason)` —— 全代码库 grep 确认**这三个事件从未被发射**，仅有类型定义 / 测试 / reducer 消费者（`conversation-handler.ts` L185-196）三个死代码现场
- `ConversationState.compactionStatus: idle | compacting | completed | failed` 四态机
- ChatView 用 `interleavedItems()` 把消息与 `CompactionEntry` 交错渲染，独立 `<CompactionMarker>` 折叠卡片
- `chat.store.ts::doCompaction` 同步设置状态、调用 `generateSummary`、IPC 写盘 —— 完全不经过 `RuntimeEvent` 流
- 失败**完全静默**：`chat-view.tsx` L237-251 注释明确"chat LLM errors are silent"，`compactNow` 错误用 `void exit` 吞掉（L359-362），`sendMessage` 内部 try/catch 也吞掉（L368-373）

### 2. 用户原话驱动的反思（2026-08-14）

用户原话：

> compaction 本质就是一个输入一段提示词总结当前上下文的内容。不应该有独立的事件，如果真的需要有那也是应该再页面上展示 Compaction 而不是什么都没有提示。

这把 路径的两个隐含假设都推翻了：

- **"compaction 是独立实体"**——它是「输入一段提示词总结当前上下文」的一次 LLM 调用，不是一种独立类型
- **"compaction 状态是独立状态机"**——它的输入与输出都是普通消息对（user + assistant），没有理由为它再造一套事件类型与状态字段

### 3. opencode 的精确参考

opencode `@opencode-ai/core/session/compaction.ts` 把 compaction 完全建模为「user message 上挂一个 `CompactionPart`」：

```ts
// opencode schema/v1/session.ts L195
export const CompactionPart = Schema.Struct({
  ...partBase,
  type: Schema.Literal('compaction'),
  auto: Schema.Boolean,
  overflow: Schema.optional(Schema.Boolean),
  tail_start_id: Schema.optional(MessageID),
});
```

summary 内容是普通 assistant message（`mode:"compaction"`, `summary:true`）。compaction 触发消息与 summary **都存盘**，但 compactionPart 在 UI 渲染时**被隐藏**，时间线上只看到 summary。

opencode 也发一个事件（`session.compacted`）但仅用于**通知模块**，不发 started/failed —— 因为失败被建模为 `assistant.error` 字段 + `finish:"error"`，复用现有错误流。

opencode 还有独立 `prune()` 操作：清理老 tool output，**与 compaction 解耦**。

## Decision

### D1. 模型：把 compaction 完全建模为消息对

- `Message` schema 引入 `parts: MessagePart[]` 字段，**统一拆 parts**（migration 把现有 `content` / `thinking` / `toolCalls` / `toolResults` 拆为 `TextPart` / `ReasoningPart` / `ToolPart`）
- 新增 `MessagePart` 联合类型（discriminator `type`）：
  ```ts
  type MessagePart =
    | {
        type: 'text';
        text: string;
        synthetic?: boolean;
        ignored?: boolean;
        time?: { start: number; end?: number };
      }
    | {
        type: 'tool';
        callId: string;
        tool: string;
        state: ToolState;
        metadata?: Record<string, unknown>;
      }
    | { type: 'reasoning'; text: string; time?: { start: number; end?: number } }
    | { type: 'compaction'; auto: boolean; overflow?: boolean; tailStartId?: MessageID };
  ```
- 与 opencode `CompactionPart` schema 严格对齐：`auto`、`overflow`、`tail_start_id` 三字段（snake_case → camelCase 映射 `tail_start_id` → `tailStartId`）
- compaction 触发 = 一条 user message + `CompactionPart`（**不带** text part —— part 数组里只有 compaction 这一项）
- summary = 一条普通 assistant message（`role:'assistant'`, `content` 文本是 summary 内容，`mode:'compaction'`, `summary:true` 是 Message 元数据）
- **不**新增 `compaction_entries` 表。**不**新增 `CompactionEntry` 类型。

### D2. 原文保留，context 注入只发 summary + tailStartId 之后

- messages 表里**原文完整保留**（与用户原话"compaction 之前的所有对话保留"一致）
- 注入 LLM 的 context 由 `transformContext` 改写：只发「最近 compactionPart 的 summary message」+「`tailStartId` 之后（含）的所有消息」
- 没有 compaction 时注入所有消息（与现状一致）
- 与 一致：`transformContext: async (msgs) => applyCompactionToContext(state, msgs)`，但 `applyCompactionToContext` 改为基于 parts 而不是基于 `CompactionEntry` 数组

### D3. 触发：自动 + 手动并存（`CompactionPart.auto` 字段）

- **自动**：`sendMessage` 发送前用 `shouldTriggerAutoCompaction(estimatedTokens, contextWindow, reserveTokens)` 判定；超阈值则触发，**写入** `auto:true, overflow:true` 的 compactionPart
- **手动**：保留 ContextRing popover 的"立即压缩"按钮，触发时写 `auto:false, overflow:undefined`
- 两者都走同一个 `doCompact(convId, opts)` 函数，**同步函数**，无状态机
- 手动入口不需要状态机 —— 因为 doCompact 是同步的，按钮 disable 期间 UI 自然不可点；UI 显示只通过 MessageBubble 自身的加载态（assistant message 还在生成）

### D4. UI 展示：触发消息隐藏，summary 作为普通 assistant 显示

- ChatView 时间线只渲染 `Message.parts` 里的非 `compaction` 消息
- compactionPart 在 UI 层完全跳过（与 opencode renderer 行为一致）
- summary 是普通 assistant message，正常渲染 `<MessageBubble>`，**自带 tool_calls / thinking 等字段就照常显示**
- 用户看到的就是时间线中间有一段"AI 总结"，无独立 marker

### D5. 失败语义：阻塞 + summary message 自带 error

- compaction 失败时仍然走 doCompact 函数，但**写入一条** summary assistant message（`mode:'compaction'`, `summary:true`, `error: <reason>`, `finish:'error'`）
- 时间线**真实显示**这条失败 message，按现有 MessageBubble 的 error 渲染分支显示
- sendMessage 收到 `Effect.fail` 后**不**继续执行（不发送原始 context，避免超窗直接被 API 拒绝）
- 与 opencode 一致：`if (processor.message.error) return "stop"`
- **不**抛 toast / banner —— 用户在时间线上**已经看到**了失败消息（这是用户原话"应该再页面上展示 Compaction"的具体兑现）

### D6. prune（清理老 tool output）作为独立操作同步实现

- 与 opencode `prune()` 对齐：单独函数 `pruneOldToolOutputs(convId)`，只清理 `ToolPart.state.time.compacted === undefined` 的老 tool 的 `output` 字段
- 与 compaction 解耦：prune 不调 LLM，不改 message count，只释放 token 空间
- 在 `sendMessage` 前**先**做 prune（如果 `cfg.compaction.prune === true`），再做自动 compaction 阈值判定
- 保留 `PRUNE_MINIMUM = 20_000` / `PRUNE_PROTECT = 40_000` / `TOOL_OUTPUT_MAX_CHARS = 2_000` / `DEFAULT_TAIL_TURNS = 2` 等 opencode 参数（snake_case 保留为 const 命名）
- prune 失败的 tool 不会破坏对话（仅丢部分 tool output），无需独立错误展示

### D7. model：复用主对话 model（不引入 compaction agent）

- compaction LLM 调用使用 `chat.store.byId[convId]` 当前的 `provider` + `model`
- 与 一致：用户在 settings 选的主模型就是 compaction 用模型
- **不**新增 `cfg.compaction.model` 配置字段（保持最简）
- 后果：用户必须接受主模型也用于 summary。如用户后续要拆分，再起新 ADR

### D8. 旧数据迁移：DROP TABLE 不兼容

- 旧 `compaction_entries` 表通过新增 migration `0006_drop_compaction_entries.sql` 直接 DROP
- 不写迁移逻辑：旧 compaction 在重启后会消失，**用户接受此 trade-off**
- 与"全推倒重做"一致：用户已决策"丢弃旧数据"

### D9. parts 改造范围：统一拆 parts（migration）

- 新增 migration `0007_message_parts.sql`：把所有现有 message 的 `content` / `thinking` / `tool_calls` / `tool_results` JSON 字段拆为 `MessagePart[]` 存到新表 `message_parts(message_id, ordinal, type, data_json)`
- Message `content` / `thinking` / `toolCalls` / `toolResults` 旧字段保留为 nullable，**只读**，新写入路径不再写它们
- 读路径：`MessageApi.list(convId)` 时把旧字段一次性 hydrate 为 parts；写入路径只写 parts
- 这样老数据库可以渐进升级，不破坏现有 conversations

### D10. 手动入口：保留 ContextRing "立即压缩" 按钮

- ContextRing 保留 popover "立即压缩" 按钮
- popover 去掉"压缩中..." spinner（因为 doCompact 是同步函数，按钮 disable 期间 UI 自然不可点）
- 失败时不需要按钮态变化 —— 失败已经在时间线上显示了
- 移除 `ContextRing.compacting` 与 `onCompact` prop 的状态机语义，改为纯回调

## Consequence

### 删除项（全量清理）

| 路径                                                                        | 类别       | 备注                                                                                                                     |
| --------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| `src/main/db/migrations/0005_compaction_entries.sql`                        | migration  | 被 `0006_drop_compaction_entries.sql` 取代                                                                               |
| `src/main/features/compaction/ipc.ts`                                       | IPC 注册   | 删除                                                                                                                     |
| `src/main/features/compaction/ipc.test.ts`                                  | 测试       | 删除                                                                                                                     |
| `src/main/features/compaction/mappers.ts`                                   | 行映射     | 删除                                                                                                                     |
| `src/main/features/compaction/mappers.test.ts`                              | 测试       | 删除                                                                                                                     |
| `src/main/features/compaction/data.ts`                                      | DAO        | 删除                                                                                                                     |
| `src/main/features/compaction/data.test.ts`                                 | 测试       | 删除                                                                                                                     |
| `src/main/features/compaction/index.ts`                                     | barrel     | 删除                                                                                                                     |
| `src/renderer/src/shared/apis/compaction.api.ts`                            | Effect API | 删除                                                                                                                     |
| `src/renderer/src/shared/apis/compaction.api.test.ts`                       | 测试       | 删除                                                                                                                     |
| `src/renderer/src/features/chat/lib/compaction/index.ts`                    | barrel     | 删除                                                                                                                     |
| `src/renderer/src/features/chat/lib/compaction/perform.ts`                  | 业务       | 删除                                                                                                                     |
| `src/renderer/src/features/chat/lib/compaction/perform.test.ts`             | 测试       | 删除                                                                                                                     |
| `src/renderer/src/features/chat/lib/compaction/apply.ts`                    | 业务       | 删除                                                                                                                     |
| `src/renderer/src/features/chat/lib/compaction/apply.test.ts`               | 测试       | 删除                                                                                                                     |
| `src/renderer/src/features/chat/lib/compaction/trigger.ts`                  | 业务       | 删除（阈值判定 inline 化）                                                                                               |
| `src/renderer/src/features/chat/lib/compaction/trigger.test.ts`             | 测试       | 删除                                                                                                                     |
| `src/renderer/src/features/chat/lib/compaction/sanitize.ts`                 | 业务       | 删除（summary 由 LLM 输出，无需 sanitize）                                                                               |
| `src/renderer/src/features/chat/lib/compaction/errors.ts`                   | 错误类型   | 删除（失败走 message.error 字段）                                                                                        |
| `src/renderer/src/features/chat/lib/compaction/types.ts`                    | 类型       | 删除                                                                                                                     |
| `src/renderer/src/features/chat/components/compaction-marker.tsx`           | 组件       | 删除                                                                                                                     |
| `src/renderer/src/features/chat/components/compaction-marker.test.tsx`      | 测试       | 删除                                                                                                                     |
| `src/renderer/src/features/chat/stores/setup-conv-state-compaction.test.ts` | 测试       | 删除（不再需要 async load entries）                                                                                      |
| `src/renderer/src/features/chat/stores/chat.store.compaction.test.ts`       | 测试       | 删除（业务已迁）                                                                                                         |
| `e2e/06-compaction.spec.ts`                                                 | e2e        | 重写（不再测 marker）                                                                                                    |
| `RuntimeEvent.compactionStarted/Completed/Failed`                           | 类型       | 删除（`runtime-events.ts` L14-16）                                                                                       |
| `conversation-handler.ts::compactionStarted/Completed/Failed reducer 分支`  | reducer    | 删除                                                                                                                     |
| `ConversationState.compactionEntries`                                       | 字段       | 删除                                                                                                                     |
| `ConversationState.compactionStatus`                                        | 字段       | 删除                                                                                                                     |
| `chat.store.ts::doCompaction`                                               | 业务       | 删除                                                                                                                     |
| `chat.store.ts::compactNow`                                                 | 业务       | 删除（替换为 `doCompact` 同步函数）                                                                                      |
| `chat.store.ts::COMPACTION_ENABLED/CONTEXT_WINDOW/RESERVE_TOKENS 常量`      | 常量       | 删除（迁 `cfg.compaction`）                                                                                              |
| `chat.store.ts::shouldTriggerAutoCompaction 调用`                           | 业务       | 改为 inline 阈值                                                                                                         |
| `chat-view.tsx::handleCompactNow`                                           | 业务       | 替换为 `doCompact` 同步调用                                                                                              |
| `chat-view.tsx::interleavedItems`                                           | 业务       | 删除（不再需要消息/marker 交错）                                                                                         |
| `chat-view.tsx::currentCompactionStatus`                                    | 业务       | 删除                                                                                                                     |
| `chat-view.tsx::compactionEntries()` accessor`                              | 业务       | 删除                                                                                                                     |
| `context-ring.tsx::compacting/onCompact props`（半量）                      | API        | 保留 `onCompact` 回调，移除 `compacting` 状态 prop                                                                       |
| `settings-schema.ts::compaction` 字段                                       | 配置       | 保留 `enabled` / `reserveTokens` / `prune` / `preserveRecentTokens` / `tailTurns`（与 opencode `cfg.compaction.*` 对齐） |

### 新增项

| 路径                                                                                              | 类别      | 备注                                                   |
| ------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------ |
| `docs/adr/0075-compaction-rewrite-as-message-pair.md`                                             | ADR       | 本 ADR                                                 |
| `.omo/plans/compaction-rewrite-2026-08-14.md`                                                     | 计划      | 实施步骤                                               |
| `src/main/db/migrations/0006_drop_compaction_entries.sql`                                         | migration | DROP TABLE compaction_entries                          |
| `src/main/db/migrations/0007_message_parts.sql`                                                   | migration | 新表 `message_parts` + 拆分旧字段                      |
| `src/main/db/mod.ts::message_parts` 表定义 + DAO                                                  | DAO       | 新增                                                   |
| `src/main/db/mod.ts::message_parts.test.ts`                                                       | 测试      | 新增                                                   |
| `src/shared/lib/types.ts::Message` 增加 `parts: MessagePart[]`                                    | schema    | 重构                                                   |
| `src/shared/lib/types.ts::MessagePart` 联合类型                                                   | schema    | 新增                                                   |
| `src/shared/lib/schemas/message.schema.ts`                                                        | schema    | 新增（或扩展现有）                                     |
| `src/main/features/messages/data.ts::MessageApi` 改造：写 parts                                   | API       | 改                                                     |
| `src/main/features/messages/mappers.ts` 改造：hydrate parts                                       | mapper    | 改                                                     |
| `src/renderer/src/features/chat/lib/compaction/compact.ts`                                        | 业务      | 新增（同步 `doCompact(convId, opts)` 单文件）          |
| `src/renderer/src/features/chat/lib/compaction/prune.ts`                                          | 业务      | 新增（独立 `pruneOldToolOutputs(convId)`）             |
| `src/renderer/src/features/chat/lib/compaction/build-prompt.ts`                                   | 业务      | 新增（与 opencode `buildPrompt` 对齐，提示词独立可测） |
| `src/renderer/src/features/chat/lib/compaction/select.ts`                                         | 业务      | 新增（与 opencode `select` 对齐，决定 tail_start_id）  |
| `src/renderer/src/features/chat/lib/compaction/estimate.ts`                                       | 业务      | 新增（token 估算独立可测）                             |
| `src/renderer/src/features/chat/lib/compaction/compact.test.ts`                                   | 测试      | 新增                                                   |
| `src/renderer/src/features/chat/lib/compaction/prune.test.ts`                                     | 测试      | 新增                                                   |
| `src/renderer/src/features/chat/lib/compaction/build-prompt.test.ts`                              | 测试      | 新增                                                   |
| `src/renderer/src/features/chat/lib/compaction/select.test.ts`                                    | 测试      | 新增                                                   |
| `src/renderer/src/features/chat/components/message-bubble.tsx` 增加 compaction part 跳过分支      | UI        | 改                                                     |
| `src/renderer/src/features/chat/components/message-bubble.test.tsx` 增加 compaction part 跳过测试 | 测试      | 改                                                     |
| `chat.store.ts::sendMessage` 增加 parts-based transformContext                                    | 业务      | 改                                                     |
| `chat.store.ts::sendMessage` 自动 compaction 触发改为 inline（不再走 doCompaction）               | 业务      | 改                                                     |

### 风险

1. **migration 顺序**：0006（DROP compaction_entries）必须在 0007（拆 parts）之前 —— 否则 parts 拆完后再删表会留下对死表的外键引用（虽然当前没有 FK，但要按 SQL 命名顺序一致）
2. **schema 升级**：现有 conversations 数量可能很大（10k+），parts 拆分的 migration 必须有 transaction，否则中途失败会损坏数据库
3. **transformContext 改造**：`applyCompactionToContext` 从 `CompactionEntry[]` 改为 parts-based 是一处热路径，必须保留 e2e `06-compaction.spec.ts`（重写）做行为回归
4. **MessageBubble 渲染**：必须保证 compaction part 100% 不渲染（用户原话"应该再页面上展示 Compaction"的反面：触发消息**不能**看到）。需要专门 snapshot 测试覆盖
5. **失败回退**：compaction 失败阻塞 sendMessage 后，用户必须重试或删除失败 summary message 才会重发。如 UX 不友好，下一期可考虑增加"跳过压缩"按钮
6. **prune 误删**：`pruneOldToolOutputs` 清空老 tool output 是不可逆的。如出错会导致用户回看历史时看不到 tool 调用结果。当前实现选择信任（与 opencode 一致）
7. **settings 字段迁移**：现有 `Settings.compaction: { enabled, reserveTokens }` 需要扩字段（加 `prune`, `preserveRecentTokens`, `tailTurns`），必须给 schema-clamping 留默认值
8. **pi `generateSummary` 函数库**：ADR-0040 D5 已经依赖 `@earendil-works/pi-agent-core` 的 `generateSummary`，本 ADR 继续复用，不在 codeman 侧重写提示词

### 不动

- `AgentHarness`、summarize skill、`maxHistory` / `autoArchiveAfterDays` 实现、message 表的 `input_tokens` / `output_tokens`、pi 上游
- Provider 配置（model 选择 / API key / baseUrl）
- Workspace / Project Instructions / Skills 等其他 chat runtime 配套
- TanStack Router / Electron 主进程 IPC 基础设施

### 验证标准（"done" 的定义）

- [ ] 所有旧 `compaction_*` 文件 / 测试 / 类型 / 字段 / 状态机变体 / 状态常量 / 状态 accessor 删除干净（grep 全代码库无残留）
- [ ] `RuntimeEvent` 联合类型不再含 compaction 变体
- [ ] `chat.store.ts::sendMessage` 自动 compaction 阈值判定仍生效（e2e 重写覆盖）
- [ ] ContextRing "立即压缩" 按钮可用，点击后时间线出现 summary message
- [ ] compaction 失败时 summary message 自带 error 字段并在时间线上以红色样式渲染（手动触发 + provider 配置错两种场景各覆盖一次）
- [ ] compaction 触发消息（带 compactionPart 的 user message）在时间线上**不可见**（专门 snapshot 测试）
- [ ] `transformContext` 注入 LLM 的 context 不包含 compactionPart 之前的任何消息（token 计数回归）
- [ ] `pruneOldToolOutputs` 单独调用时仅清空老 tool output，不影响其他 part（专门单测）
- [ ] migration 0006 / 0007 在已有 conversations 的测试库上正向跑通（不丢失原有 message；compaction_entries 被删）
- [ ] `vp run typecheck` / `vp run test` / `vp run lint` 全绿
