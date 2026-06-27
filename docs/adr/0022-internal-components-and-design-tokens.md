# 0022 — Open `internal/` for AgentSidebar + Dual-Layer Design Tokens

**Status**: accepted (2026-06-27)
**Date**: 2026-06-27
**Scope**: `shared/components/internal/` (开首例) + `shared/lib/design-tokens.ts` (新增) + `src/index.css` (`@theme` 扩 sidebar 颜色)
**Supersedes**: 无
**Related**: ADR-0010 (frontend 5+1 folder whitelist) Q4 (`components/ui` vs `components/internal` 边界)

## Context

V1 时期 `shared/components/internal/` 目录按 [ADR-0010 Q4] 决策是 "V1 预留"（候选: ErrorBoundary / LoadingSpinner / Toast / Provider wrappers / Layout atoms / AppShell），未实际落地。V1.x 期间 UI 组件分两类：

- **设计系统原子** (e.g., Button / Card / Checkbox / Input / Textarea) 落在 `components/ui/`
- **业务耦合组件** (e.g., Sidebar) 落在 `features/chat/components/sidebar.tsx`，feature 强耦合

V2 启动 Codex-like home 改造时遇到两个新需求：

1. **Sidebar 跨域复用**：Home (chat feature) 跟未来其它 feature 都可能需要 "workspace + conv 列表" 面板。Sidebar 不再适合绑死在 chat feature。
2. **shadcn-style design token 双层**：当前 `@theme` (CSS 颜色) 是唯一的视觉层，但 sidebar 出现后需要尺寸常量有单点真相（避免 `w-60` 散落 11 个地方）。

grill-with-docs session (2026-06-27) 锁定：

- Sidebar 抽到 `internal/agent-sidebar` + `ui/sidebar` 两层
- Design token 走 CSS 颜色 + TS 尺寸双层
- `internal/` 首例 = `agent-sidebar`，由 chat feature (Home) 消费

## Decision

### D1. 开放 `internal/` 目录

**采用**：开 `shared/components/internal/`，准入规则：

- 业务耦合但跨 feature 复用 (e.g., AgentSidebar 绑 chat 域但 layout 可被 settings / billing 复用)
- **不**依赖任何具体 feature 的 store / 类型 / 行为
- 严格 prop-driven（数据 + handlers 通过 props 传入）
- 测试用 mock props，不 mock store

**拒绝**：

- A. 维持 `internal/` 预留 — Sidebar 必须找到归属，强行放 `ui/` 会污染设计系统层
- B. 把 `agent-sidebar` 放 `features/chat/` — 跟 V1.x sidebar 同位置，跨域复用无门
- C. 跳过 internal 直接用 `ui/` — 违反 ADR-0010 Q4

**理由**：

- AGENTS.md 已锁 `internal/` 语义（"跨域业务组件"），本次仅是开首例
- 单一首例（agent-sidebar）足以证明 pattern 价值，盲目铺开多个组件会引入维护成本
- "业务耦合但跨 feature 复用" 边界已收紧（prop-driven 强约束），避免内部腐烂

### D2. Design token 双层

**采用**：CSS 颜色 + TS 尺寸并行

- **CSS 颜色**（`src/index.css` `@theme` 块）：所有视觉相关颜色走 HSL CSS 变量，生成 Tailwind utility class（`bg-sidebar` / `text-sidebar-foreground` / `border-sidebar-border`）
- **TS 尺寸**（`shared/lib/design-tokens.ts`）：所有 "需要 JS 知道的常量"（`SIDEBAR_WIDTH = "15rem"` / `SIDEBAR_TRANSITION_MS = 200` / `SIDEBAR_KEYBOARD_SHORTCUT = "b"`）走 TS 常量，单点真相

**拒绝**：

- A. 仅 CSS 颜色 — 尺寸无单点真相（`w-60` 散落）
- B. 仅 TS token — 破坏 Tailwind v4 utility-first，弃用现有 `@theme` 体系
- C. CSS 颜色 + 内联 JSX 尺寸 — 跟 A 等价

**理由**：

- shadcn-svelte 既有约定（`--sidebar-*` HSL 变量 + TS 常量）已证明可行
- 项目现有 `@theme` 体系（`bg-card` / `text-muted-foreground` 等）已落地，扩展 sidebar 颜色保持同构
- TS 尺寸常量让 "折叠/展开动效" 等需要 JS 控制的属性有单点来源
- 0 状态 token 通过 utility class 表达（如 `bg-sidebar/50` 透明度），无需单独建

### D3. `agent-sidebar` 形态

- 路径：`shared/components/internal/agent-sidebar.tsx`
- 严格 prop-driven，**不** import 任何 `features/*/stores/*`
- 知道 "workspace group + conv group" 布局，但数据由父组件传入
- 内部维护 `confirmingId` signal 实现 inline delete confirm
- 测试用 mock props

## Considered Options

### Sidebar 放置位置

详见 grill-with-docs 2026-06-27 session。本 ADR 锁定 D1 + D3 路径：

- `ui/sidebar` (Layer 1) + `internal/agent-sidebar` (Layer 2) + **删除** `features/chat/components/sidebar.tsx` (Layer 3)
- Layer 1 = 纯 layout primitive，零业务
- Layer 2 = 业务组合，知道布局形状但不持有数据
- 父组件（chat feature 的 home route）直接喂 props 给 Layer 2

### 拒绝 Layer 3

V1.x 期间 `features/chat/components/sidebar.tsx` = Layer 3（业务 + 数据）。grill session 决议：**删除**，home route 直接连到 Layer 2。

理由：

- Layer 3 是单 consumer（仅 chat feature），没有跨域复用价值
- 减少 indirection，store 数据流直接到 Layer 2
- Layer 2 严格 prop-driven 已足够隔离业务

## Consequences

### 正面

- `internal/` 首例落地，pattern 可复用（未来 ErrorBoundary / LoadingSpinner 等可循例）
- Design token 双层，CSS / TS 各自有单点真相
- Sidebar 从 chat feature 解耦，未来其它 feature 可消费 `agent-sidebar` 同样的 "workspace + item list" 布局
- shadcn-style sub-component API（`Sidebar` / `SidebarMenu` / `SidebarMenuItem` 等）让 consumer 自由组合

### 负面

- `internal/` 新增维护责任（命名 / 数量 / 维护者规范待后续 ADR 跟进，本 ADR 仅开首例）
- Design token 跨 CSS + TS，开发者需知两边
- Sidebar 从 chat feature 删除后，chat feature 内部直接消费 `agent-sidebar`，跨域 import 边界要在 review 守护

### 跨文件影响

| 文件 | 改动 |
|---|---|
| `docs/adr/0022-internal-components-and-design-tokens.md` | 本 ADR |
| `src/shared/components/internal/agent-sidebar.tsx` | 新建 |
| `src/shared/components/internal/agent-sidebar.test.tsx` | 新建 |
| `src/shared/components/ui/sidebar.tsx` | 新建（primitive） |
| `src/shared/components/ui/sidebar.test.tsx` | 新建 |
| `src/shared/lib/design-tokens.ts` | 新建 |
| `src/shared/lib/design-tokens.test.ts` | 新建 |
| `src/index.css` | `@theme` 加 sidebar 颜色 token |
| `src/features/chat/components/sidebar.tsx` | **删除** |
| `src/features/chat/components/sidebar.test.tsx` | **删除** |
| `src/features/chat/routes/index.tsx` | 状态机重写（home vs chat） |
| `src/shared/AGENTS.md` | 更新 `internal/` 行 + 5+1 白名单注 |
| `src/features/chat/AGENTS.md` | 更新 sidebar / home / chat-view 章节 |
| `src/AGENTS.md` | 更新查阅指南 |
| `CONTEXT.md` | 加 `Last-Used Workspace` + `Workspace-Bound Conversation`，更新 `Workspace` |

### 不可逆性

推翻本 ADR 需：

- 删 `internal/agent-sidebar` + `ui/sidebar` + `design-tokens.ts`
- 恢复 `features/chat/components/sidebar.tsx`
- 撤销 ADR 0022 + 重新激活 "internal/ 预留" 状态
- 改 `src/shared/AGENTS.md` 5+1 白名单 + `src/index.css` @theme
- 改 `src/features/chat/AGENTS.md` 章节 + `src/AGENTS.md` 查阅指南
- 撤回 `CONTEXT.md` 词条新增

总改动 ≥ 8 处代码 + 3 处文档。成本有意义 → 不可逆标记成立。

## Pointer to ADR-0023

Naming conventions for `internal/` components (codeman-* prefix) and the @ark-ui/solid Select primitive adoption are now governed by [ADR-0023](./0023-codeman-prefix-and-ark-ui-select.md). ADR-0022 retains governance of the `internal/` directory infrastructure (准入条件 + prop-driven 强约束) and the dual-layer design tokens (CSS colors + TS constants).

## References

- ADR-0010 (frontend 5+1 folder whitelist) Q4 (`components/ui` vs `components/internal` 边界)
- CONTEXT.md "File IO" / "Settings 与状态" 词汇表
- shadcn-svelte Sidebar: `https://www.shadcn-svelte.com/docs/components/sidebar`
- grill-with-docs session 2026-06-27
