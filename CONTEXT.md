# codeman-agent — 项目语境

独立 Windows 桌面 AI 智能体，基于 Electron (Node main + Chromium renderer) + Solid.js + TypeScript + Effect-TS，运行时采用 pi-mono (`@mariozechner/pi-ai` + `@mariozechner/pi-agent`)。主窗口是 LLM 对话 (`/`)，设置走 `/settings` 路由（TanStack Router），内置 2 个计费工具（`get_balance`、`get_plan_quota`，覆盖 DeepSeek 与 MiniMax）和 5 个文件工具（`read_file` / `write_file` / `edit_file` / `search_files` / `delete_file`）。本文档固定词汇表，确保 plan、code 与 commit message 保持一致。V3 起壳由 Tauri 2 迁至 Electron（ADR-0024），UI / 逻辑层 / Agent runtime / 持久化 schema 全保留。

## 词汇表

### 领域

- **Agent (代理)** — 产品本体。LLM 驱动的助手，运行在独立 Windows 桌面窗口中。_避免_：widget、app、client。
- **Conversation (会话)** — 用户拥有的持久聊天线程。线性消息序列；不支持分支。每 Conversation 至多 1 个 active 流，多 Conversation 可并行 streaming。每个 Conversation 创建时绑定 1 个 workspace (`workspace_id: string`，详见 `Workspace-Bound Conversation`)；旧 conv (V1.x 迁移) `workspace_id = ""` 视为 "needs workspace"，UI 灰标。active 流定义：`run()` 已调用且 `done` / `error` / `cancel` 之一尚未触发。active 流的取消走 `AgentRuntime.cancel(conversationId)`。
- **Message (消息)** — 会话中的单轮消息。角色为 `user`、`assistant`、`tool` 或 `system` 之一。可能内联携带 tool call 与 tool result（JSON 形式）。
- **Tool (工具)** — Agent 可调用的类型化函数。内置 2 个计费工具 + 5 个文件工具；注册表可扩展。
- **Tool Call (工具调用)** — LLM 请求调用工具的指令。携带工具名与 JSON 参数。
- **Tool Result (工具结果)** — 工具调用的返回值。可能携带类型化错误。
- **Snapshot (快照)** — 计费提供方状态的时点视图。判别联合类型：`Balance { amount, currency, auto_recharge }` 或 `PlanQuota { remaining, total, expires_at?, daily_avg? }`。由计费工具返回。

### Providers

- **Provider (提供商)** — 公司维度的统一记录，承载一种或多种"对外能力"。一条记录 = 一家公司。shape: `{ id, label, enabled, api_key, llm: {...}, billing?: {...} }`。`api_key` 是该 provider 的对外调用凭据（明文存于 Settings JSON，见 ADR-0015）；`llm` 必选，`billing` 可选。_避免_：client、vendor、service。
- **Provider.llm (LLM 能力)** — Provider 必选子对象。shape: `{ default_model, base_url, api_type, models, models_endpoint }`。`api_type` 锁 `"anthropic-messages"`；`models: ModelMeta[]` 用户在 Settings 中可编辑；`models_endpoint: string` provider 维度的模型列表拉取 URL。**不变量**：`default_model` 始终是 `models` 数组中某个元素的 `id` 或 `""`（见 Default Model Invariant，ADR-0016）。Agent 的"燃料"。pi-ai 调 LLM 时 `Authorization: Bearer <Provider.api_key>`。_避免_：model provider、API provider、AI provider。
- **Provider.billing (计费能力)** — Provider 可选子对象。shape: `{ kind }`。`kind` = `"balance" | "plan_quota"`。Agent 的一级工具目标。billing adapter 调计费端点时复用 `Provider.api_key` 作 `Authorization: Bearer`。_避免_：billing source、计费源。
- **Protocol (协议)** — LLM 上游调用的 HTTP/SSE 形态。锁定 anthropic-messages（Anthropic Messages API 的请求/响应形状）；pi-ai 按 `api` 字段路由到对应 transport 实现。_避免_：API format、API type（实现细节）、wire format。
- **Adapter (适配器)** — 每个计费提供方的 HTTP 客户端与响应解析器，将 API key 转换为 `Snapshot`。位于 TS 端 (`src/features/billing/lib/adapters/`)：deepseek 仅实现 `balance`，minimax 实现 `plan_quota`（balance 端点未公开验证）。_避免_：HTTP client（过载）。
- **ModelMeta (模型元数据)** — `Provider.llm.models[]` 元素。shape: `{ id, label, context_window?, deprecated?, thinking? }`；用户在 Settings 中可增删编辑。`ProviderService.getModels(id)` 静态读出此列表（读 settings）；`ProviderService.fetchModels(id)` 调 `models_endpoint` 拉最新（OpenAI-compatible `/v1/models` 格式，`label` 默认 = `id`）。_避免_：model config、model info。
- **Models Endpoint (模型列表端点)** — `Provider.llm.models_endpoint`。per-provider 可配置 URL，用于 `fetchModels()` 拉模型列表。
- **Default Model Invariant (默认模型不变量)** — `Provider.llm.default_model` 始终是 `Provider.llm.models` 数组中某个元素的 `id`，或 `""`（models 为空时）。`appStore.refreshProviderModels` 在写 state 时强制执行：若 `default_model` 不在新数组中且数组非空，改成 `models[0].id`；若数组为空，改成 `""`（ADR-0016）。防止 UI dropdown 跳到默认第一项而 store 里 `default_model` 仍是无效值的"UI 看似 OK / store 不一致"的 bug。
- **Balance (余额)** — 计费提供方持有的可充值信用池。时点状态，可充值。
- **Plan Quota (用量)** — 套餐附带的固定、不可充值的配额。随使用减少，周期重置，不可充值。

### File IO

- **Workspace (工作区)** — 用户在 file tool 中操作的根目录，由 chat feature 管理（`WorkspaceService` + SQLite 持久化，per ADR-0023 D8-W）。创建后 `root_path` 不可变。**每个 Conversation 绑定 1 个 workspace** (per-Conv, `Conversation.workspace_id` 必填，详见 `Workspace-Bound Conversation`)；agent 的 file tool 仅在该目录树下操作，越界 (canonical path 不在任何 workspace root 内) 由 Electron Main process handler 拒绝 (返回 `SandboxViolation` 错误)。_避免_: sandbox、root directory、project root。
- **Workspace-Bound Conversation (绑定 workspace 的会话)** — 每个 Conversation 在创建时 (`createConversation(workspaceId, ...)`) 必须绑定 1 个 workspace (`workspace_id: string` 字段)，创建后不可更改。`workspace_id = ""` 表示 "needs workspace" (V1.x 迁移的旧 conv 状态，UI 灰标)。该绑定决定 file tool 沙箱边界；Home 上的 workspace 选择器决定新 conv 的绑定。_避免_: global workspace、workspace 切换 (per-Conv 锁定后不存在切换)。
- **Add Workspace (添加 Workspace)** — 用户在 Home 的 workspace picker dropdown 中通过 "+ Add new workspace…" Action slot 触发；调 `chatStore.pickWorkspacePath()` 弹 OS 原生 folder picker；picker 关闭后若返回非 null 路径，调用 `chatStore.addWorkspace(rootPath)` → `WorkspaceService.add`（SQLite 持久化）+ 自动派生 label（`deriveLabelFromPath`）+ dedup（同 root_path 重复时静默忽略并自动选已有）+ 关闭 dropdown + focus textarea。Home **不**再跳 /settings。_避免_: Navigate-to-Settings（V2.1 polish 早期设计，已废止）。
- **Workspace Label Derivation (workspace label 派生)** — 通过 OS folder picker 添加 workspace 时（`Add Workspace` 流程），`label` 从 `root_path` 自动派生：调用 `deriveLabelFromPath(rootPath)` (位于 `src/shared/lib/derive-label-from-path.ts`) 取路径最后非空段作为 label；空结果（`C:\`、`/`）fallback `"Untitled workspace"`。后续用户可通过 sidebar hover → Rename 按钮修改 label。_避免_: 强制用户在 picker 关闭后输入 label（增加 UI 阻塞；违反"calm/professional"原则）。
- **File Tool (文件工具)** — pi-agent 工具族，内置 5 个: `read_file` (读全文) / `write_file` (覆盖写) / `edit_file` (替换文本，支持 `replace_all`) / `search_files` (glob + content 搜索) / `delete_file` (移至回收站)。所有工具通过 IPC 调 Electron Main process 的 `node:fs`，沙箱由 workspace 边界约束。_避免_: fs tool、file operation (过载)。
- **Sandbox Violation (越界错误)** — Electron Main process 在 `fs.realpath(path)` 后检测到 `path` 不在任何 workspace 目录下时返回的错误。Agent 收到后必须重新规划 (改路径 / 让用户加 workspace) 而非重试原路径。V3 起语义不变；实现从 Rust `std::fs::canonicalize` 改为 Node `fs.realpath.native` (per ADR-0024)。

### 架构

- **Runtime (运行时)** — 包装 pi-mono agent loop 的**纯工厂函数** `createAgentRuntime()`。无 `Context.Tag` service、无 Layer DI、无内部 Map（V2 起 per ADR-0019 supersede ADR-0014 D1）。每次调用 `createAgentRuntime()` 返回独立的 `AgentRuntime` 实体，存放在 `ConversationState.runtime`（per-conv 实例化）。`AgentRuntime.run({ context, provider })` 内部仍用 Queue-based Mailbox 架构（per ADR-0017）：`Queue.unbounded` 作为 event bus，`Effect.fork` 在子 fiber 里跑 `agent.subscribe + agent.prompt`，事件通过 `Queue.unsafeOffer` 推入；consumer 端 `Stream.fromQueue(queue)` 是 leaf operator。每次 `run()` 调用新建 pi-mono `Agent`，`initialState.messages = context`（store 来的浅拷贝，per ADR-0019 D2 "Agent 是 per-run transient"）；`AbortController` 注入 transport，`cancel()` 通过 `abortController.abort()` 触发 fetch abort。_避免_：agent core、agent loop、AgentRuntime service（旧 Context.Tag + Layer 设计）。
- **Per-Conversation Runtime (会话级运行时)** — 每个 Conversation 对应一个 `createAgentRuntime()` 产物（即一个 `AgentRuntime` 实体），存放在 `ConversationState.runtime`（`src/features/chat/stores/chat.store.ts` inline 定义）。生命周期跟随 Conversation：创建于 Conversation 首次 send 时（lazy），销毁于 Conversation 被 delete / archive。in-flight 流不被 cancel — 切换 Conversation 时 partial 进度保留在 `ConversationState.messages`（stream 订阅实时写）。同一 Conversation 至多 1 个 active 流；多 Conversation 可并行 streaming。_避免_：singleton Agent（旧 ADR-0014 D1 已被 supersede）、per-request Agent、Per-Conversation Agent（旧 term,已并入本词条）。
- **Conversation State (会话视图)** — `Conversation`（DB-backed 持久字段）+ per-conv reactive state（`messages: Message[]` + `streamingMessageId: string | null`）+ per-conv runtime（`runtime: AgentRuntime`）的组合类型。定义在 `src/features/chat/stores/chat.store.ts`（V2 起合并原 `messages.store` + `agent.store`，per ADR-0019 D3）。Solid `createStore<{ activeId: string | null; byId: Record<ConvId, ConversationState> }>` 管理反应式。UI 读 `store.byId[activeId()]` 拿到 reactive 视图；store 是 single source of truth，runtime 是 stateless LLM caller。_避免_：Per-Conv message signal（旧 `messages$` 全局 signal，已废止）、Agent Map（旧 `Ref<Map<ConvId, Agent>>`，已废止）。
- **Bridge (桥接层)** — 将 Effect `Stream` / `Effect` 输出翻译为 Solid `createStore` 的层。V2 起归口到 `chat.store.ts`：stream `runForEach` 订阅 → `setStore("byId", convId, ...)` 写 reactive state。UI 组件不 `import 'effect'`。_避免_：adapter（过载）。
- **Chat Store (聊天域 Store)** — `src/features/chat/stores/chat.store.ts`（原 `conversations.store.ts`, 重命名 per ADR-0023 D8-W）。chat feature 唯一响应式源：拥有 conversations（ConversationState byId + CRUD + sendMessage）+ workspaces（WorkspaceService 桥接 + CRUD + selectedWorkspaceId 派生状态）。**公开 API 返回 `Effect<T, AppError, never>`**（per ADR-0016 D4 + "Bridge"），UI 通过 `Effect.runPromiseExit(...)` + `Exit.match(...)` 消费。公开 AS `chatStore` namespace（`features/chat/index.ts` barrel）。_避免_: agent store、messages store（旧拆分已合并 per ADR-0019 D3）。
- **Effect Service (Effect 服务)** — 类型化异步模块，暴露 `Effect<A, E, R>` 或 `Stream<A, E, R>`。通过 Effect layer 组合；通过 mock layer 测试（`@effect/vitest`）。V2 起 chat 域不再用 Effect Service 模式承载 runtime（`createAgentRuntime` 是纯工厂函数而非 Context.Tag），但 DB 桥接仍用 Service 模式（`ConversationService` / `MessageService` in `shared/lib/ipc.ts`）。
- **IPC** — Electron 跨进程命令桥接。Main 端 handler 注册在 `electron/main/ipc.ts` 的 `ipcMain.handle(...)`；preload 通过 `contextBridge.exposeInMainWorld('codeman', api)` 暴露类型化 API；renderer 端包装在 `src/shared/lib/ipc.ts`（Service Tag + Live Layer）。Renderer 直接 import `window.codeman` 不出现；所有调用走 Service Tag。V3 起替代 V2 的 Tauri `invoke_handler` 桥接 (per ADR-0024)。

### 密钥

- **API Key (API 密钥)** — Provider 的对外调用凭据，shape 为 `Provider.api_key: string`。**明文存于 Settings JSON**（`%LocalAppData%\codeman-agent\settings.json`，由 `app.setPath('userData', '%LocalAppData%\\codeman-agent')` 锁定，per ADR-0024），与 Settings 其它字段同档；不再分 LLM / Billing 二分（ADR-0015）。LLM 调用和计费工具调端点都复用同一 key。V1 单机单用户威胁模型下接受明文；如未来需 OS 级密钥管理（keytar / Windows Credential Manager / Electron `safeStorage`）需重做 ADR-0015。_避免_：把 key 单独走 OS keychain 再走 IPC（V1.7+ 前的设计，已废止）。
- **Secret** — Rust 端 `Secret<String>` newtype，`Debug` / `Display` 打印 `Secret(***)` / `***`。V1.7+ 后 Settings JSON 明文存 key，`Secret` 主要用于 pi-agent 运行时构造 header 时临时包裹。**调用方**：`logger.*` / `log::*!` 不得打印完整 secret 值（任一语言）；`Secret` 类型自动重载 `Debug` / `Display`，裸字符串变量需手动 redact 为 `***`。V1.10+ 起本规则从"强制 redact"降级为 developer 自觉——理由是 simple logger API 与自动 redaction 实现冲突，详见 ADR-0018 D6。_避免_：对任何凭据使用裸 `String`。

### Settings 与状态

- **Settings (设置)** — 通过 `electron-store` 持久化的 JSON 文档，位于 `%LocalAppData%\codeman-agent\`（由 `app.setPath('userData', ...)` 显式锁定，与 V2 Tauri 路径对齐，per ADR-0024）。包含统一 `providers[]` 数组（每条 `Provider` 含 `api_key` 明文字段，见 ADR-0015），以及 window / theme / system_prompt / conversations / user_language / start_at_login 等字段。`workspaces` 已从 Settings 移出，改由 `WorkspaceService`（SQLite 持久化，per ADR-0023 D8-W）。**API 密钥现在直接落在 Settings JSON 内**（V1.7+ 之前的"分 store 命名空间"模型已废止）。
- **App Store (全局应用状态)** — `src/shared/stores/app.store.ts` 提供的 Settings reactive 桥接层（ADR-0015 + ADR-0016）。`createStore` 包装 settings。公开 API（7 个）：
  - `appStore.state.value` — reactive 读
  - `appStore.set(patch)` — 写 state，**不**触发 IPC（debounce 由 `features/settings/lib/settings-saver` 触发）
  - `appStore.forceFlush()` — 跳过 debounce 立即 IPC（footer Save 调用）
  - `appStore.refresh()` — 从后端重载
  - `appStore.refreshProviderModels(id)` — 调 `ProviderService.fetchModels` 拉新 models 列表并写 state（含 `default_model` 自动 fallback 不变量）
  - `appStore.deleteProvider(id)` — 从 `providers[]` 移除指定记录
  - `appStore.clearAllHistory()` — 清 SQLite conversation 表（settings 路由 advanced tab 调用）

  **D4 硬规则（ADR-0016）**：**所有** service 操作（`Effect.gen(...yield* Service...)` / 裸 `invoke("...")` / 裸 `fetch`）只能在 Store 中出现。组件层 `.tsx` 文件**禁止**直接 import service 或调 IPC，全部走 `Effect.runPromiseExit(store.method(...))` + `Exit.match`。测试代码（`*.test.ts*`）不受 D4 约束。

- **Stale (过期)** — `Snapshot` 时间戳超过 Billing Provider 的 `stale_after_seconds`；传统的"过期徽标"语义在 tool result 缓存场景保留。
- **Last-Used Workspace (上次使用的 workspace)** — **已删除**（per ADR-0023 D8-W）。每个 app 启动总是进入 Home；用户每次手动选 workspace。无持久化。_避免_: 重新引入该字段（无业务价值）。

### 样式

- **Utility Class (工具类)** — Tailwind v4 utility-first CSS 类（例如 `flex h-screen bg-zinc-50`）。唯一的视觉层；每个组件的外观都通过 utility class 表达。_避免_：BEM class、atomic CSS、scoped CSS。
- **Theme (主题)** — 用户在 Settings 中选择的三态视觉模式（`light` / `dark` / `system`）；通过 `<html class="dark">` 切换（无 `prefers-color-scheme` 媒体查询 —— `system` 模式由 `src/shared/stores/theme.ts` 中的 Solid effect 读取）。_避免_：color scheme、appearance、mode。
- **Style Token (样式令牌)** — 在 `@theme` 块中定义的语义名（例如 `primary-500`、`zinc-900`），组件引用而非裸 hex。_避免_：design token（与 Material / Apple / IBM 词汇过载）、CSS variable（实现细节）。

### 组件

- **Codeman Component (codeman-* namespace)** — `shared/components/internal/` 目录下所有组件文件以 `codeman-` 为前缀（如 `codeman-sidebar`）。命名空间规则由 [ADR-0023](./adr/0023-codeman-prefix-and-ark-ui-select.md) D4-N 锁定（从 ADR-0022 治理权迁移）。`internal/` 准入条件 + prop-driven 强约束保留（每个 codeman-* 组件必须纯 props 输入，不依赖任何 `features/*/stores/*`）。_避免_：feature-prefixed 命名（如 `agent-sidebar` / `settings-panel`），破坏跨域复用识别。
- **UI Primitive (design system atoms)** — `shared/components/ui/` 目录下的纯展示组件（Button / Card / Checkbox / Input / Textarea / **Select** / **Dialog** / ...）。Select 由 [ADR-0023](./adr/0023-codeman-prefix-and-ark-ui-select.md) D4-S 引入：基于 `@ark-ui/solid@^5.37.x` 的两个 wrapper：
  - `codeman-select.tsx` — single-list Select，props = `options: {label, value}[]` + `value: string | null` + `onChange: (value) => void` + 可选 `Action` slot（用于"+ Add new" 等非 option 元素，放 `<Select.List>` 之后、`Select.Content` 内部，下方加 `<hr role="separator">`）
  - `codeman-group-select.tsx` — grouped Select，props = `groups: Array<{label, options: {label, value}[]}>`,使用 `Select.ItemGroup` + `Select.ItemGroupLabel` 实现 provider 分组等场景

  Action slot 走 `useSelectContext().setOpen(false)` 关闭 dropdown；不是 listbox role，**不可通过 ↑/↓ 键到达**（折衷，V2.2 考虑 composite role）。_避免_：手写 Select 基础设施（Popover / portal / 键盘 / ARIA / Floating UI 定位），全部由 `@ark-ui/solid` 提供；不要引入 Radix / Kobalte / 其它 headless 库。
- **Codeman Dialog (codeman-dialog 命令式 Modal)** — `shared/components/internal/codeman-dialog.tsx`（ADR-0023 D8-W6 引入，第 2 个 `internal/` 组件）。基于 `shared/components/ui/dialog.tsx`（`@ark-ui/solid` Dialog 原语包装的 shadcn/ui 风格通用 Dialog）。暴露 3 个命令式函数：`alert({ title, content, confirmText }) → Promise<void>`, `confirm({ title, content, confirmText, cancelText }) → Promise<boolean>`, `show<T>((resolve: (value: T) => void) => node) → Promise<T>`。纯 prop-driven，不依赖 feature stores。用于 workspace rename/delete dialog 等确认对话框。_避免_：手写 dialog（@ark-ui/solid 提供 ARIA + 键盘 + focus trap）。
- **Cascade Sidebar Display (级联 sidebar 显示)** — `CodemanSidebar` 的视觉结构，由 [ADR-0023](./adr/0023-codeman-prefix-and-ark-ui-select.md) D7-CS 锁定。Workspaces 和 Conversations 渲染为**嵌套 tree**（每个 `WorkspaceNode` 含 `children: ConvNode[]`），**accordion 模式**——同一时刻至多 1 个 workspace 展开其 conversations，由 `@ark-ui/solid` 的 `Accordion.Root`（`multiple={false}` + `collapsible={true}`）承载（D7-CS8）。展开状态由 Ark UI 内部 zag-js state machine 管理（uncontrolled via `defaultValue={[]}`），`CodemanSidebar` **不持有展开 signal**，符合 ADR-0022 D3「codeman-* 组件严格 prop-driven」。Workspace **永远不 active**（无 `selectedWorkspaceId` prop）；只有 Conversation 可以 active（`selectedItemId`）。V1.x 迁移遗留 `workspace_id === ""` 的 convs 在 cascade 中不显示（与 V2.1 wave 1 行为一致）。空 workspace 展开后渲染可点击 `<button data-empty-workspace-id>` 文本「该 workspace 暂无会话」（CTA = `setLastUsedWorkspaceId(wsId)` + `clearActiveConversation()`，落到 HomeAgentForm 该 workspace 预选）。  语义属性：`data-workspace-id` / `data-conv-id` / `aria-expanded` / `aria-current="page"`，e2e 选择器契约。视觉指示：lucide `ChevronRight` 通过 Tailwind `group-data-[state=open]/item:rotate-90` 旋转 90°表示展开（D7-CS7）。_避免_：V1.x flat `data-conv-idx` 索引（已在 spec 09 重写时废止）；always-expanded tree（多 workspace 滚动条地狱）；sidebar 写 `last_used_workspace_id`（与 HomeAgentForm draft 解耦后由 HomeAgentForm 独占）；手写 accordion state machine（用 Ark UI 避免）。

### 测试

- **Fake LLM Provider (假 LLM Provider)** — e2e 测试专用的 Provider 记录，`base_url` 以 `mock://` 开头（典型值 `mock://test`）。shape 与真实 Provider (`minimax` / `deepseek`) 完全一致（同 `id` / `label` / `api_key` / `llm.{base_url, default_model, models, ...}` 字段），由 `AnthropicTransport` 通过 `baseUrl.startsWith("mock://")` 识别后跳过 HTTP，改读 Q→A Table 出 SSE 字符串。生产构建中检测点存在但 Q→A Table 未加载（`CODEMAN_TEST_QA_TABLE` 环境变量未设），等价 no-op。e2e 设置走 `update_settings` IPC 或 Settings UI，路径与真实 Provider 注册一致（无 bypass 代码路径）。V3 起 IPC 实现从 Tauri command 变为 Electron `ipcMain.handle('update_settings', ...)`；fake-provider 识别点与 bypass 路径不变 (per ADR-0024)。_避免_：进程内 JS shim（V1 `mockStreamTurn` 用 `__MOCK_LLM_QUEUE__` window global 模式，已废止）；为测试单写 Electron IPC handler；wiremock / 独立 HTTP server；任何「把 mock 藏在 transport 之外」的进程间方案。
- **Mock Marker URL (mock://)** — 触发 Fake LLM Provider 分支的 base_url 前缀。继承 V1 约定，`anthropic-transport.ts` 中 `baseUrl.startsWith("mock://")` 是 codebase 唯一识别点；非测试不另起 prefix（避免识别点分裂）。_避免_：新增 `test://` / `qa://` / `fake://` 任何 parallel marker。
- **Q→A Table (Q→A 表)** — e2e 测试 fixture，`CODEMAN_TEST_QA_TABLE` 环境变量指向 per-worker 路径，典型 `e2e/fixtures/qa-w{N}.json`（N = `workerInfo.parallelIndex`）。Electron Main process 启动时一次性加载到内存 hash map，**不在运行时重读**（reload 不在 scope，避免文件 mtime race + 简化语义）。V3 起加载位置从 Rust `src-tauri/src/lib.rs` 启动钩子变为 Node `electron/main/index.ts` 启动钩子 (per ADR-0024)。Shape：顶层 `QaEntry[]` JSON 数组。
- **Q→A Entry (Q→A 条目)** — Q→A Table 单条记录，shape: `{ question: string, answer: string, default?: true }`。
  - `question` — 跟 user message content 做 **substring 匹配**（case-sensitive），first-wins 命中。
  - `answer` — 预格式化 Anthropic API SSE 字符串（典型 `"data: {...}\n\ndata: {...}\n\n..."`），transport 原样 emit byte-for-byte（不经 `parseSseLine`，不经 `JSON.parse`）。可包含 `message_start` / `content_block_start` / `content_block_delta` / `content_block_stop` / `message_delta` / `message_stop` / `ping` 任一事件 —— 因此 text 流式 chunk + tool_use 块都天然支持（与 V1 `mockStreamTurn` 同覆盖度）。
  - `default?: true` — fallback 标记。`substring` miss 且无 default 命中时，transport 主动 throw `QaTableMissError`（避免静默漏测）。同一文件可含多个 `default: true` entry（按数组顺序 first-wins）。
- **Per-Worker Q→A Isolation (per-worker Q→A 隔离)** — Playwright 4 worker 并行跑，每个 worker 拥有独立 SQLite（`.w{N}.db`）+ WebView2 state + Settings JSON（per `e2e/fixtures.ts` 的 `CODEMAN_TEST_WORKER` 隔离模式）；Q→A Table 同样 per-worker 隔离。**约束**（因一次性加载）：同一 worker 内多个 spec 共用同一 Q→A Table；各 spec 须确保 `question` 字符串在 worker 内 unique，否则 first-wins 会让一个 spec 意外命中另一个 spec 的 entry（漏测的另一面）。_避免_：跨 worker 共享 Q→A Table（破坏 per-worker 隔离语义）；Q→A 文件运行时重写（首次加载后表视为 immutable）。

### Localization

- **Developer Language (开发者语言)** — 标识符、注释、治理文档的语言。分层：identifier 保持英文（与 Electron / Solid / Effect-TS / pi-mono / Tailwind / Vite / Vitest / Playwright 生态对齐），prose 与注释走中文。Canonical 词汇表是 `CONTEXT.md`。_避免_：bilingual inline annotations、翻译 identifier。
- **User Language (用户语言)** — UI 字符串（按钮 / 错误 / 提示）的语言。通过 `Settings.user_language: "zh" | "en" | "auto"` 配置。没有 i18n runtime；UI 字符串硬编码英文，与该设置解耦。_避免_：作为代码注释翻译的副作用改动 UI 字符串。
- **Test Description (测试描述)** — `it("xxx")` / `test("xxx")` 中描述测试目标的可读字符串。出现在测试报告中。约定：**中文**（例如 `it("可以保存 LLM API key")`）。_避免_：新测试使用英文 test description。
- **Assertion (断言)** — 测试体内的 runtime 检查，例如 `expect(x).toBe(y)`。**锚定 UI 字符串时英文**（必须与 UI 完全一致），**fixture 数据时中文**（例如 `toHaveBeenCalledWith({ content: '你好' })`）。_避免_：当底层值是 UI 字符串时使用中文断言字符串（运行时会失败）。
- **UI String (UI 字符串)** — 渲染 UI 中展示的文本（按钮标签、placeholder、错误信息、aria-label）。始终输出英文 UI 字符串，与 `user_language` 无关。注释翻译工作不动 UI 字符串；未来 i18n 工作独立追踪。
- **Developer String (开发者字符串)** — 写入日志、console、panic 消息或 `Result::Err` 变体（不向用户展示）的字符串字面量。约定：**中文**。_避免_：新代码使用英文 log message（破坏 grep 一致性）。
- **Translation Rules (翻译规则)** — 操作手册，位于 `docs/translation-rules.md`。包含品牌名保留、术语映射表、标点规则、注释格式。翻译工作流以此文档为一致性约束。

## Domain shape

```
Agent
  ├── runtime          (createAgentRuntime() 工厂, per-conv 实例化 per ADR-0019)
  ├── bridge           (Effect → Solid createStore 翻译器, conversations.store.ts)
  └── tools[]          (类型化函数；计费 + 文件工具)
        ├── get_balance(provider_id)             → Snapshot
        ├── get_plan_quota(provider_id)          → Snapshot
        ├── read_file(workspace_id, path)        → string
        ├── write_file(workspace_id, path, text) → void
        ├── edit_file(workspace_id, path, old, new, replace_all) → void
        ├── search_files(workspace_id, glob, pattern?) → FileMatch[]
        └── delete_file(workspace_id, path)      → void

Conversation          (src/shared/lib/types.ts, DB-backed)
  ├── id, title, system_prompt?, created_at, updated_at, archived_at?
  └── messages[]       (DB-persisted, 线性)
        ├── id, role, content
        ├── tool_calls[]    (assistant 调用工具时)
        ├── tool_results[]  (返回给 LLM 的结果)
        ├── model, input_tokens, output_tokens
        └── created_at

Conversation State    (src/features/chat/stores/chat.store.ts, V2 in-memory view)
  ├── (DB fields 镜像 Conversation)
  ├── messages[]               (Solid createStore reactive, per-conv 实时更新)
  ├── streamingMessageId       (当前 streaming 的 assistant msg id, 或 null)
  └── runtime                  (per-conv AgentRuntime 实例, createAgentRuntime() 产物)

Provider              (Settings.providers[].api_key + llm 必选 + .billing 可选, ADR-0015)
  ├── id, label, enabled
  ├── api_key: string                    ← 明文, 单一字段, LLM + billing 共用
  ├── llm: { default_model, base_url, api_type, models[], models_endpoint }
  └── billing?: { kind: "balance" | "plan_quota" }
```

## Settings

通过 `electron-store` 持久化（JSON 文件位于 `%LocalAppData%\codeman-agent\settings.json`，per ADR-0024）。完整 schema 位于 `electron/main/settings-schema.ts`（V3 起从 Rust `src-tauri/src/settings.rs` 迁移）；canonical TS 镜像位于 `src/shared/lib/types.ts`。`SettingsSchema.sanitize()` 钳制不变量（`auto_archive_after_days >= 1`、`max_history >= 10` 等）。

```ts
interface Settings {
  // A. Providers (统一记录：llm 必选，billing 可选)
  providers: Array<{
    id: string; // 预置 "minimax"
    label: string; // 人类可读名
    enabled: boolean;
    api_key: string; // 明文；LLM + billing 共用 (ADR-0015)
    llm: {
      // 必选
      default_model: string;
      base_url: string;
      api_type: "anthropic-messages";
      models: ModelMeta[]; // 用户可编辑的模型列表
      models_endpoint: string; // 拉取模型列表的 URL（per-provider 可配置）
    };
    billing?: {
      // 可选
      kind: "balance" | "plan_quota";
    };
  }>;

  // B. 默认行为
  default_llm_provider_id?: string;
  user_language: "zh" | "en" | "auto";
  theme: "light" | "dark" | "system";

  // C. App
  start_at_login: boolean;

  // D. Window
  window: {
    remember_position: boolean;
    remember_size: boolean;
    default_size: { width: number; height: number };
    min_size: { width: number; height: number };
  };

  // E. System prompt
  system_prompt: {
    default: string; // 多行
    user_can_edit: boolean;
  };

  // F. Conversations
  conversations: {
    auto_archive_after_days: number; // 默认 30
    max_history: number; // 默认 1000
  };

  // G. Deleted — workspaces 已移出 Settings，改由 WorkspaceService (SQLite) 管理 (ADR-0023 D8-W)
}

interface ModelMeta {
  id: string; // "MiniMax-M2.5-highspeed" | ...
  label: string; // "M2.5 Highspeed" | ...
  context_window?: number; // token 上限
  deprecated?: boolean; // UI 标灰
  thinking?: boolean; // 是否支持 extended thinking
}
```

**API 密钥现在直接进 Settings JSON**（`Provider.api_key` 字段，明文存盘，见 ADR-0015）。**没有**单独的 store 命名空间或 OS keyring 隔离。V1.7+ 之前的 `llm_providers/<id>/api_key` 与 `billing/<id>/api_key` 两个 store 路径已删除。同一家公司 LLM 和 billing 调用复用**同一** key。

**默认预填**：`Settings::Default` 编译时预置一条 LLM provider 记录（`id: "minimax"` / `default_model: "MiniMax-M2.5-highspeed"` / `base_url: "https://api.minimaxi.com/anthropic"` / `api_type: "anthropic-messages"`），并预填对应 billing 子对象（`kind: PlanQuota`）。首次启动即可用，用户只需在 Settings UI 填 MiniMax API key。

## 认证约定

- **LLM providers** 通过 pi-mono 标准机制认证（因 provider 而异：OpenAI Bearer、Anthropic `x-api-key`、OpenAI 兼容自定义 header）。`pi-ai` 负责构造 header；密钥值来自 `Provider.api_key`（Settings JSON 字段，ADR-0015）。
- **Billing providers** 使用 `Authorization: Bearer <Provider.api_key>`。header 在 TS adapter 内部构造；密钥值来自同一字段。密钥存 webview 进程内的 Settings JSON；前端可直接读取字符串值（V1.7+ 前的 `has_key: boolean` 探测已废止，因字段恒存在）。

## Non-goals

- 单 provider 多账号
- 历史图表 / 时序数据
- 分支会话
- 跨会话用户事实的自动记忆 / 跨 session 持久化
- 计费与文件工具之外的通用工具（无 shell、无 IDE 集成）
- 无鼠标操作（无热键、无键盘快捷键）
- 跨平台打包（Electron 保持可移植；仅 Windows，per ADR-0024）
- 自动更新、代码签名
- 点击穿透透明区域
