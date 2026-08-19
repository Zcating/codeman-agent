# 0029 — Form 模式统一应用到 HomeAgentForm 与 ChatView

**Status**: accepted · **Date**: 2026-07-16
**Scope**: `src/features/chat/components/home.tsx` (改) + `src/features/chat/components/chat-view.tsx` (改) + `src/features/chat/lib/schemas.ts` (新增) + `src/features/chat/components/home.test.tsx` (改) + `src/features/chat/components/chat-view.test.tsx` (改) + `src/shared/components/ui/toast.tsx` (新增) + `src/shared/components/internal/codeman-toast.tsx` (新增) + `src/index.tsx` 或 `__root.tsx` (改 — mount `<Toaster />`) + `CONTEXT.md` (改 — 加 "Draft (form field)" + "Toast (notifier)" 词条)

**Related**: (Effect Schema as default schema library — Schema 提供 form 验证底座), ADR-0015/0016 (ProviderCard TanStack Form 模板), (codeman-* namespace — codeman-toast 同源)

## Context

HomeAgentForm (`features/chat/components/home.tsx`) 与 ChatView (`features/chat/components/chat-view.tsx`) 当前用裸 `createSignal` + 原生 `<form onSubmit>` 拼装：

- textarea 的草稿（Home + ChatView 各自 `createSignal("")`）
- workspace picker (仅 Home) — `<CodemanSelect>` 包装，change 立即写 `chat.store.selectedWorkspaceId$`
- LLM picker (Home) / ProviderSelect (ChatView) — `<CodemanGroupSelect>` 包装，change 立即写 `appStore.providers[].llm.defaultModel` + `defaultLlmProviderId` + `settingsSaver.scheduleSave()`
- Send 按钮 + 三步 handleSend（`createConversation` await → `recordInputEntry` + navigate → `sendMessage` fire-and-forget）
- Cancel 按钮（仅 ChatView, `<Show when={!isRunning()}>` 切换）

3 个具体痛点：

1. **`createConversation` 失败时 `return` 静默**（Home:166-176）— 用户按 Send 看见啥也没发生，没有错误反馈。
2. **typing 期间共享派生 state 可能重算** — ProviderCard 在 Plan C (2026-07) 已修复同源 bug（Base URL / API Key 打字失焦）；Home/ChatView 还没接 TanStack Form，但 LlmPicker/ProviderSelect 的 `appStore.set({ providers: array.map(...) })` 在每次 select change 都触发整批 providers 替换，subscription 链路上的 derived selector 可能不必要重算。
3. **Cancel 按钮与 form 提交语义不清** — `<Show>` 切按钮组合（Send ↔ Cancel）与"按钮控制的是 form 提交"语义不一致，未来加新按钮（如"Stop and save draft"）易乱。

V2.4 输入历史（Home + ChatView 两处都有 ArrowUp/Down + onKeyDown handler）和 IME-safe `<CodemanTextarea>` 的 onValueChange（commit 时机）也需要在 form 模式里保留 —— 它们是 textarea-level 而非 form-level 的关注点。

settings 域 `ProviderCard` ([features/settings/components/provider-card.tsx](file:///C:/Users/zcati/Documents/project/codeman-agent/src/features/settings/components/provider-card.tsx)) 在 Wave 2026-07 Plan C 落地了 canonical 模板：`createForm` + `form.Field` + `effectSchema(Schema)` 验证 + onBlur/onChange commit + IME-safe 字段控件 + ESLint 防回归。Home/ChatView 此前被有意推迟 — 当前 wave 是落地时机。

## Decision

### D1 — 复用 ProviderCard 模式：3 form + onBlur/onChange commit

两个 form 都用 `@tanstack/solid-form` 的 `createForm(() => ({ defaultValues, validators: { onChange: effectSchema(Schema.Struct({...})) }, onSubmit: async ({ value }) => { ... } }))` + `<form.Field name="...">` 渲染每个字段。提交只在以下情况发生：(a) 用户按 Send / Ctrl+Enter / `form.handleSubmit()` 触发；(b) `form.state.canSubmit === true`。typing 期间 form 内部 signal 持有 field 值，appStore / chatStore 不被写入。

### D2 — 字段名：Home 3 field + ChatView 2 field

| Form | field | 类型 | Schema | 来源（Sentinel ""） |
|---|---|---|---|---|
| Home | `draft` | string | `DraftSchema` = `Schema.String.pipe(Schema.minLength(1))`，表单提交时 reject "" | 当前 `input()` |
| Home | `modelId` | string | `ModelIdFieldSchema` = `Schema.String.pipe(Schema.minLength(1))` | 当前 `currentModelId()` 的 `"" \| modelId` |
| Home | `workspaceId` | string | `WorkspaceIdFieldSchema` 同上（哨兵 ""） | 当前 `selectedWorkspaceId$()` 的 `null \| id` |
| ChatView | `draft` | string | 同 Home | 同 Home |
| ChatView | `modelId` | string | 同 Home | 同 Home |

**字段名 `draft` 而非 `input`/`content`** — `Message.content`（chat 域已存在的术语，指已持久化的 assistant 正文）与 form "草稿" 语义不同；`draft` 与"未持久化、可丢弃"语义贴合，且与 SQL `draft_messages` 表的隐喻自然衔接。

**字段 schema 接受 "" 哨兵**：field schema 实际定义 = `Schema.Union(Schema.Literal(""), Schema.String.pipe(Schema.minLength(1)))`。`defaultValues` 设 `""`（来自 `selectedWorkspaceId$() ?? ""` 等转译）；form-level onChange validator 把 `""` 当 invalid → `canSubmit=false` → Send 按钮 disable。ProviderCard 模板的 `BaseUrlSchema` 是 `Schema.String.pipe(Schema.minLength(1))`（无 "" 允许），本 ADR 引入 `ModelIdFieldSchema` / `WorkspaceIdFieldSchema` / `DraftFieldSchema` 三个 union variants 与 BaseUrl 对齐但带 "" 哨兵 —— 与 settings 域字段表单略有差异（settings 域字段始终非空），文档化到 `features/chat/lib/schemas.ts` 头部注释。

**Schemas 落位**：`features/chat/lib/schemas.ts`（新增）— 与 settings 域对称（[ADR-0025 D6](file:///C:/Users/zcati/Documents/project/codeman-agent/docs/adr/0025-effect-schema-as-default-schema-library.md) "domain schema 归属 feature"）。四个 schemas 同文件：`DraftSchema` / `ModelIdFieldSchema` / `WorkspaceIdFieldSchema` / `HomeFormSchema` / `ChatViewFormSchema`（Home 多一个 `workspaceId`）。

### D3 — form-level disabled 切 running，Cancel 渲染为 form 外部 sibling

ChatView 当 `isRunning()` 时：

- form element 加 `disabled` 属性（TanStack Form Solid 支持 form-level disabled）— 全部 `form.Field` 自动 disable，Send 按钮同步 disable
- `<Cancel>` 渲染为 form 外部 `<button type="button" onClick={handleCancel}>`，与 ProviderCard 的 footer `<Button variant="destructive">Delete provider</Button>` 同构

"form = 提交候选态" 与 "Cancel = 取消候选态" 显式分属不同 element，避免 `<Show fallback={Cancel}>` 在两种 button type 间隐式翻转。

> **2026-07-29 V2.8 覆盖**：Send/Cancel 合并为同一位置的 `<Show when={isRunning()} fallback={Send}>` 切换 — running 时 Send 变 Stop（`type=button`, `variant=destructive`, `<Square>` 图标, "停止"）。原 D3/D6 的"Cancel 必须为 form 外部 sibling"约束已**不适用**。决策见 `src/renderer/src/features/chat/components/chat-view.tsx` 头部 V2.8 注释与 `chat-view.test.tsx` 三个 Send/Stop 形态测试。

### D4 — onSubmit 内联（不抽 submitDraft helper），覆盖到 step 3 dispatch

两个 form 的 `onSubmit = async ({ value }) => { ... }` 各自内联全部 3 步（provider card 模板的 onSubmit 也是内联），不抽 helper 函数：

- `await Effect.runPromiseExit(createConversation(wsId, value.draft.trim().slice(0, 30)))` —— await 是必须的（step 2/3 需要 `convId`）
- `Enter.isFailure` → `codemanToast.error(formatAppError(exit.cause))` 并 return（**修复既有 silent-drop bug**）
- `recordInputEntry(value.draft.trim())` + `setInput("")` 等价（form `value.draft` 被 step 1 触发前已 trim）
- `navigate({ to: "/conversation/$convId", params: { convId } })`（Home）/ nothing（ChatView 已经在该路由）
- `Effect.runPromiseExit(sendMessage(convId, value.draft.trim(), provider))` — fire-and-forget，**不 await**（step 3 是 long-running streaming）

`form.handleSubmit()` 返回的 promise 在 step 3 dispatch 后 resolve，`isSubmitting` 视觉短暂。

**不抽 helper** — 与 ProviderCard 模板的内联风格保持一致；form-onSubmit 各自维护；测试改为 form 状态 + handler 单测（不构造 shared helper 单测）。

### D5 — Toast infrastructure 替代 inline banner

两个 form 的错误反馈统一走新建的 toast infrastructure（替代决策 ④ "unify to banner" — 后被 toast 取代）：

| 文件 | 作用 |
|---|---|
| `src/shared/components/ui/toast.tsx` (新增) | `@ark-ui/solid` Toast primitive 包装（shadcn/ui 风格），与 `dialog.tsx` 同构（[ADR-0023 D4-S](file:///C:/Users/zcati/Documents/project/codeman-agent/docs/adr/0023-codeman-prefix-and-ark-ui-select.md)）|
| `src/shared/components/internal/codeman-toast.tsx` (新增) | 命令式 API：`codemanToast.error(msg: string, opts?)` / `codemanToast.success(msg: string, opts?)`，与 `codeman-dialog` 同构（`Dialog.alert / .confirm / .show`） |
| `src/index.tsx` 或 `__root.tsx` (改) | mount 一次 `<Toaster />`（atom 的 mount 实例） |

ChatView 既有 inline `<div role="alert" data-testid="chat-error-banner">` 删除（runtime 错误改走 `codemanToast.error(formatAppError(...))`）—— 不再需要 chat-store 上的 `lastChatError$` signal（之前 ④ banner 方案预留的）。

**为何 toast 优于 banner / inline text / Modal**：

- **Toast vs inline near-Send text**：submit failure 是"用户动作失败"，toast 比按钮旁的 inline 提示更不打断（不"夹"按钮），符合 [AGENTS.md "calm/professional" 原则](file:///C:/Users/zcati/Documents/project/codeman-agent/src/features/chat/AGENTS.md)
- **Toast vs inline banner**：ChatView 既有 banner 是 V2 早期 async 错误反馈遗留，bar 占据消息列表顶部区域；toast 是"非阻塞通知"，不侵入 scroll 状态
- **Toast vs Modal（Dialog）**：modal 打断正在进行的交互（用户在打字/等 streaming），错误不该用 modal

### D6 — Cancel button 完整语义

仅 ChatView。当 `isRunning()`：

- `<button type="button" class="...destructive..." aria-label="取消运行" onClick={handleCancel}>取消</button>`
- 渲染位置：`</form>` 之后，与 form 兄弟（不嵌套）
- handleCancel 调用 `cancel(convId)` (`chat.store`)，不动 form 状态

Cancel button 的存在条件：`Show when={isRunning()}`（不是 fallback）— 因为 "running 时才出现 cancel" 而不是 "非 running 时才出现 send"，语义更清晰。

> **2026-07-29 V2.8 覆盖**：合并后不存在独立的 Cancel sibling。Send/Stop 在原 Send 位置用 `<Show when={isRunning()} fallback={Send}>` 切换，running 时按钮 `aria-label="停止运行"`、`<Square>` 图标、"停止" 文案、`onClick={handleCancel}`。原 D6 完整语义由 chat-view.tsx V2.8 实现接管。

### D7 — 输入历史 + IME 安全保留

`ArrowUp` / `ArrowDown` 仍写在 `<CodemanTextarea onKeyDown>` 上，**不** 走 form：

```tsx
<form.Field name="draft">
  {(field) => (
    <CodemanTextarea
      value={field().state.value}
      onValueChange={field().handleChange}  // IME-safe 三件套保留
      onKeyDown={(e) => { /* ArrowUp/Down + Ctrl+Enter */ }}
      ...
    />
  )}
</form.Field>
```

- `field().handleChange` 接 IME 完成后的一次性 flush（`onCompositionStart/End/input` 三件套仍在 `CodemanTextarea` 内部）
- ArrowUp/Down 调 `handleArrowUp(input, setInput)` —— 但 input 现在是 form 内部值；需新增 `handleArrowUpField(field, setFormValue)` helper（or 直接读 `form.useStore(s => s.values.draft)`）让 history store 仍能 navigate

**严格不变量**：

- arrow 不重置 cursor 到 `-1`（`recordInputEntry` 才重置）
- arrow 在 `field().state.value !== ""` 时 no-op（status quo 已有）

## Status

proposed

## Considered Options

- **A — Bootstrap with reactive props**：不接 TanStack Form，纯重构现有 signal + Derived memo 组合成更清晰的派生层。**拒**：未解决 silent-drop bug；typing 失焦风险仍潜在；与 ProviderCard 模板分叉，未来 settings 维护成本 x2。
- **B — 自己写 Effect-TS Signal-Validated Form**：用 `Effect.gen` + `Ref` 模拟 form state，自己写 field-level validators。**拒**：与现有 `@tanstack/solid-form` + `effectSchema` 适配分叉；为 2 个 form 多写一套基础设施。
- **C — Banner 替代 toast**：用 `<div role="alert">` 取代错误 toast。**拒**：ChatView banner 删除后空间让给消息流；Home 无 banner 概念需新设计——toast 是统一更小的改动 + shadcn 风格一致。
- **D — Modal 替代 toast**：error 用 `codeman-dialog.alert(...)`。**拒**：错误不该阻断输入。

## Consequences

### 正面

- **统一 form 心智模型**：3 个 form（ProviderCard + Home + ChatView）共享同一套模式，新人 grep `createForm` 即明白所有数据收集入口
- **silent-drop bug 修复**：`createConversation` Exit.isFailure 走 `codemanToast.error`，用户重新获得反馈
- **typing-during-update race 收口**：所有 form 字段 typing 不写 store（仅 ProviderCard 已修）；Home/ChatView 也走同样约束，未来 appStore 在 select 切换时不再为"无关派生"重算
- **错误反馈基础设施复用**：codemanToast 是新增的 internal 命令式 API，未来 settings save 失败 / provider refresh 失败 / workspace rename 失败 / 等更多场景都可以走 `codemanToast.error`，与 `codeman-dialog` 同构
- **schema 落位**：与 (PR 4) "domain schema 归属 feature" 对称；Home/ChatView form schema 跟 ProviderCard 同位置（同 feature 自治）

### 负面 / 风险

- **新增依赖**：toast 文件、`<Toaster />` mount、toast 测试（[ADR-0022 D1](file:///C:/Users/zcati/Documents/project/codeman-agent/docs/adr/0022-internal-components-and-design-tokens.md) 提到 internal 组件"新增首例前开新 ADR"— 本 ADR 即此角色）
- **Sentinel "" 转译点**：每个 form `defaultValues` 都是 `currentValue() ?? ""`，提交时 form-level validator 把 `""` 当 invalid（与 ProviderCard 的 `ModelSchema` 模式一样，仅是 schema 而非 signal）
- **`cancel` button 在 routing 状态切换时的视觉一致性**：Home → ChatView 切换时 cancel 出现，Back to Home → Home 的 send 出现。两种 form 的"主 CTA" 视觉风格是否统一需 designer/QA 过一遍 — 暂用 `Button` variant 一致性达阵
- **`<Toaster />` mount 位置**：`src/index.tsx`（根）vs 各 route 组件局部 mount。若根 mount，全局任何 toast 都从底部出现；若局部，需多个 mount 实例。本 ADR 决定根 mount（沿用 layout-agnostic 模式，与 `Dialog.Root` 同级 — portaling 到 body 即可）
- **Toast auto-dismiss timeout 是首次设计的 UX 选择**：本 ADR 不锁 timeout（4-6 秒为合理默认）；后续根据 UX 测试反馈调

### 兼容性

- **`createSignal` 退出**：home.tsx 与 chat-view.tsx 的局部 `createSignal("")` 删除；`recordInputEntry` 还在被调（在 onSubmit 内）；`input-history.store` 不动
- **`@tanstack/solid-form`** 已是 dependency（ProviderCard 用），无新增第三方
- **`@ark-ui/solid` Toast primitive** 已是 dependency（Dialog 用），无新增第三方
- **toast CSS** 走 Tailwind v4 utility（），与 `dialog.tsx` 对称

### 不在 scope

- **toast queue 策略**：本期 toast 不支持多个同 type stacking（V1 用 "last-in-wins"）；queue/stacking 是 V2+ 候选
- **toast 类型扩展**（info / warning / loading）：本期仅 error + success 两个 variant，足够 form 错误 + 后续 save success；warning/loading 留后续
- **不引入 `sonner` / `solid-sonner`**：用 @ark-ui/solid 自带 Toast primitive，避免新 dependency；与 Dialog 同源
- **不修改 settings 域已有 form**：ProviderCard 模板不变（已用 TanStack Form）
- **chat.store 不加 `lastChatError$` signal**：toast 不需要新 signal（命令式调用 = 无状态）
- **input-history 内部不重构**：history store / signal 保留；仅 `handleArrowUp/Down` helper 需要小调整接 form field（见 D7）
- **Home 路由文件 `home-route.tsx`** 不动：onMount `loadWorkspaces()` 行为保留

## Migration Plan

### 验证策略（每个 PR）

每 PR 必过：

1. `vp run typecheck` exit 0
2. `vp run test` 全绿（基于现有 baseline）
3. `lsp_diagnostics` 改动文件 clean
4. **PR 3（toast）额外**：playwright e2e 触发 codemanToast.error 后断言 toast DOM 出现 + 4-6s 内自动消失

### 进度跟踪

每次开新分支前更新 `.omo/plans/`：

- `.omo/plans/phase-3-form-001.md` — PR 1 (chat/lib/schemas.ts + 共享 schemas)
- `.omo/plans/phase-3-form-002.md` — PR 2 (chat-view.tsx form 重构)
- `.omo/plans/phase-3-form-003.md` — PR 3 (toast infrastructure: ui + internal + __root mount + tests)
- `.omo/plans/phase-3-form-004.md` — PR 4 (home.tsx form 重构)
- `.omo/plans/phase-3-form-005.md` — PR 5 (input-history store 接 form field helper 调整 + e2e 全栈回归)

### Commit 粒度

每 PR 单 commit（参照  atomic rename 模式）：

- PR 1 ~ 1 commit（schema 落地）
- PR 2 ~ 1 commit（chat-view 重构 — form 是单 commit 否则中间态编译失败）
- PR 3 ~ 1 commit（toast 设施独立可回滚）
- PR 4 ~ 1 commit（home 重构）
- PR 5 ~ 1 commit（input-history 适配 + e2e）

## Decision Tree

| # | 决策维度 | 锁定值 |
|---|---|---|
| Q1 | Form library | ProviderCard 模板 (`@tanstack/solid-form`) |
| Q2 | 字段归属 | 全部入 form（仅 ArrowUp/Down / IME 在 textarea-level） |
| Q3 | 字段名 | `draft` / `modelId` / `workspaceId` |
| Q4 | Schema 落位 | `features/chat/lib/schemas.ts` |
| Q5 | Sentinel "" | 接受（field schema = `Schema.Union(Literal(""), String.minLength(1))`，form-level validator 把 `""` 当 invalid） |
| Q6 | Form × running | form-level `disabled` + Cancel 为外部 sibling |
| Q7 | onSubmit 覆盖 | step 1 await + step 2-3 fire-and-forget（含 silent-drop 修复） |
| Q8 | Helper 抽取 | 不抽 — onSubmit 内联 |
| Q9 | 错误反馈 | Toast (新建 `codeman-toast` + `<Toaster />` mount，根布局) |
| Q10 | Toast library | `@ark-ui/solid` Toast primitive（已有 dep）|
| Q11 | Toast API | 命令式 `codemanToast.error/success(string, opts?)` |
| Q12 | Cancel 渲染位置 | form 外部 sibling；`<Show when={isRunning()}>` 包裹 |
| Q13 | input-history | 不重构；helper 调整接 form field |
| Q14 | Schema depth | 同 ProviderCard ModelSchema（lenient no-whitespace）+ `""` 哨兵 union |
