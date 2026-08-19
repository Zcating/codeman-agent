# 0062 — PageLayoutShell: 8 个页面级 layout 收敛为三段壳

**Status**: proposed · **Date**: 2026-08-11

`src/renderer/src/shared/components/internal/page-layout-shell.tsx` (新增) + 8 个调用方同步改造（settings 4 section + 1 mcp-section + 3 plugin settings-tab）。承接 ADR-0039「主栏内恰好一个活动滚动区」契约，把 5 个 settings section + 3 个 plugin settings-tab 共 8 个调用方各自手写的「`ScrollArea + h2 + 描述 + footer`」骨架收敛到一个三段壳。

## Context

V2.5+ 引入 后，5 个 settings section（`llm-section` / `app-section` / `window-section` / `advanced-section` / `mcp-section`）与 3 个 plugin settings-tab（`plugins/mcp/components/settings-tab` / `plugins/multi-agents/components/settings-tab` / `plugins/automations/components/settings-tab`）各自硬编：

```tsx
<ScrollArea
  class='flex-1 min-h-0'
  data-scroll-region='true'
  viewportClass='space-y-4 py-4 pl-4 pr-6'
>
  <h2 class='text-lg font-semibold text-zinc-900 dark:text-zinc-100'>...</h2>
  <p class='text-xs text-muted-foreground mt-0.5'>...</p>
  ...
</ScrollArea>
```

共 8 处手写「`ScrollArea class="flex-1 min-h-0" data-scroll-region viewportClass="space-y-4 py-4 pl-4 pr-6"` + `<h2 class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">` + 描述段落」骨架。ADR-0039 把 ScrollArea 固化为契约，但「页面级 ScrollArea 该带哪些默认 padding / 标题字号 / 描述字号」没有名字，谁改谁漂。

## Decision

### D1 — 接口形态：layout 壳 + 3 slot

```ts
interface PageLayoutShellProps {
  title: string; // 必填, h2 样式 shell 收
  description?: string; // 可选, text-xs text-muted-foreground mt-0.5
  body: JSX.Element; // 页面内容, 必填
  footer?: JSX.Element; // 可选, pinned 底部 + Separator + bg-background
  'data-testid'?: string; // 透传到 ScrollArea Viewport
}
```

**三段 layout**：header（title + description）→ ScrollArea（body）→ footer（pinned bottom + Separator）。8 个调用方全部使用同一形状。

**D1 拒绝**：

- (a) 拆为「layout + header (无 footer)」：footer 重复（llm-section 的「Add provider」按钮 + automations 的「New Rule」按钮各自手装）
- (b) 表驱动 `sections: Array<{ title, description?, render }>`：与 C1 表驱动混用，8 个调用方都是 page-level 单一 layout，没有子节划分需求，强行表驱动反而过设计

### D2 — header：title + description 两字段

shell 接 `title: string`（必填）+ `description?: string`（可选）。样式壳收：

- title：`h2 class="text-lg font-semibold text-zinc-900 dark:text-zinc-100"`
- description：`<p class="text-xs text-muted-foreground mt-0.5">`

**D2 拒绝**：

- (a) header 是 `JSX.Element` 插槽：8 个调用方 title/description 样式完全相同（`text-lg font-semibold` + `text-xs text-muted-foreground`），caller 重复硬编
- (b) 接 `headerExtras?: JSX.Element`：3 个 plugin tab 的「Refresh」/「New Rule」按钮已经在 footer/header 之外的特定位置（mcp 顶部「Refresh」按钮），不通过 shell header 表达

### D3 — body：JSX.Element 插槽

shell 接 `body: JSX.Element` 必填；body 内部 caller 装：

- 列表 + 空态（mcp / automations 的「No MCP servers configured.」+ dashed border）
- sub-section 划分（mcp 的「Available Tools」、multi-agents 的「Multi-agent list」）
- in-flow confirm（advanced-section 的「Delete all conversations?」Show fallback）

**D3 拒绝**：

- (a) `body: () => JSX.Element`（render prop）：API 略重，8 个 caller 不需 lazy
- (b) 接 `errorFallback?` / `empty?` / `sub-sections`：与 C1「shell 不知道业务」同原则，empty/confirm/alert 业务状态由 caller 自管

### D4 — footer：壳接区域 + caller 装按钮

shell 接 `footer?: JSX.Element` 可选；footer 区域样式壳收：

```tsx
<Separator />
<div class="flex justify-end px-4 py-3 bg-background">
  {footer}
</div>
```

按钮 caller 装（如 llm-section 的「Add provider」、automations 的「New Rule」）；shell 不接 `actions: ButtonConfig`。

**D4 拒绝**：

- (a) footer 完全 caller 自管（不接背景/分隔线）：8 个调用方 footer 样式完全相同（Separator + flex justify-end + bg-background），caller 重复硬编
- (b) `actions: ButtonConfig | ButtonConfig[]` 配置：失去 JSX 灵活性（caller 装复合按钮组时不自由）

### D5 — a11y 与滚动标记：shell 装

shell 装：

- `data-scroll-region="true"`（透传到 ScrollArea Viewport）——承接 契约标记
- `data-testid={props["data-testid"]}`（透传到 ScrollArea Viewport）——e2e selector 唯一性
- `aria-labelledby={headerTitleId}` 指向 header title —— 屏幕阅读器语义

**不接**：「single 活动滚动区」运行时检测（交给 e2e + `shared/lib/scroll-region.ts`，per D4）。

**D5 拒绝**：

- (a) shell 不装 `data-scroll-region`：ADR-0039 契约标记散落 8 处，谁改谁漂
- (b) shell 在 DEV mode 输出 console.warn 守护：与「shell = 纯 layout」违反，活动区检测是 e2e 职责

### D6 — 适用范围：现状 8 调用方

V1 适用范围 = settings 4 section + mcp-section（features/settings/） + 3 plugin settings-tab = 8 个调用方。

**不接**：chat view message 区域（已有 ScrollArea 单独形态，per 修订记录）/ home。

**命名留余地**：模块名 `PageLayoutShell`（不叫 `SettingsPageShell`）—— V1 仅服务 settings 域 8 调用方，但命名上保留对未来 plugin page 复用的可能。V2.7+ 评估 chat-view message 区域是否走 shell。

### D7 — 迁移路径：一锅端 1 PR

**1 PR**：

- 新增 `shared/components/internal/page-layout-shell.tsx` + `page-layout-shell.test.tsx`（契约单测）
- 同步改造 8 个调用方，把 8 份重复的「ScrollArea + h2 + 描述 + footer」替换为 shell 调用
- 8 份 caller 单测改写：仅测「title 文本 / footer 按钮 / body 子组件能渲染」，不重测 layout / scroll

**D7 拒绝**：

- (a) 分批 2 轮（先 settings 后 plugin）：shell API 不准时 8 处一起坏，调试成本低
- (b) 仅迁 settings 4 section，plugin tab 后补：分 2 轮，review 分散

## Considered Options

- **A — 表驱动 `sections: Array<{ title, description?, render }>`**：与 C1 FormDialogShell 表驱动混用，但 page-level 不需要子节划分，强行表驱动反而过设计。选 D1 三段 layout 拒绝。
- **B — render prop body (`body: () => JSX.Element`)**：API 略重，8 个 caller 不需 lazy。选 D3 JSX.Element 拒绝。
- **C — 接 `onBack` / `headerActions` 等业务插槽**：shell = 纯 layout，业务能力由 caller 自管；路由层负责「← 返回」逻辑，不在 shell 内部。选 D5 / D6 拒绝。
- **D — 接 `empty?` / `sub-sections?` / `in-flow confirm?` 业务能力**：与 C1「shell 不知道业务」同原则，empty/confirm/alert 业务状态由 caller 自管。选 D3 拒绝。
- **E — DEV mode console.warn 守护 single 活动滚动区**：与「shell = 纯 layout」违反，活动区检测是 e2e 职责。选 D5 拒绝。

## Consequences

### 正面

- **leverage**：1 壳接 8 调（settings 4 + mcp-section + 3 plugin settings-tab）
- **locality**：ADR-0039 滚动契约在 shell 内部有唯一具体载体（`data-scroll-region` + `viewportClass="space-y-4 py-4 pl-4 pr-6"`），未来滚动策略变更只改 1 处
- **depth**：interface = 5 个 props；implementation 吸收 8 份重复（约 50 行 × 8 = 400 行样板）
- **leverage 命名空间**：与 FormDialogShell  同 pattern（`internal/` 命名 + 纯 props + 单一职责），形成「shell 系列」
- **承接 ADR-0022**：`internal/` 组件边界，PageLayoutShell 落在 `shared/components/internal/`
- **承接 ADR-0008**：feature-sliced 跨域 import 方向强制，`internal/` 组件供 `features/*` 任意域消费

### 负面 / 风险

- **未来 plugin page 复用 page-layout 时**，若 layout 形态分歧（chat-view 已有 ScrollArea 单独形态），可能需新增 D8「chat-view message 区接入」评估
- **shell 不接 `errorBoundary`**：8 个 caller 出现 throw 时错误可能 bubble 到 router，caller 需自管 try/catch 或 error boundary
- **D5 标记透传到 Viewport**：e2e selector 现有 `data-testid` 不动（per 修订记录），但新增 selector 需注意落在 Viewport 而非 Root

### 兼容性

- 8 个调用方的**对外行为不变**（title 文本 / body 内容 / footer 按钮 / ScrollArea 滚动）
- 滚动契约标记（`data-scroll-region`）位置不变（仍在 Viewport）
- 8 份 caller 单测**保留**但改写：仅测「body/footer 渲染」，不重测 ScrollArea 框架

## Status

proposed

## Decision Tree

| #   | 决策维度 | 锁定值                                                                                  |
| --- | -------- | --------------------------------------------------------------------------------------- |
| Q1  | 接口形态 | layout 壳 + 3 slot（title / description / body / footer）                               |
| Q2  | header   | title 必填 + description 可选，样式壳收                                                 |
| Q3  | body     | JSX.Element 必填，empty/sub-section/confirm caller 自管                                 |
| Q4  | footer   | JSX.Element 可选，Separator + flex justify-end + bg-background 壳收                     |
| Q5  | a11y     | shell 装 data-scroll-region + data-testid + aria-labelledby；活动区检测交给 e2e         |
| Q6  | 适用范围 | 8 调用方（settings 4 + mcp-section + 3 plugin settings-tab），chat/home 不接 |
| Q7  | 命名     | PageLayoutShell（非 SettingsPageShell），留 V2.7+ 拓展余地                              |
| Q8  | 迁移     | 1 PR 同时抽 shell + 迁 8 调用方 + 1 份 shell 契约单测 + 8 份 caller 单测改写            |

## References

-  — 主栏恰好一个活动滚动区契约，PageLayoutShell 承接为唯一具体载体
-  — `internal/` 组件边界，PageLayoutShell 落在 `shared/components/internal/`
-  — Feature-Sliced 跨域 import 方向强制
-  — FormDialogShell 同 pattern 范式（shell 系列）
- CONTEXT.md「Page Layout Shell」词条 — V2.6+ 新增
