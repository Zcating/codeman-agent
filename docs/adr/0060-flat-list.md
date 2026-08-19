# 0064 — FlatList: flat 列表壳，与 CodemanSidebar tree 列表 seam 区分

**Status**: proposed · **Date**: 2026-08-11

`src/renderer/src/shared/components/internal/flat-list.tsx` (新增) + 3 个 plugin settings-tab 同步改造（`mcp/settings-tab` ServerRow / `multi-agents/settings-tab` MultiAgentRow / `plugins/skills/components/settings-tab` skill rows）。承接 D2「renderItem 接管节点 DOM 结构」seam，但只服务 flat 列表（无 children 嵌套），与 `CodemanSidebar` 的 tree 列表 seam 区分。

## Context

3 个 plugin settings-tab 各自手写 list 形态：

| 文件                                               | 现状                                                                                                     | 共同 seam                           |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `plugins/mcp/components/settings-tab.tsx`          | `<ul class="space-y-2"><For each={mcpServers$()}>{(server) => <ServerRow server={server} />}</For></ul>` | `space-y-2` + `<For>` + 容器 `<li>` |
| `plugins/multi-agents/components/settings-tab.tsx` | `<For each={agents()}>`（无 ul/div 包装，每项用 `<Card>`）                                               | `<For>` + 容器 `<Card>`             |
| `plugins/skills/components/settings-tab.tsx`       | 类似 `<For>` 循环                                                                                        | `<For>` + 容器（待确认）            |

3 处共同负担：`<For>` 循环 + `<EmptyComponent>` fallback + `<LoadingComponent>` 替代（如果 `isLoading`）。list 抽象的「for / empty / loading / separator」3 个状态切换在 3 处重复。

## Decision

### D1 — 接口形态：options + renderItem 范式

```ts
type FlatListValue = string;

interface FlatListItem<V extends FlatListValue = FlatListValue> {
  value: V;
  // 不接 name / description / icon, 全在 renderItem 表达
}

interface FlatListProps<V extends FlatListValue = FlatListValue> {
  options: FlatListItem<V>[]; // flat 列表, 无 children
  renderItem: (item: FlatListItem<V>, index: number) => JSX.Element; // caller 接管节点 DOM
  ListSeparatorComponent?: JSX.Element; // item 之间装 <Separator /> (可选)
  EmptyComponent?: JSX.Element; // options.length === 0 时装
  isLoading?: boolean; // true → 装 LoadingComponent 替代
  LoadingComponent?: JSX.Element; // isLoading=true 替代 renderItem For
  class?: string;
  'data-testid'?: string;
}
```

**与 `CodemanSidebar` D2 同 seam**：renderItem 接管节点 DOM 结构，shell 仅负责 list 状态机（for / empty / loading）+ ListSeparatorComponent 槽。

**D1 拒绝**：

- (a) 接 4 slot（icon / name / description / actions）：与「renderItem 完全控制」相反，caller 失去自由度；layout 限制 hard-coded
- (b) 仅接 `children: JSX.Element`：与「options + renderItem」范式不同，'FlatList 仅是 layout 壳' 与 Card 原生区别不大
- (c) 接 `container?: 'card' | 'li'`：与「renderItem 自装容器」重叠，caller 在 renderItem 里装 `<Card>` / `<li>` / `<div>` 更自然

### D2 — renderItem seam：caller 完全控制节点 DOM

`renderItem: (item, index) => JSX.Element`，caller 在 renderItem 里装：

- 容器：`<Card>`（MultiAgentRow）/ `<li>`（ServerRow）/ `<div>`（skills）
- 节点内容：icon / name / description / actions
- 事件：`onClick` / hover bg / 等
- 状态：active / disabled / 等

shell **不**装任何 layout 副作用。`For` 仅负责遍历。

### D3 — ListSeparatorComponent：item 之间分隔

`ListSeparatorComponent?: JSX.Element`，shell 内部在 `For` 中每 2 个 item 之间装。caller 可传：

- `<Separator />` shadcn 原语
- `<div class="h-px bg-border" />` 自定义分隔线
- 不传 → 无分隔（默认）

### D4 — EmptyComponent + isLoading + LoadingComponent：3 状态机

状态机：

1. `isLoading === true` → 装 `LoadingComponent`（替代 renderItem For）
2. `options.length === 0` → 装 `EmptyComponent`
3. 否则 → `For` over `options` 调 `renderItem(item, index)`

`isLoading` 与 `options.length === 0` 优先级：isLoading 优先（即使 options 为空）。`EmptyComponent` 与 `LoadingComponent` 都是 JSX.Element，caller 装（dashed border + p-6 + text-center 等样式 caller 自管）。

### D5 — 不装：onItemClick / currentValue / isActive / spacing / hover

**shell 不接**：

- `onItemClick?: (value) => void` —— caller 在 renderItem 里装 onClick
- `currentValue?: string` / `isActive?` —— active 高亮由 caller 在 renderItem 里装
- `space-y-2` / spacing —— shell 不装，caller 在外层用 `<div class="space-y-2">` 或在容器里装
- hover bg / `cursor-pointer` —— caller 在 renderItem 里装

**与 `CodemanSidebar` D2/D4 区分**：`CodemanSidebar` 接 `currentValue` / `onItemSelect`（因为 sidebar 是「高亮 + navigate」语义）；`FlatList` 不接（list 抽象更窄）。

### D6 — 不装容器：caller 选 Card / li / div

`FlatList` **不**接 `container` prop，caller 在 renderItem 里装 `<Card>` / `<li>` / `<div>`。这样：

- MultiAgentRow 仍可用 `<Card>`（shadcn 原子）
- ServerRow 仍可用 `<li>`（原生 ul/li 语义）
- skills rows 可用 `<div>` 或 `<li>`

### D7 — flat vs tree：与 CodemanSidebar 区分

`FlatList` = **1 层 flat 列表**（无 children 嵌套）。`CodemanSidebar` = **tree 列表**（`option.children?: FlatListItem[]` 嵌套）。

两者 seam 同源（renderItem 接管），但 flat vs tree 区分：

- `FlatList` 接 `options: FlatListItem[]`（无 `children` 字段）
- `CodemanSidebar` 接 `options: SidebarOption[]`（含 `children?: SidebarItemConfig[]`）

未来若 caller 需 tree + flat 混合，仍用 `CodemanSidebar`；纯 flat 用 `FlatList`。

### D8 — 迁移路径：一锅端 1 PR

**1 PR**：

- 新增 `shared/components/internal/flat-list.tsx` + `flat-list.test.tsx`（契约单测：options 装载 / EmptyComponent / LoadingComponent / ListSeparatorComponent 行为）
- 同步迁 3 个 plugin settings-tab（mcp / multi-agents / skills）
- 3 份 caller 单测改写：仅测「renderItem 收到正确 item」，不重测 list 框架

**D8 拒绝**：

- (a) 分 2 PR（先抽后迁）：'shell 错'不会 3 处一起坏，但 review 分散
- (b) 仅迁 mcp / multi-agents，skills 后补：'分 2 轮 验证 flat seam 一致'，'skills 是第 3 个调用方'

## Considered Options

- **A — 命名 `EntityRow` / `EntityList`**：「row / entity」 像是「单 row」，与「list 抽象」不匹配；「flat-list」更准确表达「flat 列表 + renderItem 接管」。选 D1 命名 `FlatList` 拒绝。
- **B — 接 `children: FlatListItem[]` 嵌套**：与 `CodemanSidebar` tree 列表 seam 重叠，保持 flat 边界。选 D7 flat vs tree 区分拒绝。
- **C — 仅接 `children: JSX.Element` 作为 'ul 内部'**：与「options + renderItem」范式不同，'FlatList 仅是 layout 壳' 与 Card 原生区别不大。选 D1 拒绝。
- **D — 接 `onItemClick` + `currentValue` + `isActive`**：与 `CodemanSidebar` 重叠（sidebar 已有这些），list 抽象更窄。选 D5 不接拒绝。
- **E — 接 `container?: 'card' | 'li'`**：与「renderItem 自装容器」重叠，caller 在 renderItem 里装更自然。选 D6 不接容器拒绝。

## Consequences

### 正面

- **leverage**：1 原语接 3 调用方（mcp / multi-agents / skills），约 30 行 list 框架代码（3 处 `<For>` + empty/loading 状态切换）吸收到 1 份 shell
- **locality**：list 抽象（for / empty / loading / separator）4 状态切换在 shell 内部有唯一具体载体
- **depth**：interface = 8 个 props（options + renderItem + 3 状态 prop + 3 透传）；implementation 持有 3 状态机（约 20 行）
- **与 `CodemanSidebar` seam 同源**：renderItem 接管节点 DOM 结构，未来扩展 list 抽象时复用同一 seam
- **承接 ADR-0022**：`internal/` 组件边界，FlatList 落在 `shared/components/internal/`
- **承接 ADR-0008**：feature-sliced 跨域 import 方向强制，`internal/` 组件供 `plugins/*` 任意域消费
- **与 C1/C2/C3 同 pattern**：FormDialogShell  + PageLayoutShell  + StatusBadge  + FlatList  四份 shell 范式

### 负面 / 风险

- **3 调用方现状 `space-y-2` 隐式约定**：FlatList 不装 spacing，caller 需在外层装 `<div class="space-y-2">` 或在容器里装；reviewer 需检查 spacing 显式传参
- **`EmptyComponent` 与 `LoadingComponent` 样式 caller 装**：3 调用方现状 `dashed border + p-6 + text-center` 一致，但 caller 仍需各自手装；如未来样式漂移，需新增「EmptyState 原语」统一
- **3 调用方对 list 形态理解略不同**：MultiAgentRow 用 `<Card>`，ServerRow 用 `<li>`，skills 用 `<div>` 或 `<li>`；FlatList 接受所有形态，但 reviewer 需检查每个 caller 的容器选择一致

### 兼容性

- 3 个 plugin settings-tab 的**对外视觉不变**（list 形态 / 容器 / spacing / empty / loading）
- 现有 3 份 caller 单测**保留**但改写：仅测「renderItem 收到正确 item」，不重测 list 框架
- skills settings-tab 现状若用其他 list 形态，需单独评估

## Status

proposed

## Decision Tree

| #   | 决策维度               | 锁定值                                                                                |
| --- | ---------------------- | ------------------------------------------------------------------------------------- |
| Q1  | 接口形态               | options + renderItem 范式（与 CodemanSidebar D2 同 seam）                             |
| Q2  | renderItem seam        | caller 完全控制节点 DOM，shell 不装 layout 副作用                                     |
| Q3  | ListSeparatorComponent | 可选 JSX.Element，caller 装 `<Separator />` 等                                        |
| Q4  | 状态机                 | isLoading=true → LoadingComponent；options=[] → EmptyComponent；否则 For over options |
| Q5  | 不接                   | onItemClick / currentValue / isActive / spacing / hover bg（caller 自管）             |
| Q6  | 容器                   | caller 在 renderItem 里装（`<Card>` / `<li>` / `<div>`），shell 不接 container prop   |
| Q7  | flat vs tree           | flat 1 层（无 children 嵌套），与 CodemanSidebar tree 列表区分                        |
| Q8  | 命名                   | FlatList（非 EntityRow / EntityList）                                                 |
| Q9  | 迁移                   | 1 PR 同时抽 + 迁 3 plugin settings-tab + 1 份 shell 契约单测 + 3 份 caller 单测改写   |

## References

-  — CodemanSidebar D2「renderItem 接管节点 DOM 结构」seam 起源
-  — `internal/` 组件边界，FlatList 落在 `shared/components/internal/`
-  — Feature-Sliced 跨域 import 方向强制
-  — FormDialogShell 同 pattern 范式
-  — PageLayoutShell 同 pattern 范式
-  — StatusBadge 同 pattern 范式
- CONTEXT.md「Flat List」词条 — V2.6+ 新增
