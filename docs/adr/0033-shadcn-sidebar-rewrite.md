# 0033 — Shadcn Sidebar Rewrite: Layer 1 + Layer 2 Full Replacement

**Status**: accepted · **Date**: 2026-07-25
**Scope**: PR 1 (`src/shared/components/ui/sidebar.tsx` + `accordion.tsx` + `tooltip.tsx` + `index.css` tokens) + PR 2 (`src/shared/components/internal/codeman-sidebar.tsx` + `chat-sidebar.tsx` + `settings-sidebar.tsx`) + PR 3 (ADR + e2e selectors migration)
**Reference**: `.omo/plans/sidebar-reshim.md` (30-round grill record, plan-driven authorization)

## Context

用户请求"仿照 `.repos/shadcn/sidebar.tsx`，重新实现项目中的 sidebar"。

项目当前 sidebar 实现是 ADR-0030 刚锁定（6 天前）的双层架构：
- **Layer 1**：`src/shared/components/ui/sidebar.tsx` — 223 LOC，12 个原始 atoms
- **Layer 2**：`src/shared/components/internal/codeman-sidebar.tsx` — 317 LOC，通用 renderItem 驱动

存在三个核心张力：

1. **Layer 1 能力不足**：当前 sidebar atoms 只有 12 个，远低于 shadcn sidebar 的 20+ 原子（SidebarGroupAction / SidebarMenuBadge / SidebarMenuSkeleton / SidebarMenuSub / SidebarMenuSubItem / SidebarMenuSubButton / SidebarInput / SidebarSeparator / SidebarRail / SidebarTrigger 等全部缺失）。Layer 2 被迫自己组合细节，导致 Layer 2 膨胀。

2. **依赖升级**：shadcn sidebar 依赖 `@base-ui/react` 或 `@radix-ui/*`；项目已有 `@ark-ui/solid`，需要确认依赖策略。

3. **类型系统不统一**：ADR-0030 的 `SidebarItemConfig` + `SidebarOption extends` 只有 2 层嵌套，但 chat 域实际有 3 层（project group > workspace > conversation），需要确认类型树是否匹配。

经过 30 轮 grill 决策（详见 `.omo/plans/sidebar-reshim.md`），结论是全量重写两层，不引入新依赖，e2e selector 统一到 `data-value`。

## Decision

### D1 — 两层都重写（Layer 1 补齐 + Layer 2 重构）

Layer 1（`ui/sidebar.tsx`）在原有 12 atoms 基础上补齐 shadcn 完整 20+ atoms。Layer 2（`internal/codeman-sidebar.tsx`）完全重构以消费 Layer 1 atoms。两个文件同步升级，中间态不破坏现有 contract。

**拒绝**：
- A — 只重写 Layer 1，Layer 2 保持现状 — Layer 2 已经需要大量改动来适配 Layer 1 API 变化，半改不如全改
- B — 两层都推翻重来，包括 props 接口 — ADR-0030 high-level contract（renderItem + 3 slots + ZERO business logic）已锁定，不推翻

### D2 — 不引入新依赖

`@base-ui/react` 与 `@radix-ui/*` 全部由 `@ark-ui/solid` 适配。项目已有 `@ark-ui/solid`，不需要新增任何 npm 包。

**拒绝**：
- A — 引入 `@base-ui/react` — 需要新增依赖，增加 bundle size
- B — 引入 `@radix-ui/*` — 与现有 `@ark-ui/solid` 重复

### D3 — SidebarProvider 在 Layer 1

运行时职责（state + 受控/非受控 + toggle）全部放在 Layer 1 `SidebarProvider`。Layer 2 和 consumer 不需要自己管理 sidebar 展开态。

受控/非受控都提供：`defaultOpen? + open? + onOpenChange?` 三件套。

### D4 — 全量 variants + collapsible

Layer 1 暴露所有 shadcn variants（`sidebar | floating | inset`）+ collapsible（`offcanvas | icon | none`）。Layer 1 暴露能力，CodemanSidebar 不使用（chat 域永远展开，不需要折叠）。

**拒绝**：
- A — CodemanSidebar 自己实现 collapsible — 重复造轮子，应该用 Layer 1 能力

### D5 — 保留 ADR-0030 high-level contract

`renderItem` + 3 slots（header / footer / children）+ ZERO business logic 这四个 ADR-0030 核心决策全部保留。实现层用 shadcn atoms 重写，但 API 契约不变。

**拒绝**：
- A — 趁重写机会改 props 接口 — 破坏 ADR-0030 contract，consumer 全部要重写

### D6 — 不实现 mobile Sheet / cookie 持久化 / 键盘快捷键

desktop-only + in-memory signal 状态。mobile Sheet、cookie 持久化、键盘快捷键全部不在本期实现。

**拒绝**：
- A — 实现 mobile Sheet — 用户明确不需要 desktop 之外的响应式 sidebar
- B — 实现 cookie 持久化 — sidebar 状态不需要刷新持久化
- C — 实现键盘快捷键 — 用户明确不需要

### D7 — 新 3 层类型

```
SidebarGroupOption    — project 组（Accordion 控制）
  SidebarOption       — workspace（SidebarMenuItem，永远可见）
    SidebarSubOption  — conversation（SidebarMenuSubItem + SidebarMenuSubButton）
```

项目 group 走 Layer 1 Accordion。workspace 永远是 SidebarMenuItem 可见。conv 永远在 SidebarMenuSub 内。

**拒绝**：
- A — workspace 也用 Accordion 控制展开 — 与 shadcn tree 语义不符，workspace 应该永远可见

### D8 — e2e selectors 迁移到 `[data-value="..."]`

e2e 测试选择器从 `[data-workspace-id]` / `[data-conv-id]` 统一迁移到 `[data-value="..."]`（与 shadcn 命名一致）。

Layer 1 SidebarGroup / SidebarMenuItem / SidebarMenuSubItem 全部暴露 `data-value` attribute。

**e2e helpers.ts 改动**：
- `expandWorkspace(p, workspaceId)`：改用 `[data-value="workspaceId"]` + `[data-state="open"]` + `[data-value="workspaceId"] button`
- `clickConv(p, convId)`：改用 `[data-value="convId"]`
- `nthConv(p, n, scope?)`：改用 `[data-value="..."]`

**chat-sidebar.tsx 改动**：移除 PR 2 fix commit 保留的过渡属性 `data-workspace-id={item.value}` 和 `data-conv-id={sub.value}`，统一使用 codeman-sidebar.tsx 已实现的 `data-value` 机制。

## Status

accepted

## Considered Options

- **A — 维持双层不动，只修 Layer 1 atoms** — 拒绝：Layer 2 依赖 Layer 1 API，API 变了 Layer 2 必须改；只改一半等于技术债
- **B — 引入 `@base-ui/react` 替代方案** — 拒绝：引入新依赖
- **C — 不迁移 e2e selectors** — 拒绝：e2e 测试必须跟 DOM 属性一致，否则 selector 失效
- **D — 推翻 ADR-0030 contract** — 拒绝：30 轮 grill 结论是保留 contract，只换实现

## Consequences

### 正面

- Layer 1 完整 shadcn atoms 可独立使用（不绑定 chat 域）
- Layer 2 完全受 Layer 1 控制，代码量减少
- e2e selectors 统一，迁移到 `data-value` 与 shadcn 生态对齐
- ADR-0030 contract 不变，consumer 无需重写

### 负面 / 风险

- 重写有破坏风险 — 必须 `vp run typecheck` + `vp run test` 全绿才能合并
- Layer 1 文件从 223 LOC 膨胀到 ~700 LOC — 需要充分 code review
- e2e selectors 改了之后，本地 e2e 可能失败（如果 selector 写错）— 用户会在合并前跑 e2e 验证

### 兼容性

- **Layer 2 props 不变**（除 Q26 新增 `onSubItemSelect`）— ADR-0030 contract 保留
- **`renderItem` 签名不变**：`SidebarOption` 类型变了，但 consumer 侧代码基本不动
- **无新增依赖** — 全部复用 `@ark-ui/solid`

### 不在 scope

- drag-and-drop reorder
- multi-select sidebar
- mobile Sheet
- cookie 持久化
- 键盘快捷键
- 嵌套深度 > 3

## Migration Plan

### PR 1：Layer 1 新增文件

落地文件：
- `src/shared/components/ui/sidebar.tsx`（重写，~700 LOC）
- `src/shared/components/ui/sidebar.test.tsx`（重写，~400 LOC）
- `src/shared/components/ui/accordion.tsx`（新建，~80 LOC）
- `src/shared/components/ui/accordion.test.tsx`（新建，~80 LOC）
- `src/shared/components/ui/tooltip.tsx`（新建，~80 LOC）
- `src/shared/components/ui/tooltip.test.tsx`（新建，~60 LOC）
- `src/index.css`（增 `--sidebar-*` tokens）

### PR 2：Layer 2 重构 + consumer 适配

落地文件：
- `src/shared/components/internal/codeman-sidebar.tsx`（重写，~400 LOC）
- `src/shared/components/internal/codeman-sidebar.test.tsx`（删除旧 729 LOC + 新写 ~500 LOC）
- `src/features/chat/components/chat-sidebar.tsx`（适配 API 变化）
- `src/features/chat/components/chat-sidebar.test.tsx`（同步更新）
- `src/features/settings/components/settings-sidebar.tsx`（适配）
- `src/features/settings/components/settings-sidebar.test.tsx`（同步更新）

### PR 3：ADR + e2e selectors 迁移

落地文件：
- `docs/adr/0033-shadcn-sidebar-rewrite.md`（本 ADR）
- `e2e/helpers.ts`（selector 迁移到 `[data-value="..."]`）
- `e2e/01-app-launch.spec.ts`（selector 适配）
- `e2e/05-chat-message-bubble.spec.ts`（selector 适配）
- `e2e/09-per-conv-runtime.spec.ts`（selector 适配）
- `e2e/10-home-agent.spec.ts`（selector 适配）

## Decision Tree

| #  | 决策维度                    | 锁定值                                                    |
| -- | --------------------------- | --------------------------------------------------------- |
| Q1 | 两层都重写                  | Layer 1 补齐 atoms + Layer 2 重构以消费 Layer 1             |
| Q2 | 依赖策略                    | 不引入新依赖，@ark-ui/solid 适配                           |
| Q3 | SidebarProvider 位置        | Layer 1（运行时职责 + 受控/非受控 + toggle）                |
| Q4 | 全量 variants + collapsible | sidebar / floating / inset + offcanvas / icon / none      |
| Q5 | 保留 ADR-0030 contract     | renderItem + 3 slots + ZERO business logic                  |
| Q6 | mobile / cookie / 快捷键    | 不实现 desktop-only + in-memory signal                     |
| Q7 | 受控 + 非受控               | defaultOpen + open + onOpenChange 三件套                  |
| Q8 | Solid 原生语法              | mergeProps + as prop，不用 React useRender                 |
| Q9 | Tooltip 包装层             | ui/tooltip.tsx 包 @ark-ui/solid Tooltip                    |
| Q10 | 全实现 shadcn tree atoms    | SidebarMenu + Item + Sub + SubItem + SubButton 全部补齐    |
| Q11 | 3 层嵌套                    | project = SidebarGroup + Accordion；workspace = MenuItem；conv = Sub |
| Q12 | renderItem 仅管 leaf        | Layer 1 Button 接受 children；Layer 2 接受 renderItem 转 children |
| Q13 | 移除旧测试                  | codeman-sidebar.test.tsx + sidebar.test.tsx 全部删除重写    |
| Q14 | 3 commit 拆分               | PR1=Layer1；PR2=Layer2+consumer；PR3=ADR+e2e              |
| Q15 | currentValue + isActive 双 API | 保留 ADR-0030 D4                                           |
| Q16 | 独立 SidebarInset          | Layer 1 暴露                                               |
| Q17 | 保留 CodemanSidebar 两栏封装 | sidebar + SidebarInset 内联                                |
| Q18 | Tailwind v4 CSS vars        | --sidebar-width 等在 index.css @theme 声明                  |
| Q19 | chat-sidebar.tsx 必须改     | Q20 放松因 Q25=B                                           |
| Q20 | 新 ADR 0033                 | 本计划作为 ADR 输入                                          |
| Q21 | defaultOpen 默认 true       | Q22=A                                                      |
| Q22 | Solid createContext         | Q23=A                                                      |
| Q23 | 全部 shadcn 子件补齐        | GroupAction / MenuBadge / MenuSkeleton / Sub / SubItem / SubButton + Input + Separator |
| Q24 | 整体 sidebar CSS collapse  | Layer 1 暴露 CSS data-state collapse 能力；CodemanSidebar 不使用 |
| Q25 | CodemanSidebar 接受 GroupOption[] | Group.children: (SidebarOption \| SidebarSubOption)[]    |
| Q26 | renderItem + renderGroupHeader 职责 | renderItem 仅管 leaf 内部视觉；renderGroupHeader 仅管 group trigger 视觉 |
| Q27 | 新建 ui/accordion + chat tree | 项目 group 走 Layer 1 Accordion；workspace 永远是 MenuItem；conv 永远在 Sub |
| Q28 | e2e helpers.ts 重写         | 改用 `[data-value="..."]` 选择器                           |
| Q29 | 3 层类型 tree              | SidebarGroupOption + SidebarOption + SidebarSubOption     |
| Q30 | e2e selectors 统一          | `[data-value="..."]` 与 shadcn 命名一致                    |

## References

- `.omo/plans/sidebar-reshim.md` (30-round grill record)
- ADR-0022 (`internal/` 首例 + design tokens)
- ADR-0023 (codeman-* naming + @ark-ui/solid precedent)
- ADR-0030 (CodemanSidebar 通用化 renderItem contract)
- shadcn sidebar: `.repos/shadcn/sidebar.tsx`
