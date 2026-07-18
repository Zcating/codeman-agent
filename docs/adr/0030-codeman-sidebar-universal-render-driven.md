# 0030 — CodemanSidebar 通用化：renderItem 全权控制 + 5 slots 两栏布局

**Status**: accepted · **Date**: 2026-07-18
**Scope**: `src/shared/components/internal/codeman-sidebar.tsx` (重写) + `src/shared/components/internal/codeman-sidebar.test.tsx` (重写) + `src/features/chat/components/chat-sidebar.tsx` (新增) + `src/features/chat/routes/chat-layout.tsx` (改) + `src/features/chat/stores/chat.store.ts` (改 — 删除 `buildSidebarNodes`) + `src/features/chat/components/conv-delete-action.tsx` (新增) + `src/features/chat/components/workspace-actions.tsx` (新增) + `src/features/settings/components/settings-sidebar.tsx` (新增) + `src/features/settings/routes/settings-layout.tsx` (新增) + `src/router.tsx` (改 — 嵌套路由 `/settings/$tab`)

**Related**: ADR-0022 (`codeman-sidebar` 首例 + internal 组件边界), ADR-0023 D7-CS (Accordion uncontrolled 模式 + cascade 行为), ADR-0029 (ProviderCard TanStack Form 模板 — sidebar 不是 form, 但 consumer 写法风格对齐)

## Context

`shared/components/internal/codeman-sidebar.tsx` (Wave V2.1 ADR-0022 首例) 当前是 **chat 域专用** sidebar — 接受 `WorkspaceNode[]` + 8 个 chat 域概念 props (`onSelectItem` / `onDeleteItem` / `onCreateItem` / `onRenameWorkspace` / `onDeleteWorkspace` / `onEmptyWorkspaceClick` 等)，inline confirm 二次确认 UI 写死在 sidebar 内部 (line 83 / 234-275)，"workspace" / "conv" 概念泄漏到 shared/ 组件 (违反 ADR-0022 D3 "ZERO business logic, ZERO feature/store imports")。

settings 域新需求 (2026-07)：点击 sidebar 设置链接后保留 sidebar，把当前 `/settings` 整页面拆为左侧 settings 分类导航 + 右侧 section 内容（4 个 tabs：LLM / App / Window / Advanced → 嵌套路由 `/settings/$tab`）。settings 域 sidebar 是 **扁平 4 项 nav list** + 路由跳转 + active 高亮——跟 chat 域嵌套 tree + hover delete 完全不同。

两个核心张力：

1. **通用化深度**：chat 域的 inline confirm / hover delete / 流式 spinner / 日期 subLabel 等视觉差异，要复用 sidebar 抽象还是要 consumer 自管？
2. **抽象边界**：sidebar 提供 Accordion 状态管理 + active 高亮 + hover bg + click navigate，还是降级为 Accordion wrapper + 5 slots 全部交给 consumer？

经过 8 轮 grilling（用户："新建一个新的 sidebar" → "通用化" → "业务逻辑应该挪出" → "renderItem 接管 sidebar" → "改成 label-value" → "参考 shadcn-style 设计" → 拍板最终 schema），结论是 **renderItem 完全接管节点 DOM 结构 + sidebar 内部包容器 + active/hover 视觉 + click navigate**。

## Decision

### D1 — 节点类型：`SidebarItemConfig` + `SidebarOption extends`（仅 2 层嵌套）

```typescript
export interface SidebarItemConfig {
  label: string;                            // 必填（form 语义）
  value?: string;                           // 可选（key / navigate 用）
  icon?: JSX.Element;
  disabled?: boolean;                       // sidebar 自动加 opacity-60
}

export interface SidebarOption extends SidebarItemConfig {
  defaultExpanded?: boolean;                // group 默认展开（uncontrolled）
  children?: SidebarItemConfig[];           // children 只到 leaf（不支持更深嵌套）
}
```

**`label` 必填而非 `value`**：参考 shadcn-style 设计表单语义（`{ label, value }` 是常见表单 item 表达），且 settings 域 4 个 item 的 label/value 完全相同（`LLM`/`llm`），强制 value 必填是冗余。

**仅 2 层嵌套**：chat 域 workspace > conversations 是 2 层；不允许更深递归——`children?: SidebarItemConfig[]` 不再嵌套 `SidebarOption`。简化类型 + 渲染逻辑（不需要递归组件）。

**`defaultExpanded` 不叫 `open`**：保留 Ark UI Accordion 的 uncontrolled 模式（ADR-0023 D7-CS2 "组件内部 signal，不持久化"）—— `defaultExpanded` 转 `Accordion.Root.defaultValue`，consumer 不需要管展开态。

### D2 — `renderItem` 只接 `SidebarItemConfig`（无 helpers），sidebar 内部包 active + hover + click

```typescript
export type SidebarRenderItem = (
  item: SidebarItemConfig,
) => JSX.Element;

export interface SidebarProps {
  options: SidebarOption[];
  renderItem: SidebarRenderItem;
  currentValue?: string;
  isActive?: SidebarIsActiveFn;
  onItemSelect?: (value: string) => void;
  // ... 5 slots
}
```

**renderItem 不接 helpers**：consumer 只决定"节点长啥样"（icon + label 排列），sidebar 自动包 `<SidebarMenuButton>` + active 高亮（`bg-sidebar-primary`）+ hover bg（`hover:bg-sidebar-accent`）+ cursor + click handler。**consumer 不需要管 active class / hover class / onClick**。

**为什么不要 helpers**：第 3 轮 grilling 我推过 `helpers: { option, isActive, isExpanded }` 让 consumer 自己加 active class。参考 shadcn-style sidebar 设计后发现：sidebar 自己包 active 高亮更符合 library-grade 习惯（shadcn `SidebarMenuButton` 接受 `isActive` prop，consumer 不用管 class）—— **简化 consumer 代码 50%+**，一致性由 sidebar 保证。

### D3 — 5 slots（外顶 / 内顶 / 内底 / 外底 / children）+ 两栏布局封装

```typescript
export interface SidebarProps {
  // ...
  header?: JSX.Element;                     // 外顶（page header，sticky）
  sidebarHeader?: JSX.Element;              // 内顶（sidebar 内部）
  sidebarFooter?: JSX.Element;              // 内底
  footer?: JSX.Element;                     // 外底
  children?: JSX.Element;                   // 主内容（SidebarInset）
}
```

**5 slots 区分**：
- `header` / `footer` 是 **sidebar 外** 的 page-level slot（sticky top / 页面底部）
- `sidebarHeader` / `sidebarFooter` 是 **sidebar 内** 的 slot（group label 之上 / menu 之下）
- `children` 是 `SidebarInset` 的主内容（两栏布局右栏）

**两栏布局封装**：sidebar 自带 `<SidebarProvider>` + `<Sidebar>` + `<SidebarInset>{children}</SidebarInset>` 三件套。consumer 不用自己拼两栏布局，`<Sidebar>{<Outlet />}</Sidebar>` 一行搞定。

**chat 域用法**：
```tsx
<Sidebar
  options={nodes}
  currentValue={currentConvId()}
  sidebarHeader={<NewChatButton />}
  sidebarFooter={<SettingsLink />}
>
  <Outlet />  {/* ChatView / HomeAgentForm */}
</Sidebar>
```

**settings 域用法**：
```tsx
<Sidebar
  options={SETTINGS_OPTIONS}
  currentValue={currentTab()}
  sidebarHeader={<h2>Settings</h2>}
>
  <Outlet />  {/* /settings/$tab section */}
</Sidebar>
```

### D4 — `currentValue` + `isActive` 双重 API（isActive 默认 isEqual）

```typescript
export type SidebarIsActiveFn = (
  value: string | undefined,
  currentValue: string | undefined,
) => boolean;

const isEqual = (a: unknown, b: unknown): boolean => a === b;
```

**两个 API 并存不冲突**：
- `currentValue?: string` 是**语法糖**——sidebar 内部自动用 `isEqual(item.value, currentValue)` 算 active
- `isActive?: SidebarIsActiveFn` 是**复杂判断**——chat 域需要 `value === currentConvId() && !isStreaming(value)` 这类复合判断

**两者关系**：`isActive` 默认 `isEqual`；如果 consumer 传了 `currentValue` 但没传 `isActive`，自动用 `isEqual(value, currentValue)`；如果传了 `isActive`，`currentValue` 自动作为第二个参数传给 `isActive(value, currentValue)`。

**两种写法等价**：
```tsx
// 简单（语法糖）
<Sidebar currentValue="llm" />

// 复杂（自定义判断）
<Sidebar 
  currentValue="llm"
  isActive={(value, cur) => value === cur && !disabled(value)} 
/>
```

### D5 — Accordion uncontrolled（按 ADR-0023 D7-CS2）

sidebar 内部用 `@ark-ui/solid Accordion`，`defaultExpanded` 转 `Accordion.Root.defaultValue`：

```typescript
<Accordion.Root
  multiple={false}
  collapsible={true}
  defaultValue={props.options
    .filter(o => o.defaultExpanded)
    .map(o => o.value!)
  }
>
```

**不暴露 `isExpanded` 给 consumer**：consumer 拿不到 group 当前展开态（与 ADR-0023 D7-CS2 一致："组件内部 signal，不持久化、不耦合 appStore"）。如果 consumer 需要知道展开态，自己从 DOM 读 `data-state="open"` 或用 `createSignal` 自己管。

**业务取舍**：放弃"accordion 受控模式"换取 ADR 合规 + 实现简单 + 测试覆盖高（Ark UI Accordion 内部状态机已测过）。

### D6 — 业务逻辑全部挪出 sidebar（hover delete / 二次确认 / rename 是 chat 域组件，不是 sidebar）

chat 域需要的视觉/行为差异（hover delete 按钮 + 二次确认 + workspace rename）作为 **chat 域组件** 实现，通过 sidebar 的 5 slots / nodes icon / children 注入，sidebar 不持有任何 chat 域状态：

| chat 域需求             | 实现位置                                  | sidebar 知道吗 |
| ----------------------- | ----------------------------------------- | -------------- |
| workspace hover rename/delete | `WorkspaceActions` 组件（chat 域）          | ❌ 不知道      |
| conv hover delete + confirm | `ConvDeleteAction` 组件（chat 域）            | ❌ 不知道      |
| 流式 spinner badge      | consumer 在 renderItem 里加 `<Loader2>`    | ❌ 不知道      |
| 日期 subLabel           | consumer 在 renderItem 里加 `<span>`       | ❌ 不知道      |
| "无 provider 前往 settings" | chat-view.tsx 的空状态                    | ❌ 不知道      |

**对比 V1.0（之前 sidebar 内部实现）**：
```diff
- // sidebar.tsx 内部（V1.0）
- const [confirmingId, setConfirmingId] = createSignal<string | null>(null);
- <Show when={confirmingId() === c.id} fallback={<button>×</button>}>
-   <div class="absolute inset-0 z-10 flex items-center justify-end gap-1">
-     <button>删除</button>
-     <button>取消</button>
-   </div>
- </Show>

+ // conv-delete-action.tsx（V2.0，chat 域组件）
+ export function ConvDeleteAction(props: { convId: string }) {
+   const [confirming, setConfirming] = createSignal(false);
+   // ...
+ }
```

**好处**：sidebar 完全 prop-driven，符合 ADR-0022 D3；chat 域代码跟 sidebar 解耦，未来 settings 域加 sidebar 项不会被 chat 概念污染。

### D7 — chat 域 nodes 在 chat-sidebar.tsx 里构造（迁出 chat.store.ts）

`buildSidebarNodes()` 当前在 `chat.store.ts:33-54` 里，把 `WorkspaceNode[]` / `ConvNode[]` 转 sidebar nodes。新版本迁到 `features/chat/components/chat-sidebar.tsx`：

```typescript
// features/chat/components/chat-sidebar.tsx
export function ChatSidebar() {
  const navigate = useNavigate();
  const workspaces = workspaces$();
  const conversations = conversations$();

  const nodes = workspaces.map(ws => ({
    label: ws.label,
    value: ws.id,
    icon: <Folder />,
    defaultExpanded: true,
    children: conversations
      .filter(c => c.workspaceId === ws.id)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(c => ({ label: c.title, value: c.id, icon: <MessageSquare /> })),
  }));

  return (
    <Sidebar
      options={nodes}
      currentValue={currentConvId()}
      onItemSelect={(value) => navigate({ to: `/conversation/${value}` })}
      sidebarHeader={<NewChatButton />}
      sidebarFooter={<SettingsLink />}
    >
      <Outlet />
    </Sidebar>
  );
}
```

**为什么迁出 store**：chat.store 不应该知道"sidebar 节点的 DOM 长啥样"——store 只存 domain data（workspaces / conversations），UI 形态在 component 层组装。这是 ADR-0019 D3 "store = domain state, no UI concerns" 的延伸。

### D8 — router.tsx 嵌套路由：`/settings` → redirect → `/settings/$tab`

```typescript
// router.tsx
const settingsLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsLayout,
  beforeLoad: ({ location }) => {
    if (location.pathname === "/settings") {
      throw redirect({ to: "/settings/llm", replace: true });
    }
  },
});

const settingsLlmRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: "llm",
  component: LlmSection,
});

const settingsAppRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: "app",
  component: AppSection,
});

// settings/window + settings/advanced 同上
```

**`/settings` 父路径 redirect 到 `/settings/llm`**（用 `replace: true`）：URL 永远带具体 tab 名，跟 chat 域"URL 是 single source of truth"哲学一致（chat-layout.tsx:68 注释）。e2e 可直接 `goto('/settings/llm')`，不需要先选 sidebar item。

**settings domain 不再走 chatLayoutRoute**：chat 域 layout 是 sidebar(workspaces) + outlet(settings)，新方案是 settings 域自己有 layout（sidebar(4 tabs) + outlet(section)），两域 sidebar 互不污染。

## Status

accepted

## Considered Options

- **A — 完全独立两个 sidebar**：chat 域 sidebar 保持不变（chat 专用），settings 域新建 `codeman-settings-sidebar`。**拒**：两套 sidebar 代码重复 80%，未来第三个域需要 sidebar 又得新建；抽象机会成本高。
- **B — 通用化字段，不加 escape hatch**：把所有 chat 域差异用 schema 字段表达（subLabel / badge / onSelect / href / action 等 5+ 字段）。**拒**：第 2 轮 grilling 用户明确拒绝字段穷举（"字段会逐渐膨胀为 avatar/thumbnail/progress/..."），字段表达力有上限（drag handle / 嵌入 image 等覆盖不到）。
- **C — 节点级 renderItem escape hatch**：节点自带 `render?: (helpers) => JSX.Element`，99% 节点用字段、1% 自定义的传 render。**拒**：第 4 轮 grilling 用户明确拒绝节点级 escape（"字段穷举"）—— 走的是"sidebar 完全 wrapper，consumer 全权"的 library-grade 方向，不是"sidebar 管 99%、escape 1%"的混合方向。
- **D — sidebar prop 级 renderItem + sidebar 自己包 active/hover/click**（最终方案）：5 slots + 5 slots 接管所有视觉/行为 + sidebar 内部包容器保证一致性 + Accordion uncontrolled。**选**：consumer 代码最简单（renderItem 只管 icon + label 排列），sidebar 提供 Accordion + active + hover + click + 两栏布局"五件套"。
- **E — 不抽 sidebar，直接在 chat-layout / settings-layout 里手写 `<aside>` + `<For>`**：**拒**：chat 域已有 298 行 sidebar 抽象（ADR-0022 首例），放弃抽象 = ADR-0022 反转，需要新 ADR 解释为什么不抽。

## Consequences

### 正面

- **两域 sidebar 共享一份实现**：chat 域（嵌套 tree + 流式 + hover delete）和 settings 域（扁平 4 项 nav）走同一个 `<Sidebar>`，代码 0 重复
- **settings 域新增 sidebar 零成本**：未来 settings 域加第 5/6 个 tab（"Models" / "Telemetry"），只需在 `SETTINGS_OPTIONS` 数组加一行
- **chat 域业务逻辑完全解耦**：sidebar 不再 import chat.store / workspace 概念；hover delete / 二次确认是 chat 域独立组件
- **5 slots 覆盖完整布局需求**：page header（外顶）+ sidebar header（内顶）+ sidebar footer（内底）+ page footer（外底）+ 主内容（SidebarInset），不再需要在 chat-layout / settings-layout 里手拼两栏
- **URL 是 single source of truth**：`/settings/$tab` 嵌套路由 + `/settings` redirect，刷新 / 深链 / 浏览器 back-forward 都 work
- **test 覆盖更纯**：sidebar 自身测 helper 行为（mock options + 断言 active 计算 / Accordion defaultValue），consumer 测自己的 renderItem 内容，互不依赖

### 负面 / 风险

- **chat 域迁移量大**：chat-layout.tsx / chat.store.ts 改动 + 4 个新文件（chat-sidebar / conv-delete-action / workspace-actions / settings-layout）。建议分 PR 落地（见 Migration Plan）
- **renderItem 不接 helpers 是"全权托管"哲学**：未来如果 consumer 想覆盖 active class（比如"active 项要红色而不是 primary 色"），要么改 sidebar prop 加 variant，要么在 renderItem 里**自己不用** SidebarMenuButton 直接写 `<button class={...}>`——后者是 escape hatch，consumer 需要知道 sidebar 默认样式机制
- **嵌套仅 2 层**：如果未来 settings 域需要"二级分类"（"Models" → "Anthropic / OpenAI"），需要升级 schema（递归或 third-party tree 库）—— YAGNI，先 2 层
- **Accordion 状态不暴露**：consumer 拿不到当前展开态，调试 / 测试"group 展开后断言"需要从 DOM 读 `data-state="open"`，不如受控模式直观
- **`onItemSelect` 不绑定路由库**：sidebar 不知道有 TanStack Router 存在；consumer 在 onItemSelect 里写 `navigate({ to: ... })`。如果未来 sidebar 想"自动根据 href 字段触发 navigate"，需要扩展 schema——当前不必要（chat 域需要额外 logic 不是简单 navigate）

### 兼容性

- **`CodemanSidebar` props 完全 breaking change**：所有 chat 域 caller 都要重写（chat-layout.tsx 改用 `<ChatSidebar />`）
- **`buildSidebarNodes` 函数删除**：从 chat.store.ts 迁到 chat-sidebar.tsx
- **inline confirm 二次确认逻辑删除**：从 sidebar.tsx 内部迁到 ConvDeleteAction 组件
- **`@ark-ui/solid Accordion` 已是 dependency**（chat 域 V2.1 已用），无新增第三方
- **TanStack Router `redirect` 已是 dependency**，无新增

### 不在 scope

- **drag-and-drop reorder**：chat 域 sidebar 当前不支持拖拽重排，未来需要时引入 `@thisbeyond/solid-dnd` 或类似
- **嵌套深度 > 2**：未来 settings 域需要二级分类时升级 schema
- **multi-select sidebar**：当前 active 单选；multi-select 是 V2+ 候选
- **accordion 受控模式**：放弃（按 ADR-0023 D7-CS2 uncontrolled）
- **空 workspace 的 "该 workspace 暂无会话" 按钮**：本期删除（chat 域当前 `onEmptyWorkspaceClick` 行为—— `setSelectedWorkspaceId(wsId)`）。如果未来需要，settings 域不需要 / chat 域保留，迁到 chat-sidebar.tsx 单独处理
- **mobile responsive sidebar**：当前 desktop only，未来需要 sheet 化时再讨论
- **`emptyMessage` 触发条件**：当前 `options.length === 0` 时显示；如果 chat 域有 workspaces 但全部 collapsed（Accordion 无展开），不显示 emptyMessage——这是 Accordion 的事不是 sidebar 的事

## Migration Plan

### 阶段 0（本 ADR 落地前）：ADR review + 用户拍板 ✅

已完成 8 轮 grilling，最终 schema 在本 ADR "Decision" section。

### 阶段 1：sidebar 重写（PR 1）

落地文件：
- `src/shared/components/internal/codeman-sidebar.tsx` (重写，~250 行)
- `src/shared/components/internal/codeman-sidebar.test.tsx` (重写，~150 行)

验证：
- `vp run typecheck` exit 0
- `vp run test` 全绿
- sidebar 自身测试覆盖：active 计算 / Accordion defaultValue / 5 slots / emptyMessage / disabled opacity

### 阶段 2：chat 域迁移（PR 2）

落地文件：
- `src/features/chat/components/chat-sidebar.tsx` (新增，构造 nodes)
- `src/features/chat/components/conv-delete-action.tsx` (新增)
- `src/features/chat/components/workspace-actions.tsx` (新增)
- `src/features/chat/routes/chat-layout.tsx` (改用 `<ChatSidebar />`)
- `src/features/chat/stores/chat.store.ts` (删除 `buildSidebarNodes`)

验证：
- `vp run typecheck` exit 0
- `vp run test` 全绿（chat 域现有测试要保留：sidebar 显示 workspaces + conversations、active 高亮、streaming badge、delete + rename dialog）
- e2e：chat 域 sidebar 行为不变

### 阶段 3：settings 域新建 sidebar + 嵌套路由（PR 3）

落地文件：
- `src/features/settings/components/settings-sidebar.tsx` (新增)
- `src/features/settings/routes/settings-layout.tsx` (新增，含 `<Outlet />`)
- `src/features/settings/routes/settings.tsx` (改，删除整页 layout 改用 settings-layout + section)
- `src/router.tsx` (改，嵌套路由 `/settings` + `/settings/$tab`)

section 拆分：
- `src/features/settings/routes/sections/llm-section.tsx` (新增)
- `src/features/settings/routes/sections/app-section.tsx` (新增)
- `src/features/settings/routes/sections/window-section.tsx` (新增)
- `src/features/settings/routes/sections/advanced-section.tsx` (新增)

验证：
- `vp run typecheck` exit 0
- `vp run test` 全绿（settings 域现有测试要保留 4 个 tab 内容）
- e2e：`/settings/llm` / `/settings/app` 切换 + sidebar active 高亮 + URL `/settings` redirect

### Commit 粒度

3 个 PR，每个 1 个 atomic commit（参照 ADR-0023 atomic rename 模式）：

- PR 1: `feat(shared): codeman-sidebar 通用化 renderItem 全权`
- PR 2: `feat(chat): chat-sidebar 迁移到通用 sidebar`
- PR 3: `feat(settings): settings-sidebar + 嵌套路由`

中间态必须编译通过（typecheck exit 0）。

## Decision Tree

| #  | 决策维度                          | 锁定值                                                     |
| -- | --------------------------------- | ---------------------------------------------------------- |
| Q1 | 节点类型                          | `SidebarItemConfig` + `SidebarOption extends`（2 层嵌套）   |
| Q2 | `label` 必填 vs `value` 必填      | `label` 必填 + `value` 可选（form 语义）                   |
| Q3 | `renderItem` 签名                 | `(item: SidebarItemConfig) => JSX.Element`（无 helpers）   |
| Q4 | active 高亮谁管                   | sidebar 自己（`SidebarMenuButton isActive` prop）          |
| Q5 | hover bg / click 谁管             | sidebar 自己                                              |
| Q6 | disabled 视觉                     | `option.disabled?: boolean` → sidebar 加 `opacity-60`       |
| Q7 | slots 数量                        | 5（外顶 / 内顶 / 内底 / 外底 / children）                    |
| Q8 | `children` 是否支持              | ✅（SidebarInset 主内容）                                  |
| Q9 | `currentValue` + `isActive` 并存  | ✅（currentValue 是语法糖，isActive 默认 isEqual）         |
| Q10 | Accordion 模式                    | uncontrolled（按 ADR-0023 D7-CS2）                          |
| Q11 | `defaultExpanded` vs `open`       | `defaultExpanded`（uncontrolled 一致）                      |
| Q12 | 嵌套深度                          | 仅 2 层（group > leaf）                                     |
| Q13 | 业务逻辑（hover delete / confirm）| chat 域独立组件，sidebar 不持有                              |
| Q14 | chat nodes 构造位置                | `chat-sidebar.tsx`（迁出 chat.store）                      |
| Q15 | `/settings` 默认行为              | redirect `/settings/llm` (replace: true)                    |
| Q16 | 嵌套路由                          | `/settings` + `/settings/$tab`                             |
| Q17 | 测试策略                          | 两层分离：sidebar 自身（helper + Accordion）+ consumer 测 renderItem |
| Q18 | 命名 (`class` vs `className`)     | `class`（Solid 惯例）                                      |
| Q19 | `style` prop                      | 删（违反 ADR-0006 无 inline style）                        |
| Q20 | `icon` 类型                       | `JSX.Element`（Solid 渲染约定）                            |