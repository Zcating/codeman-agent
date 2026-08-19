# 0063 — StatusBadge: 4 处徽标统一为 tone-based 通用原语

**Status**: proposed · **Date**: 2026-08-11

`src/renderer/src/shared/components/internal/status-badge.tsx` (新增) + 4 个调用方同步改造（`task-detail-dialog` severity / `cq-task-card` severity + completion / `mcp/settings-tab` StatusPill / `provider-card` dev）。承接 Style Token 与 `internal/` 组件边界，把 4 处各自硬编的「severity / status / completion / dev」徽标统一为 tone-based 通用形态（5 个色调 token）。

## Context

severity / status / completion / dev 四种徽标在 4 个文件里各自手写：

| 文件                                                      | 徽标类型        | 颜色字面量                                                |
| --------------------------------------------------------- | --------------- | --------------------------------------------------------- |
| `plugins/mcp/components/settings-tab.tsx:31-75`           | status (5 kind) | 5 status × 2 套（前景 + 圆点）= 10 个 token               |
| `features/settings/components/provider-card.tsx:247-253`  | dev             | `bg-amber-100 text-amber-700`                             |

`amber-100 / emerald-100 / red-100 / green-100 / yellow-100 / zinc-100` 散落 4 处；换主题色或加色阶时要 4 处同步。StatusPill 内部 5 套颜色（disabled / starting / connected / spawn_failed / protocol_error / crashed）含 6 个 status kind × 2 套（前景 + 圆点）= 12 个色 token，最复杂。

## Decision

### D1 — 接口形态：tone 预制集

```ts
type StatusBadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'destructive';

interface StatusBadgeProps {
  tone: StatusBadgeTone; // 必填, 5 色 token 之一
  label?: string; // 可选, 传空走 '—'
  dot?: boolean; // 可选, true = 圆点 + 文字, 默认 false
  size?: 'sm' | 'md'; // 可选, sm = text-[10px] px-1.5 py-0.5, md = text-xs px-2 py-0.5, 默认 'md'
  class?: string; // 可选, 透传
  'data-testid'?: string; // 可选, 透传
}
```

**D1 拒绝**：

- (a) 走 `label + dotClass + fgClass + bgClass` 4 个 props：caller 需知道所有色 token，6+ 处重复颜色字面量
- (b) 仅接 `tone` = `neutral | info | success | warning | destructive` 5 选 1 + 不接 `dot` / `size`：与「tone 预制集」一致，但变体覆盖不足

### D2 — tone 颜色映射：走 Style Token

5 个 tone 共享 `text-{color}-700 dark:text-{color}-300` 前景 + `bg-{color}-100 dark:bg-{color}-900/40` 背景 + `bg-{color}-500` 圆点，per Style Token：

| tone          | fg                                       | bg                                      | dot              |
| ------------- | ---------------------------------------- | --------------------------------------- | ---------------- |
| `neutral`     | `text-zinc-600 dark:text-zinc-400`       | `bg-zinc-100 dark:bg-zinc-800`          | `bg-zinc-400`    |
| `info`        | `text-blue-700 dark:text-blue-300`       | `bg-blue-100 dark:bg-blue-900/40`       | `bg-blue-500`    |
| `success`     | `text-emerald-700 dark:text-emerald-300` | `bg-emerald-100 dark:bg-emerald-900/40` | `bg-emerald-500` |
| `warning`     | `text-amber-700 dark:text-amber-300`     | `bg-amber-100 dark:bg-amber-900/40`     | `bg-amber-500`   |
| `destructive` | `text-destructive`                       | `bg-destructive/10`                     | `bg-destructive` |

**D2 拒绝**：

- (a) 写 raw `zinc-100` / `amber-100` 字面量：违反 Style Token
- (b) `variant` + `color` 双轴拆：API 面膨胀，caller 需记 2 套轴

### D3 — dot 开关：2 变体

`dot?: boolean`，true = 圆点 + 文字，false = 仅文字，默认 false。

- `cq-task-card` completion → `dot=true, size='sm'`
- `mcp/settings-tab` StatusPill → `dot=true, size='md'`
- 其他 3 处 → `dot=false`

**D3 拒绝**：

- (a) shell 总是装圆点：provider-card (dev) / task-detail-dialog (severity 文字仅) 需多装一个点
- (b) shell 不装圆点，圆点 caller 自装：'圆点 + 文字' 重复外观要 caller 装 4 次

### D4 — size 开关：2 变体

`size?: 'sm' | 'md'`，默认 `'md'`。

- `sm` = `text-[10px] px-1.5 py-0.5`（`cq-task-card` completion）
- `md` = `text-xs px-2 py-0.5`（其他 3 处）

**D4 拒绝**：

- (a) shell 不接 size，全部 `text-xs`：cq-task-card completion 现状 `text-[10px]`，统一后字号偏大
- (b) 接 `sm` / `md` / `lg` 3 变体：'lg' 现状无调用方，1 个 prop 多 1 个变体

### D5 — label 兜底：空走 '—'

未传 `label` 或传空串时显示 `'—'`，与 `cq-task-card` 现状对齐（`display = stateStr === '' ? '—' : stateStr`）。

### D6 — a11y 与标记：透明

shell 装 `data-testid`（透传）+ `aria-label` 自动从 `label` 派生（屏幕阅读器读出 tone + label）。**不接**「kind 文本前缀」（如 `aria-label="success: Connected"`），避免重复 caller 表达。

### D7 — 适用范围：4 调用方

V1 适用范围 = `task-detail-dialog` severity + `cq-task-card` severity + `cq-task-card` completion + `mcp/settings-tab` StatusPill + `provider-card` dev = 5 调用点（实际 4 个文件，cq-task-card 2 处）。

**命名中立**：`StatusBadge`（非 `SeverityBadge` / `StatusPill`）—— 跨 plugin 通用，命名上保持中立。

## Considered Options

- **A — 接领域 tone**（`tone: 'severity' | 'status' | 'completion' | 'dev'`）：领域语义泄漏到 `shared/`，违反 D3「internal/ 零业务逻辑」。选 D1 tone 预制集拒绝。
- **B — 走 `variant` + `color` 双轴**：API 面膨胀，caller 需记 2 套轴。选 D2 单一 tone 拒绝。
- **C — 仅作为 plugin 私有 badge，不入 shared**：跨 plugin 不复用（mcp / provider 仍有 2 处徽标），不解决根问题。选 D7 落 `shared/` 拒绝。
- **D — 接 `icon` 插槽**：现状无 icon 需求；未来需要可加 slot。选 D1 / D6 拒绝。
- **E — `dot` 总是 true**：provider-card (dev) / task-detail-dialog (severity 文字仅) 需多装一个点。选 D3 dot 开关拒绝。

## Consequences

### 正面

- **leverage**：1 原语接 5 调用点（4 文件）；约 80 行徽标样式代码（4 处硬编）吸收到 1 份 shell
- **locality**：颜色 token 在 shell 内部有唯一具体载体，未来换主题色 / 加色阶只改 1 处
- **depth**：interface = 6 个 props + 5 tone 字面量；implementation 持有 5 tone × 3 token 表
- **承接 ADR-0006**：颜色走 Style Token，不写 raw zinc/amber/blue
- **承接 ADR-0022**：`internal/` 组件边界，StatusBadge 落在 `shared/components/internal/`
- **承接 ADR-0008**：feature-sliced 跨域 import 方向强制，`internal/` 组件供 `features/*` + `plugins/*` 任意域消费
- **与 C1/C2 同 pattern**：FormDialogShell  + PageLayoutShell  + StatusBadge  三份 shell 范式

### 负面 / 风险

- **caller 需做 tone 映射**（如 `severity === 'S1' ? 'destructive' : ...`）：4 处 caller 各自 1 段 `if/else`，比硬编颜色略长
- **`info` tone 现状无调用方**（仅 `neutral` / `warning` / `destructive` / `success`）：4 个 token 用上，1 个预留；未来 V2.7+ 加「info 状态」无需改 shell
- **`'md'` 默认 + `'sm'` 备**：跨调用方默认不一致（cq-task-card completion 显式传 `sm`），reviewer 需检查 size 显式传参

### 兼容性

- 4 个调用方的**对外视觉不变**（颜色 token + 字号 + 圆点）
- 现有 4 份 caller 单测**保留**但改写：仅测「tone + label 传参」，不重测颜色 token
- `mcp/settings-tab` StatusPill 内的 `STATUS_LABEL` map 保留（domain 文本映射）

## Status

proposed

## Decision Tree

| #   | 决策维度      | 锁定值                                                                                                         |
| --- | ------------- | -------------------------------------------------------------------------------------------------------------- |
| Q1  | 接口形态      | tone 预制集（5 tone）+ dot + size                                                                              |
| Q2  | tone 颜色映射 | Style Token 5 token（neutral/info/success/warning/destructive），fg + bg + dot 3 套                            |
| Q3  | dot           | true / false 2 变体，默认 false                                                                                |
| Q4  | size          | sm (text-[10px] px-1.5 py-0.5) / md (text-xs px-2 py-0.5) 2 变体，默认 md                                      |
| Q5  | label         | 未传或空串走 '—'                                                                                               |
| Q6  | a11y          | 透传 data-testid + 自动 aria-label（tone + label）                                                             |
| Q7  | 适用范围      | 5 调用点（4 文件）：task-detail-dialog / cq-task-card (severity+completion) / mcp/settings-tab / provider-card |
| Q8  | 命名          | StatusBadge（非 SeverityBadge / StatusPill）                                                                   |
| Q9  | 迁移          | 1 PR 同时抽 + 迁 4 文件 + 1 份 shell 契约单测 + 4 份 caller 单测改写                                           |

## References

-  — Style Token 5 token（neutral/info/success/warning/destructive）
-  — `internal/` 组件边界，StatusBadge 落在 `shared/components/internal/`
-  — Feature-Sliced 跨域 import 方向强制
-  — FormDialogShell 同 pattern 范式
-  — PageLayoutShell 同 pattern 范式
- CONTEXT.md「Status Badge」词条 — V2.6+ 新增
