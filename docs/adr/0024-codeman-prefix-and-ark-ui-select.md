# 0023 — codeman-* Naming Convention + Ark UI Select Adoption

**Status**: accepted (amended 2026-06-28 with D8-W Workspace Chat-Ownership Migration superseding D6-H; amended 2026-06-28 with D7-CS Cascade Sidebar; amended 2026-06-27 with D6-H Home Add Workspace) · **Date**: 2026-06-28 · **Scope**: `shared/components/internal/*` + `shared/components/ui/codeman-select.tsx` + `shared/components/ui/codeman-group-select.tsx` + `shared/components/ui/dialog.tsx` + `src/features/chat/lib/workspace-service.ts` + `src/features/chat/stores/chat.store.ts` (renamed from conversations.store.ts) + `src-tauri/src/db/workspaces.rs` + Rust SQLite migration + HomeAgentForm + e2e + docs + tests
**Supersedes (in scope)**: (codeman-* prefix) + (hand-rolled Select — was proposed, not implemented); D6-H superseded by D8-W (this amendment)
**Related**:, Q4 (ui vs internal boundary), (service-in-store), CONTEXT.md "组件" section

## Context

V2.1 wave 1 (commit 4346d3f + earlier) shipped + HomeAgentForm + Sidebar primitive + agent-sidebar. After wave 1, two ground-truth corrections emerged:

1. **Naming drift**: CONTEXT.md "组件" section states codeman-* is the namespace, but `agent-sidebar.tsx` is the actual file. Drift.
2. **Hand-rolled Select is wrong shape**: Two consumers emerged (HomeAgentForm workspace picker with "+ Add new" action; ChatView grouped provider picker). Hand-rolling the full shadcn-svelte Select API (Popover + Portal + Trigger + Content + Listbox + Item + ItemGroup + keyboard nav + ARIA + scroll lock + focus trap + typeahead) = 500-800 LOC of bug-prone code. Re-grill after hyperplan team cross-critique evaluated Radix UI (React, no Solid) / Kobalte (Solid-native, larger surface) / @ark-ui/solid (Zag.js FSM, multi-framework, MIT, headless via data-scope/data-part, official Chakra team).

Re-grill 2026-06-27 chose @ark-ui/solid (user pick): Solid-native, ~3-5 KB gzipped per Select usage, full keyboard + ARIA built-in, Floating UI positioning via --reference-width/--x/--y CSS vars.

## Decisions

### D4-N — codeman-* prefix rules

- All files in `shared/components/internal/` MUST start with `codeman-`; component name MUST match (e.g. `CodemanSidebar` exported from `codeman-sidebar.tsx`).
- Rename `agent-sidebar.tsx` → `codeman-sidebar.tsx` (and test file) is atomic single-commit (squash-merged), no partial state.
- Reviewers reject new files in `internal/` without `codeman-` prefix. No precommit enforcement (per Q4 review convention).
- ui/ keeps non-prefixed names: `button`, `card`, `checkbox`, `input`, `select`, `sidebar`, `textarea`.

### D4-S — Select via @ark-ui/solid

- Add `@ark-ui/solid@^5.37.0` (single new runtime dep).
- Two wrappers in `shared/components/ui/`:
  - `codeman-select.tsx` — single-list Select using `Select.Root` / `Select.Control` / `Select.Trigger` / `Select.ValueText` / `Select.Indicator` / `Select.Positioner` / `Select.Content` / `Select.List` / `Select.Item` / `Select.ItemText` / `Select.ItemIndicator`. Props: `options`, `value`, `onChange`, `placeholder`, `disabled`, `Action` (slot for non-option button).
  - `codeman-group-select.tsx` — adds `Select.ItemGroup` + `Select.ItemGroupLabel`. Props: `groups`, `value`, `onChange`, `placeholder`, `disabled`.
- Both wrappers own: `cn()` styling, z-index policy (`--layer-index`), empty-state slot, disabled handling, typeahead visual feedback.
- `Action` slot: plain `<button>` after `<Select.List>`, separated by `<hr role="separator">`. Calls `useSelectContext().setOpen(false)` on click. NOT in listbox role (trade-off; acceptable per re-grill).
- `HiddenSelect` NOT rendered by default; opt-in via `withHiddenSelect` prop on wrappers.
- Collection API: `createListCollection({ items: [...] })` from @ark-ui/solid with `label` + `value` per item.
- Single-select uses `value: string[]` per Ark UI convention; extract via `e.value[0]`.

### D5'-N — "+ Add new" placement

- Inside `<Select.Content>`, after `<Select.List>` (or last ItemGroup), separated by styled `<hr>`.
- Trade-off: button is NOT arrow-reachable (only Tab-out-able). Mouse-clickable. Defer composite role to V2.2.

### D6-H — Home Add Workspace Flow (amended 2026-06-27)

**D6-H1 — Add Workspace opens OS folder picker directly**
- Home's workspace picker `<CodemanSelect>` keeps the `Action` slot ("+ Add new workspace…").
- Action slot onClick: 调用 `appStore.pickWorkspacePath()` (Effect.gen wrapped) 弹原生 OS folder picker (Tauri 2 `tauri_plugin_dialog::Dialog::file().pick_folder`)。**不再** `window.location.href = "/settings"`。
- 旧"Navigate-to-Settings"行为废止（V2.1 polish wave 2 早期实现）；改为 picker-first 流以减少"开始新对话"路径上的 UI 跳转。

**D6-H2 — `appStore.addWorkspace(rootPath): Workspace | null` (同步, 无 IPC)**
- 新增 store method。签名同步返回新建（或已存在 dedup）的 `Workspace`，`null` 表示 picker 用户取消（无 rootPath）。
- 内部步骤：(1) dedup by `root_path`，命中则返回已有 ws 不写 state；(2) `id = crypto.randomUUID()`；(3) `label = deriveLabelFromPath(rootPath)`；(4) `enabled = true`；(5) `appStore.set({ workspaces: [...prev, newWs] })`；(6) `settingsSaver.scheduleSave()`。
- 不返回 `Effect` —— 无 IPC 涉及，纯 client-side state mutation + 同步工具调用。Breaks `appStore` "returns `void` or `Effect<A, E, never>`" pattern；addendum 注明例外。

**D6-H3 — `deriveLabelFromPath` utility (shared/lib/)**
- 新文件 `src/shared/lib/derive-label-from-path.ts`，~8 LOC 函数 + 单测。
- 实现：strip trailing `[\\/]+` → `lastIndexOf('/' | '\\')` 取最后段 → trim → 空 fallback `"Untitled workspace"`。
- 跨平台（Windows + Unix path 都处理）；无新依赖（**es-toolkit 1.47.1 无 `path` 子路径**）。
- 单元测试覆盖：`C:\\foo\\bar` → `"bar"`、`/home/me/foo` → `"foo"`、`C:\\` → `"Untitled workspace"`、`/` → `"Untitled workspace"`、`foo` → `"foo"`、`C:\\foo\\bar\\` → `"bar"`。

**D6-H4 — Home 新布局 (textarea 顶 + workspace/LLM 行 + Send 单独行)**
- 顺序：Title → **Textarea (top, full width)** → row (`workspace` CodemanSelect 200px + `LLM` CodemanGroupSelect 200px, left-aligned + `gap-2`) → Send button (own row, right-aligned)。
- LLM picker 与 ChatView 的 `ProviderSelect` 完全复用：写 `default_llm_provider_id` + `settingsSaver.scheduleSave()`，Home 和 ChatView 立即生效（同一 store 字段）。
- Send 单独占一行的取舍：垂直空间多耗 32px；换取 layout 视觉层级清晰（与 V2.1 polish "Action slot not in listbox role" 一致 — 重要操作不与下拉选项混排）。

**D6-H5 — Last-Used Workspace 同步更新**
- Home `picker dropdown` 选 workspace / 通过 `Add Workspace` 添加新 workspace / 任何 `addWorkspace` 调用 → 都立即 `appStore.setLastUsedWorkspaceId(id)`（同写路径）。详见 CONTEXT.md "Last-Used Workspace" addendum。

### D7-CS — Cascade Sidebar Display (amended 2026-06-28)

V2.1 wave 1 + V2.1 polish 把 sidebar 渲染成 **两个平级 `SidebarGroup`**（Workspaces + Conversations），conv 列表由 `routes/index.tsx::itemsFromConversations()` 按 `appStore.selectedWorkspaceId()` 过滤。`CONTEXT.md` 定义 workspace 是 conversation 的「父」（per-Conv 绑定、一对多包含），但视觉上是平级而非嵌套——tree 语义和数据语义错位。下列决策在 治理权范围内追加「cascade 显示」子规则。

**D7-CS1 — Accordion 模式（同一时刻仅一个 workspace 展开）**

- Cascade 通过 `@ark-ui/solid` 的 `Accordion` 原语承载（D7-CS8），Accordion.Root 配置 `multiple={false}` + `collapsible={true}`，实现「同一时刻至多 1 个展开 + 点同已展开收起」的 accordion 语义。
- 状态由 Ark UI 内部 zag-js state machine 管理（uncontrolled via `defaultValue={[]}`），CodemanSidebar 不持有展开 signal，符合 D3「codeman-* 组件严格 prop-driven」。
- 与需求「点击对应的 workspace，在下方展示 conversation」字面 1:1 对齐；状态零增量（无需 Settings 字段、不引入第二份「哪些 workspace 展开」状态）。
- 拒绝 always-expanded tree（信息密度高但 > 2 workspace 时滚动条地狱）、拒绝独立 toggle chevron（多一份 UI 状态、与「点击 workspace 即展开」语义冲突）。

**D7-CS2 — 展开状态由 Ark UI Accordion 内部管理（不持久化、不耦合 appStore）**

- 完全组件局部状态；不写入 `Settings`，不同步到 `appStore`。
- Accordion.Root 用 `defaultValue={[]}` uncontrolled 模式；初始无展开，用户点击 header 才展开；同 id 再点击 = toggle 收起。
- 与 D4（service-in-store）+ D3（codeman-* 组件严格 prop-driven）一致——sidebar 不持有跨 feature 状态。
- 拒绝派生（active conv > last_used > first）——会引入「sidebar 偷偷跟 active conv 跳走」的不可预测行为；拒绝 Settings 持久化字段——超出 sidebar 职责。

**D7-CS3 — Workspace 永远不 active；只有 Conversation 可以 active**

- Sidebar workspace header 点击**不再**调用 `appStore.setLastUsedWorkspaceId`（V2.1 wave 1 行为废止）。
- `last_used_workspace_id` 唯一由 HomeAgentForm 的 workspace picker 写入（D6-H5 路径不变）。
- `CodemanSidebarProps.selectedWorkspaceId` + `onSelectWorkspace` props **删除**。
- 解绑后：sidebar workspace click 是纯 UI 行为，不影响 HomeAgentForm 的 draft 状态、不影响后续「返回首页」预选。
- 例外：D7-CS6 空 workspace 空态点击 CTA 调用 `setLastUsedWorkspaceId`（CTA 动作，不是 selection）。

**D7-CS4 — Nested tree shape（`WorkspaceNode.children: ConvNode[]`）**

- Parent（`features/chat/routes/index.tsx`）通过新增 `buildSidebarNodes()` 构造 `WorkspaceNode[]`；每个节点含 `children: ConvNode[]`（属于该 workspace 的 convs，按 `updated_at` desc 排序）。
- 过滤 V1.x 迁移遗留 `workspace_id === ""` 的 convs（不显示，与 V2.1 wave 1 行为一致）。
- Sidebar 把 `WorkspaceNode[]` 映射成 `Accordion.Item[]`（每个 Item value=ws.id）+ `ItemContent` 内嵌 `<For>` 渲染 children；不再有顶层 `SidebarGroup("Workspaces")` + `SidebarGroup("Conversations")` 双 group 结构。

**D7-CS5 — 语义 data 属性 + aria（e2e 选择器契约）**

- Workspace 节点：`data-workspace-id`、`aria-expanded="true|false"`（Ark UI Accordion 自动设置）、`aria-label="Workspace: <label>"`
- Conv 节点：`data-conv-id`、`aria-current="page"`（active conv）、`aria-label="会话: <label>"`
- Streaming 徽标：保留 `aria-label="streaming"`
- 废弃 `aside li[data-conv-idx="N"]` flat 索引（V1.x sidebar 遗留），e2e spec 09 全重写为 `aside [data-workspace-id="ws-X"] [data-conv-id="conv-Y"]` 嵌套选择器。
- 与 ADR-0010「测试通过语义属性而非 BEM class」精神一致。

**D7-CS6 — 空 workspace 空态（"该 workspace 暂无会话" + 点击新增）**

- Workspace 展开 + `children.length === 0` → 在 `Accordion.ItemContent` 内渲染可点击 `<button data-empty-workspace-id="...">` 文本「该 workspace 暂无会话」。
- 点击 handler：`appStore.setLastUsedWorkspaceId(wsId)` + `clearActiveConversation()` → 落到 HomeAgentForm 该 workspace 预选 → 用户输入首条消息时建 conv。
- 这是 sidebar 内**唯一**对 `last_used_workspace_id` 的写入路径（CTA 动作，不是 workspace selection）。
- 1 workspace 场景下空态几乎不出现（用户通常在 Home 已建首 conv）；≥ 2 workspace 时它是显眼的「去建第一个 conv」入口。

**D7-CS7 — ChevronRight（旋转 90° 表示展开）视觉指示（lucide-solid，右对齐）**

- workspace header 触发器（`Accordion.ItemTrigger`）靠左显示 `lucide ChevronRight`，通过 Tailwind `group-data-[state=open]/item:rotate-90` 在 item 展开时旋转 90°。
- 由 Ark UI Accordion 自动注入 `data-state="open|closed"` 与 `aria-expanded="true|false"`，CSS 通过 group-data 读取，无需额外状态管理。
- 与主流 IDE 文件树交互一致；`aria-expanded` + `data-state` 提供 a11y + CSS hook 双语义。
- 拒绝 background-color-only 高亮——状态不可见、ARIA 不够语义；拒绝独立 chevron 点击区——加一层 a11y 决策（chevron 自身 keyboard handling + click target 与 button 重叠）。

**D7-CS8 — Ark UI Accordion 原语承载（D4-S 范式延伸）**

- cascade 复用 引入的 `@ark-ui/solid` 范式（已在 codeman-select.tsx 落地），不引入新依赖。
- Accordion 自动处理 ARIA / 键盘导航（↑↓ 切换 item、Enter/Space 触发、Home/End 跳首尾）/ 折叠-展开状态机。
- CodemanSidebar 不持有 accordion 状态 signal——所有展开状态由 zag-js machine 内部管理。我们仅叠加语义 data 属性（`data-workspace-id` / `data-conv-id`）供 e2e 选择。
- 单元测试 mock Ark UI Accordion 组件（参考 codeman-select.test.tsx 模式）：用 plain JS Set 追踪展开状态、ItemTrigger onClick 内同步切换——jsdom 下不依赖 zag-js state machine。**真** Accordion 行为由 e2e 测试覆盖（spec 09）。

### D8-W — Workspace Chat-Ownership Migration (amended 2026-06-28)

D6-H established `addWorkspace` as an `appStore` sync method with `deriveLabelFromPath`. Ground-truth re-evaluation (grill-with-docs session 2026-06-28) concluded that **workspace is a chat domain sub-concept** (per-Conv `workspace_id` binding links workspace to Conversation, not to Settings). D8-W **supersedes D6-H entirely**: workspace state moves from `appStore` → `chat.store`, with independent `WorkspaceService` (Effect + SQLite persistence), and `Settings.workspaces[]` is removed.

**D8-W1 — Workspace ownership moves to chat domain**
- Workspace CRUD moves from `appStore` → `chat.store` (renamed from `conversations.store.ts` to `chat.store.ts`).
- `chatStore` is the single source of truth for workspace state (selection / CRUD / derivation).
- `appStore.pickWorkspacePath` / `addWorkspace` / `setLastUsedWorkspaceId` / implicit `set({ workspaces })` all **deleted**.
- File rename: `conversations.store.ts → chat.store.ts` (singular, aligns with public namespace `chatStore`; breaks "store file = plural noun" convention — accepted trade-off for feature-name alignment).

**D8-W2 — WorkspaceService (Effect Context.Tag + SQLite persistence)**
- New `src/features/chat/lib/workspace-service.ts`: `WorkspaceService` Context.Tag with Live Layer.
- New Rust struct + SQLite table `workspaces` (`id TEXT`, `label TEXT`, `root_path TEXT`, `created_at INTEGER`) + DB migration in `src-tauri/src/db/migrations/`.
- New Tauri commands: `add_workspace` / `rename_workspace` / `delete_workspace` / `list_workspaces` (registered in `src-tauri/src/lib.rs`).
- TS Live Layer wraps Tauri `invoke` calls with Effect pattern (matching `ConversationService` / `MessageService` style in `shared/lib/tauri.ts`).

**D8-W3 — Settings.workspaces[] removed (no data migration)**
- Schema: Remove `workspaces: Array<{…}>` from `Settings` (Rust `src-tauri/src/settings.rs` + TS `src/shared/lib/types.ts`).
- Data: **No migration** — existing `Settings.workspaces[]` data is not carried to SQLite. Destructive; requires release note.
- Consumers: All workspace reads go through `WorkspaceService` (via `chatStore`).

**D8-W4 — Workspace.enabled field removed**
- Schema: Remove `enabled: boolean` from `Workspace` type (Rust + TS).
- Sandbox Violation semantics: "path not in **any** workspace directory" (was "any **enabled** workspace").
- Last-Used Workspace fallback: "第一个 workspace" (was "第一个 **enabled** 的 workspace").
- CodemanSidebar: show all workspaces (was "only enabled").

**D8-W5 — Workspace root_path immutable after creation**
- `addWorkspace` sets `root_path` once; no edit API.
- `WorkspaceCard` **deleted** (`src/features/settings/components/workspace-card.tsx` + test). Its 4 write operations (root_path edit, browse, enabled toggle, delete) are replaced per D8-W6.
- `pickWorkspacePath` only used for Add Workspace flow (OS folder picker), never for edit.

**D8-W6 — Workspace rename/delete UI moves to sidebar**
- `CodemanSidebar` (`shared/components/internal/codeman-sidebar.tsx`): hover workspace → show rename button + delete button.
- Delete: `workspace-delete-dialog.tsx` in `features/chat/components/` — confirmation dialog with secondary confirm button, calls `chatStore.removeWorkspace()`.
- Rename: `workspace-rename-dialog.tsx` in `features/chat/components/` — inline dialog with text input + confirm, calls `chatStore.renameWorkspace()`.
- New shared atoms enable both dialogs:
  - `shared/components/ui/dialog.tsx` — shadcn/ui-style Dialog primitive wrapping `@ark-ui/solid` `Dialog.Root` / `Dialog.Trigger` / `Dialog.Content` / `Dialog.Title` / `Dialog.Description`.
  - `shared/components/internal/codeman-dialog.tsx` — imperative wrapper exposing 3 functions:
    - `alert({ title, content, confirmText }): Promise<void>`
    - `confirm({ title, content, confirmText, cancelText }): Promise<boolean>`
    - `show<T>((resolve: (value: T) => void) => node): Promise<T>`
  - `codeman-dialog` is the **2nd** `internal/` component after `codeman-sidebar`. Must be prop-driven, no feature-store dependency .

*Note (amended later)*: `Dialog.show<T>` 同样服务于 **form dialogs**（不限于 workspace rename/delete 等 confirm dialogs），如 settings 域 `createProviderFormDialog()`——renderFn 闭包内持 form signals，Add → `resolve(Provider)`，dismiss → `resolve(null)`。两类消费（confirm / form）共用同一 `@ark-ui/solid` Dialog 原语，互不冲突。

### D8-W6 反转记录 (2026-07-25)

**用户反馈**：sidebar 行操作应内联到行位置，不弹模态。本反转覆盖以下决策：
- **delete**：从 `Dialog.confirm()` modal → `RowActions` inline-confirm overlay（原 commit `9f97d8f`）
- **rename**：从 `Dialog.show()` modal（`workspace-rename-dialog.tsx`）→ `RowActions` inline edit-in-place（本轮 commit `646445d` + 清理 commit）
- **统一实现**：新建 `RowActions` 组件（`src/features/chat/components/row-actions.tsx`）三状态机 `idle | confirming-delete | editing`，供 workspace + conv 行共用，取代 `WorkspaceActions` + `ConvDeleteAction` + `workspace-rename-dialog` 三件套。
- 后续 wave 可能需要在其他 sidebar 行类型（future conversations-of-folder 等）扩展 RowActions 的 `kind` 枚举。

**D8-W7 — chat.store.ts public API shape**
- **Effect-returning methods** per + CONTEXT.md "Bridge":
  - `chatStore.addWorkspace(): Effect.Effect<Workspace | null, AppError, never>` — OS picker → `WorkspaceService.add` → `setStore`.
  - `chatStore.removeWorkspace(id: string): Effect.Effect<void, AppError, never>` — confirm dialog → `WorkspaceService.remove` → `setStore` (CASCADE-deletes all conversations per SQLite FK).
  - `chatStore.renameWorkspace(id: string, label: string): Effect.Effect<void, AppError, never>` — rename dialog → `WorkspaceService.rename` → `setStore`.
  - `chatStore.pickWorkspacePath(): Effect.Effect<string | null, AppError, never>` — OS folder picker (reused for Add Workspace only).
- `chatStore.setSelectedWorkspaceId(id: string | null): void` — local reactive state in `createStore` (Home picker draft).
- ~~`setLastUsedWorkspaceId` REMOVED~~ — App launch always shows Home (no persistence of last workspace).
- `chatStore.enabledWorkspaces$(): Accessor<Workspace[]>` — derived accessor (all workspaces, no `enabled` filter).
- **UI consumer pattern**: `await Effect.runPromiseExit(chatStore.xxx(...))` + `Exit.match(...)`. UI never imports `WorkspaceService` directly.
- Existing conversation methods (`sendMessage`, `createConversation`, etc.) follow same pattern.

## Consequences

### Positive

- Naming drift fixed (docs match code).
- Hand-rolled Select (~500 LOC of bug-prone positioning/keyboard/ARIA code) replaced by ~80 LOC wrapper + ~3-5 KB gzipped dep.
- Two consumer wins: HomeAgentForm card-grid (heavy, scales poorly to 50+ workspaces) → dropdown (compact, scales linearly); ChatView native `<select>` (no groups) → grouped Select (cleaner provider grouping).
- unblocks 18 atomic commits in V2.1 polish wave 2.

### Negative

- New runtime dep (`@ark-ui/solid`). Maintenance burden if upstream renames components.
- Custom `Action` button not in listbox role = screen reader may not announce it as listbox action. Documented; V2.2 may revisit.
- Ark UI is a moving target (renamed `Listbox`→`List` in v5, `Value`→`ValueText`). Pin minor (`^5.37.0`); audit on major bump.

### Cross-file impact

| File | Change |
|---|---|
| `docs/adr/0023-...md` | This ADR |
| `package.json` + `pnpm-lock.yaml` | + `@ark-ui/solid@^5.37.0` |
| `shared/components/ui/codeman-select.tsx` | NEW (~80 LOC wrapper) |
| `shared/components/ui/codeman-group-select.tsx` | NEW (~100 LOC wrapper) |
| `shared/components/internal/agent-sidebar.tsx` → `codeman-sidebar.tsx` | RENAME (atomic) |
| `features/chat/components/home.tsx` | Replace WorkspaceCard grid with `<CodemanSelect>`; reorder layout (textarea top + workspace/LLM row + Send separate); add `<CodemanGroupSelect>` for LLM picker; Action slot wired to picker |
| `features/chat/components/chat-view.tsx` | Migrate ProviderSelect to `<CodemanGroupSelect>` |
| `CONTEXT.md` | Update "组件" section + add "Add Workspace" + "Workspace Label Derivation" + extend "Last-Used Workspace" + extend `appStore` API |
| `docs/adr/0022-...md` | 1-paragraph pointer to |
| `src/AGENTS.md` + `src/shared/AGENTS.md` + `src/features/chat/AGENTS.md` | Update lookup tables |
| `e2e/helpers.ts` + `e2e/10-home-agent.spec.ts` | Migrate selectors + extend for picker-added workspace flow |
| `shared/lib/derive-label-from-path.ts` + `.test.ts` | NEW (~8 LOC + ~10 tests) |
| `shared/stores/app.store.ts` | + `addWorkspace(rootPath): Workspace \| null` method |
| `shared/stores/app.store.test.ts` (if absent, + new) | + tests for `addWorkspace` (dedup, label derivation, settings mutation, scheduleSave) |

Total: 15+ files; 22 atomic commits (D6-H series ~5 commits) + D7-CS series (~3 commits); reversible within 1 PR.

### D7-CS Cross-file impact

| File | Change |
|---|---|
| `docs/adr/0023-...md` | + D7-CS block (this amendment) |
| `shared/components/internal/codeman-sidebar.tsx` | Refactor: `workspaces`+`items`+`selectedWorkspaceId`+`onSelectWorkspace` → `nodes: WorkspaceNode[]`; 接入 `@ark-ui/solid` `Accordion.Root/Item/ItemTrigger/ItemContent`（D7-CS8）；semantic data attrs（`data-workspace-id`、`data-conv-id`）；empty-state click；chevron rotation via `group-data-[state=open]/item:rotate-90` |
| `shared/components/internal/codeman-sidebar.test.tsx` | Rewrite `defaultProps` to use `nodes`; mock `@ark-ui/solid` Accordion (per codeman-select.test.tsx 模式)；new tests: expand/collapse toggle, empty-state click, semantic attrs |
| `features/chat/routes/index.tsx` | Replace `workspacesFromApp` + `itemsFromConversations` with `buildSidebarNodes`; remove `handleSelectWorkspace`; add `handleEmptyWorkspaceClick` (D7-CS6) |
| `e2e/09-per-conv-runtime.spec.ts` | Full rewrite selectors: `aside [data-workspace-id="ws-X"] [data-conv-id="conv-Y"]` + `aria-current="page"` + `aria-label="streaming"` |
| `CONTEXT.md` "组件" section | + "Cascade Sidebar Display" term（含 Ark UI Accordion 标注） |

Total D7-CS: 6 files; ~3 atomic commits; reversible within 1 PR.

### D8-W Cross-file impact (supersedes D6-H rows)

| File | Change |
|---|---|
| `docs/adr/0023-...md` | + D8-W block (this amendment); D6-H superseded |
| `src/features/chat/stores/chat.store.ts` | RENAME from `conversations.store.ts`; + workspace CRUD methods (D8-W7) |
| `src/features/chat/stores/chat.store.test.ts` | RENAME; + workspace method tests |
| `src/features/chat/lib/workspace-service.ts` + `.test.ts` | NEW (Effect Context.Tag + Live Layer; ~60-80 LOC + tests) |
| `src-tauri/src/db/workspaces.rs` | NEW (Rust struct + CRUD impl) |
| `src-tauri/src/db/mod.rs` | Register `workspaces` table |
| `src-tauri/src/db/migrations/<seq>_workspaces.sql` | NEW (CREATE TABLE workspaces migration) |
| `src-tauri/src/lib.rs` | Register `add_workspace` / `rename_workspace` / `delete_workspace` / `list_workspace` Tauri commands |
| `src-tauri/src/settings.rs` | Remove `workspaces` field from `Settings` struct |
| `src/shared/lib/types.ts` | Remove `workspaces` from `Settings` interface; remove `enabled` from `Workspace` |
| `src/shared/lib/tauri.ts` | Add `WorkspaceService` Tag + Live Layer + invoke wrappers |
| `src/shared/stores/app.store.ts` | Remove `pickWorkspacePath` / `addWorkspace` / `setLastUsedWorkspaceId` / implicit `workspaces` write path |
| `src/shared/components/ui/dialog.tsx` + `.test.tsx` | NEW (shadcn/ui-style Ark UI Dialog primitive; ~60-80 LOC) |
| `src/shared/components/internal/codeman-dialog.tsx` + `.test.tsx` | NEW (imperative `alert`/`confirm`/`show` wrapper; ~50-70 LOC) |
| `src/shared/components/internal/codeman-sidebar.tsx` | + hover rename/delete buttons; + dialog trigger integration |
| `src/shared/components/internal/codeman-sidebar.test.tsx` | + tests for hover buttons + rename/delete flows |
| `src/features/chat/components/workspace-rename-dialog.tsx` + `.test.tsx` | NEW (~50-70 LOC) |
| `src/features/chat/components/workspace-delete-dialog.tsx` + `.test.tsx` | NEW (~50-70 LOC) |
| `src/features/chat/routes/index.tsx` | Replace `appStore.workspaces` reads with `chatStore` reads |
| `src/features/chat/components/home.tsx` | Replace `appStore` workspace reads with `chatStore` |
| `src/features/settings/components/workspace-card.tsx` + `.test.tsx` | **DELETED** |
| `src/features/settings/routes/settings.tsx` | Remove WorkspaceCard rendering |
| `src/features/chat/AGENTS.md` | + workspace to chat domain (workspace-service + chat.store rename + rename/delete dialogs) |
| `src/features/settings/AGENTS.md` | - WorkspaceCard from inventory |
| `src/AGENTS.md` + `src/shared/AGENTS.md` | Update lookup tables |
| `CONTEXT.md` | Rewrite Workspace, Workspace-Bound Conversation, Add Workspace, Workspace Label Derivation, Last-Used Workspace, Sandbox Violation terms; remove workspaces from Settings schema; add Chat Store + Codeman Dialog terms |
| `e2e/10-home-agent.spec.ts` | Rewrite workspace-related selectors for sidebar rename/delete |
| `e2e/09-per-conv-runtime.spec.ts` | Update workspace ID references (no enabled filter) |
| `docs/translation-rules.md` | Possibly n/a (no CJK changes) |

Total D8-W: 28+ files; ~10 atomic commits; ~4-6 hours.

### Reversibility

Within 1 PR (V2.1 polish wave 2): revert `codeman-*` files → `agent-sidebar`, revert Ark UI import → hand-rolled or alternative. AGENTS.md lookup tables revert. ~150 LOC of pure Select wrapper code disappears. D6-H Home Add Workspace amendment reverts by: (a) `appStore.addWorkspace` → inline `appStore.set({ workspaces })` in HomeAgentForm (revert to settings.tsx pattern);(b) `derive-label-from-path.ts` removed；(c) Home layout reverts to workspace picker top + textarea below。CONTEXT.md revert strips 3 new terms。

D7-CS Cascade Sidebar amendment reverts by: (a) `CodemanSidebar` `nodes` prop → 原 `workspaces` + `items` 双 props + `selectedWorkspaceId` + `onSelectWorkspace`；(b) `@ark-ui/solid` `Accordion.Root/Item/ItemTrigger/ItemContent` 接入 → 退回到手写 `<For>` + `<Show>` + `createSignal<string | null>(null)` `expandedWorkspaceId`；(c) `routes/index.tsx` `buildSidebarNodes` 拆回 `workspacesFromApp` + `itemsFromConversations`；(d) `handleSelectWorkspace` 恢复（写 `last_used_workspace_id`）；(e) spec 09 selectors 退回 `aside li[data-conv-idx="N"]` flat 索引；(f) `CONTEXT.md` "Cascade Sidebar Display" term 删除。

D8-W Workspace Chat-Ownership Migration reverts by: (a) `chat.store.ts` → `conversations.store.ts` (old path)；(b) `workspace-service.ts` + Rust SQLite workspaces table + Tauri commands **deleted**；(c) `appStore.pickWorkspacePath` / `addWorkspace` / `setLastUsedWorkspaceId` 恢复 (back to D6-H)；(d) `Settings.workspaces[]` 字段恢复；(e) `WorkspaceCard` 重新创建；(f) `codeman-sidebar` hover rename/delete buttons + dialogs deleted；(g) `shared/components/ui/dialog.tsx` + `internal/codeman-dialog.tsx` kept (generic atoms, not workspace-specific)；(h) CONTEXT.md 恢复 D6-H era glossary entries。Rust DB migration reversal requires **manual** rollback (DROP TABLE workspaces)，not auto-reversible；recommend separate rollback migration.

## References

- — internal components + design tokens (this ADR adds D4-S + D5'-N, governs naming)
- Q4 — ui vs internal folder boundary (codeman-* rule is `internal/`-specific)
- — service-in-store rule (codeman-* components are pure props-driven, no IPC)
- CONTEXT.md "组件" — Codeman Component + UI Primitive glossary entries (Cascade Sidebar Display per D7-CS)
- https://ark-ui.com/solid/docs/components/select — official Select docs
- https://ark-ui.com/llms-solid.txt — full LLM-friendly API surface
- https://github.com/chakra-ui/ark — Zag.js FSM source
- Re-grill-with-docs session 2026-06-27 (4 critiques → 7 decisions → R1/R2 confirmations)
- Re-grill-with-docs session 2026-06-28 (10 decisions → D7-CS cascade sidebar block)
- Re-grill-with-docs session 2026-06-28 (9 decisions → D8-W workspace chat-ownership block, this amendment)