# 0040 — Conversation Context Compaction + ChatView Compaction Marker

**Status**: accepted · **Date**: 2026-08-01

为 codeman-agent 引入**上下文压缩 (context compaction)**:完整原始 turns 始终保留在 SQLite 与 ChatView 时间线中;压缩只改变后续发送给 LLM 的上下文(旧 turns 不再携带,只发送压缩摘要)。ChatView 在压缩边界显示可展开的 compaction marker。

## 背景与动机

- 当前 `runtime.ts` 把 `store.byId[convId].messages` 全部经 `toPiMessages` 投喂给 pi-mono Agent,无任何截断/摘要机制。
- `ContextRing` 仅做展示,无强制。`Settings.conversations.maxHistory` 与 `autoArchiveAfterDays` 已在 schema 中定义但**未实施**。
- 用户在 2026-08-01 主动要求"压缩 + ChatView marker"——经拷问锁定为 conversation context compaction (非存储压缩 / 手动 / 自动二选一)。

## Considered Options

### 库能力选型

| 选项 | 评估 |
|---|---|
| **迁移整个 runtime 到 `AgentHarness`** | pi 0.80.3 内置 `compact()` / `shouldCompact()` / `Session.appendCompaction()`。**拒绝**:会替换当前 per-conv `createAgentRuntime()` + SQLite 持久化整套架构,改造面过大,引入"harness 与现有 chat.store 双写"风险。 |
| **在 `transformContext` 中调用 pi 压缩函数,持久化自管** | **采纳**。`Agent` 类的 `transformContext` 是官方扩展点,允许在 `convertToLlm` 前对 `AgentMessage[]` 做任意变换。把 `compact()` / `shouldCompact()` / `generateSummary()` 当函数库用,SQLite 持久化与 ChatView 渲染仍归 codeman。 |

### 触发策略

- **仅自动**:简单但失去用户主动管理能力,长会话依旧受阈值被动。
- **仅手动**:可控但无法自动避免溢出,违背"压缩应主动减少 LLM 上下文"动机。
- **自动 + 手动**:**采纳**。自动路径在 `sendMessage` 发送前用 `shouldCompact()` 判定;手动路径通过工具条按钮触发,共用同一 `performCompaction` 函数。

### 保留多少最近 turn

- **保留 60% 窗口**:预估留 40% 给输出与误差。**拒绝**:在"严格不重发旧上下文"诉求下仍携带原文,与用户要求相违。
- **保留固定 N turns**:直觉但不同 turn 长度差异巨大。
- **不保留 turn,只发"摘要 + 后续 turns"**:**采纳**。每次压缩产物就是唯一发送给 LLM 的"过去",旧原文完全沉底。

### 重复压缩语义

- **全历史重做**:压缩请求本身仍会送入所有旧 turn,与"旧上下文不再发送"矛盾。
- **仅压缩一次**:实现最简,但长会话最终仍超窗。
- **滚动合并**:**采纳**。新压缩的输入 = "上一条 entry 的 summary + 自该 entry 之后的新增 turns",产出的新摘要替换旧摘要。**永不**重新携带首次压缩前的原文。

### 阈值

- **固定百分比 (80%)**:易解释,不同窗口下输出余量不均。
- **用户可配置**:灵活但首版新增 UI/校验/迁移,scope 蔓延。
- **pi 默认 `reserveTokens` / `shouldCompact`**:**采纳**。pi 在 `CompactSettings` 中已规定 `enabled` / `reserveTokens` / `keepRecentTokens`,直接复用其 `shouldCompact(contextTokens, contextWindow, settings)` 判定,行为与 harness 一致。

### 失败/取消语义

- **静默回退到未压缩上下文**:风险——超窗时直接被上游 API 拒绝,用户体验差。
- **静默继续**:丢失关键错误信息。
- **拒绝本次发送 + ErrorBanner**:**采纳**。压缩失败或被取消时,保留 SQLite 原状、不写不完整 marker,通过 `codemanToast.error` 或现有 `ErrorBanner` 告知用户,可重试。

## 决议

### 1. 持久化

- 新表 `compaction_entries(id, conversation_id, summary, model, tokens_before, kind, created_at, first_kept_message_id)`,通过 `0005_compaction_entries.sql` migration 落地。
- 新增 IPC channels:`compaction:list(conversationId)` / `compaction:append(entry)`,与 ADR-0026 camelcase 规范一致。
- Effect API 包装在 `src/renderer/src/shared/apis/compaction.api.ts`,与 `MessageApi` / `ConversationApi` 同构(ADR-0016 D4 边界)。

### 2. 领域模型

- `CompactionEntry` Schema(基于 effect/Schema, ADR-0025):
  ```ts
  Schema.Struct({
    id: ConversationId,
    conversationId: ConversationId,
    summary: Schema.String,
    model: Schema.String,
    tokensBefore: Schema.Number,
    kind: Schema.Union(Schema.Literal("auto"), Schema.Literal("manual")),
    createdAt: Schema.Number,
    firstKeptMessageId: MessageId,
  })
  ```
- `Settings.compaction: { enabled: Schema.Boolean; reserveTokens: Schema.Number }`,默认 `{ enabled: true, reserveTokens: 16384 }`,clamping 由 `settings-schema.ts` 统一执行。

### 3. ChatView 渲染

- `messages` 与 `compactionEntries` 在 UI 层是两条并行数组(`<For>` 交错渲染)。`CompactionEntry` **不**进入 `Message` 类型——避免污染 LLM 上下文语义,避免与 `Role` 闭联合并。
- `MessageBubble` 不增加新 role。新增独立组件 `CompactionMarker`,默认折叠 (`<details>`),展开显示摘要文本、模型、压缩前 token、时间戳。视觉沿用 `bg-warning/10 border-warning/30` 与 lucide `Compress`,无障碍 `role="separator"` + `aria-expanded` + `aria-label`。
- ChatView 工具条(发送按钮附近)新增"立即压缩"按钮,压缩中禁用 + spinner。

### 4. Runtime 接入

- `chat.store.ts::sendMessage` 发送前:`shouldCompact(estimatedTokens, contextWindow, settings) === true` 时,先 `performCompaction`;`performCompaction` 失败 `Effect.fail(CompactionFailed)` 并阻止 `sendMessage` 继续。
- `runtime.ts::createAgentRuntime` 把 `transformContext: async (msgs) => applyCompactionToContext(state, msgs)` 注入 Agent 配置,产出"最近一条 entry 的 summary + 该 entry 之后的所有 DbMessage → AgentMessage"。
- 新增 `RuntimeEvent` 变体:`compactionStarted` / `compactionCompleted(entry)` / `compactionFailed(reason)`,由 store 端订阅后写 `ConversationState.compactionStatus`。

### 5. 复用 pi 函数

- `import { compact, shouldCompact, generateSummary, findCutPoint, serializeConversation } from "@earendil-works/pi-agent-core"`,直接调用,不在本仓库重写摘要 prompt。
- 摘要文本 sanitize:在 entry 写入前过滤 `apiKey` / `Bearer ` / `secret` 等敏感字面,避免摘要泄漏凭据。

### 6. 错误类型

- `CompactionFailed` / `CompactionCancelled` 作为 `Schema.TaggedError` 子类,挂到 `AppError` 联合(ADR-0025 D4 风格),组件层通过 `Exit.match` 处理。

## Consequence

- 新增文件:
  - `src/main/db/migrations/0005_compaction_entries.sql`
  - `src/main/features/compaction/ipc.ts`(IPC 注册)
  - `src/main/features/compaction/mappers.ts`(行映射)
  - `src/renderer/src/shared/apis/compaction.api.ts`(Effect API)
  - `src/renderer/src/features/chat/lib/compaction/{index,trigger,perform,apply,errors,types}.ts`
  - `src/renderer/src/features/chat/components/compaction-marker.tsx`
  - 配套测试:`compaction/*.test.ts`、`compaction-marker.test.tsx`、`chat.store.compaction.test.ts`、`runtime.transform-context.test.ts`
- 修改文件:`CONTEXT.md` 词条、`runtime.ts`(`transformContext` 注入 + 事件)、`chat.store.ts`(自动触发 + 手动入口 + 事件订阅)、`chat-view.tsx`(工具条按钮 + 渲染入口)、`settings-schema.ts`(新增 `compaction` 字段)、`chat.index.ts`(公开 `compactNow`)、`src/main/index.ts`(registerIpc 新增)。
- 不动:`AgentHarness`、summarize skill、`maxHistory` / `autoArchiveAfterDays` 实现、message 表的 `input_tokens` / `output_tokens`、pi 上游。
- 风险:
  - pi 0.80.3 README 引用旧包名 `@mariozechner/agent`(本仓库不依赖其声明合并,无影响;若日后用到,必须用真实包名 `@earendil-works/pi-agent-core`)。
  - 真 provider 压缩调用需联网;e2e 走 mock provider + Q→A 新条目覆盖。
  - 摘要 sanitize 需在测试中显式覆盖"含 apiKey 的消息"样本。

## 决议出处

- 用户 2026-08-01 的需求"给项目增加压缩功能,chatview 中增加 compasion marker"(拼写错误已澄清为 compaction)。
- `/grill-with-docs` 阶段产物:`.omo/plans/compaction.md`。
- 库能力事实:`@earendil-works/pi-agent-core@0.80.3` 核心 `Agent` 不内置压缩,`AgentHarness` 提供完整压缩。
