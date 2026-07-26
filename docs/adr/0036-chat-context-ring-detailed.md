# 0036 — Chat-view 发送按钮左侧加 Context 圆环（`Detailed` 变体）

**Status**: accepted · **Date**: 2026-07-26

ChatView 的发送按钮**左侧**新增圆形上下文进度条 + 双行 label，作为持续的"剩余 context 余量"提示。在 `Draft ① → Round-2 ② → C ③` 三轮 UI 选中后落地：

- **形态**：variant C（Detailed） — 粗体 % + 紧凑 `used/total` 双行 + 单色 `stroke-primary` 圆环
- **几何（per user 2026-07-26 fixup）**：外径 20 px / stroke 2 px / 环↔按钮 16 px
- **数据源**：`currentModel.contextWindow`（total） + 优先 LLM API `inputTokens`（used），退路字符 /4 粗估
- **空态**：未选 provider 或 model 无 `contextWindow` → 不渲染（`return null`）

## Considered Options

- **右侧 vs 左侧**：第一版放到发送按钮右侧，user 2026-07-26 反馈应是左侧（理由：右侧贴近 Send icon，视线终点在按钮上，环作为"出发前的读数"更适合放左侧）。最终采纳左侧。
- **5 变体对比**（`/prototype/context-ring` 抛原型路由）：A plain / B centered / C detailed / D threshold / E minimal。User 选中 C。理由（来自用户原型阶段反馈）：双行 label 同时给出% 和 token 数，对 power user 最有用；环尺寸 20px 时视觉不至于太重。
- **环几何多档**：原 prototype 给了 `size=20/28/32/40` 几个变体。User 2026-07-26 把所有变体抹平到 `diameter=20px`,因为 Send button h-8 (32px) 是视觉锚点，环=20 让比例在 0.6 左右（视觉重量 ~2/3 send button），不会让环强抢 Send 注意力。
- **环与 Send 间距**：原 prototype slider 给了 0..32 px 全程。User 锁定 16 px（每个 rad 0.25，约为视觉单元间距的"舒服"档）。固定值，不做运行时可调。
- **token 计算真实 vs 估算**：总是优先 LLM API 真实回报（assistant msg 的 `inputTokens`）;无 API 数据时退到字符/4 粗估。理由：API 数据到达后立刻切换为真实值，不需要任何阈值开关；估算值只用于"对话刚发起但还没拿到第一次 API 回应"的窗口期。
- **阈值配色（warn/crit）**：本版本不引入,保留 ADR-X 扩展位。理由：用户在这一轮未把阈值配色选入 finalized spec；20×20 单色环已经能达到"读出% + token 数"的目标,阈值配色属于体验增强,需要独立 ADR。

## Consequence

- `src/features/chat/components/chat-view.tsx` 末尾追加模块级常量（`CTX_RING_*`）和 `ContextRing` 组件 + `ringInfo` memo;发送行 `Provider+Select+spacer+Send` 重排为 `…+spacer+ cluster[ring+16px+Send]`。
- `src/renderer/src/router.tsx` 移除 `/prototype/context-ring` 临时路由 + import；`src/renderer/src/features/chat/components/prototype/` 整个目录已删除（per `原型 skill §6 Capture`）。
- 范围仅 chat view。Home（`/`，无 active conversation 时）维持现状：HomeAgentForm 没有该环（不需要 — 创建对话时还没有 messages）。
- 后续动作：threshold 配色（CTX_RING_WARN_PCT/CTX_RING_CRIT_PCT）如果要做,开新 ADR 命名为 e.g. `0037-context-ring-threshold-coloring`,本 ADR 占位。

## 决议出处

- 临时对比原型路由（已删除）`/prototype/context-ring` — `?variant=&pct=&gap=` URL state,5 变体 slider。
- 用户在 prototype 阶段的口头确认："选 C,环↔按钮=16px,直径=20px,粗=2px"。

## V2.6.1 修正 (2026-07-27)

原 V2.6 ADR 锁定的数据模型存在两处实现缺陷,本修正修复。

### 问题 A: Context window 回退为 0

原设计: `total = model.contextWindow ?? 0`。当 providers 通过 API 拉取
(如 MiniMax 的 `GET /v1/models`) 时,`context_window` 字段不在 API 响应中,
导致 `ModelMeta.contextWindow === undefined`,环显示 "0% · 0 / 0 tokens"。

**修正**: 引入三层 context window 查找 (`lib/context-window-fallback.ts`):
1. `model.contextWindow` — API 返回了就优先
2. `provider.llm.contextWindow` — provider 级全局窗口 (新增 `ProviderLlm.contextWindow?: number` 字段)
3. 家族兜底表 — 硬编码 `MiniMax-M* → 200_000`

`chat-view.tsx` ringInfo 的 `total` 改用 `lookupContextWindow(model, provider)`。
`app.store.ts::refreshProviderModelsImpl` 在 API 拉取后调 `lookupContextWindow` 回填缺 `contextWindow` 的 model。

**影响文件**:
- `lib/types.ts`: `ProviderLlm.contextWindow?: number`
- `lib/context-window-fallback.ts` (新增)
- `app.store.ts::refreshProviderModelsImpl`
- `chat-view.tsx::ringInfo`

### 问题 B: inputTokens 始终为 0

原设计期望 `inputTokens` 由 LLM API 的 `usage.input_tokens` 填充,但实际链路断裂:
`anthropic-transport.ts::parseSseStream` 的 `message_delta` handler 只提取 `stop_reason`,
丢弃了 `data.usage`,导致 `AssistantMessage.usage` 始终为 `emptyUsage()` (全零)。

**修正**: `parseSseStream` 新增 `accUsage` 累积变量,在 `message_delta` 处理时
读取 `data.usage` 并累加;`snapshot()` 与最终返回不再用 `emptyUsage()`,改用 `{ ...accUsage }`。

同时 `mock-server.ts::buildSseTurnEvents` 的 `message_delta` 补充 `input_tokens`
字段 (chars/4 估算),使 mock 环境也能覆测 inputTokens 主路径。

**影响文件**:
- `lib/anthropic-transport.ts`
- `src/main/mock-server.ts`