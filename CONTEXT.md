# codeman-agent — 项目语境

独立 Windows 桌面 AI 智能体，基于 Electron (Node main + Chromium renderer) + Solid.js + TypeScript + Effect-TS，运行时采用 pi-mono (`@mariozechner/pi-ai` + `@mariozechner/pi-agent`)。主窗口是 LLM 对话 (`/`)，设置走 `/settings` 路由（TanStack Router），内置 2 个计费工具（`get_balance`、`get_plan_quota`，覆盖 DeepSeek 与 MiniMax）、5 个文件工具（`read_file` / `write_file` / `edit_file` / `search_files` / `delete_file`）和 1 个网页抓取工具（`webfetch`）。本文档固定词汇表，确保 plan、code 与 commit message 保持一致。V3 起壳由 Tauri 2 迁至 Electron（ADR-0024），UI / 逻辑层 / Agent runtime / 持久化 schema 全保留。

## 词汇表

### 领域

- **Agent (代理)** — 产品本体。LLM 驱动的助手，运行在独立 Windows 桌面窗口中。_避免_：widget、app、client。
- **Conversation (会话)** — 用户拥有的持久聊天线程。线性消息序列；不支持分支。每 Conversation 至多 1 个 active 流，多 Conversation 可并行 streaming。每个 Conversation 创建时绑定 1 个 workspace (`workspace_id: string`，详见 `Workspace-Bound Conversation`)；旧 conv (V1.x 迁移) `workspace_id = ""` 视为 "needs workspace"，UI 灰标。active 流定义：`run()` 已调用且 `done` / `error` / `cancel` 之一尚未触发。active 流的取消走 `AgentRuntime.cancel(conversationId)`。
- **Message (消息)** — 会话中的单轮消息。角色为 `user`、`assistant`、`tool` 或 `system` 之一。可能内联携带 tool call 与 tool result（JSON 形式）。Assistant message 对应 **1 个 agent turn**（runtime 在每个 `turn_end` emit 1 个 `done` 事件），详见 `Bubble Boundary`。
- **Tool (工具)** — Agent 可调用的类型化函数。内置 2 个计费工具 + 5 个文件工具 + 1 个网页抓取工具（`webfetch`）；注册表可扩展。
- **Tool Call (工具调用)** — LLM 请求调用工具的指令。携带工具名与 JSON 参数。
- **Tool Result (工具结果)** — 工具调用的返回值。可能携带类型化错误。
- **Bubble Boundary (气泡边界)** — Conversation.messages[] 数组中的每个 Message 渲染为 1 个 bubble。**Agent-turn boundary**：1 个 agent loop turn = 1 个 assistant message = 1 个 bubble，由 runtime 在 `turn_end` 触发 `done` 事件保证。跨 turn **不聚合**——turn-1 的 thinking block 只在 turn-1 的 bubble 顶部，不搬到 turn-2 bubble。Tool result inline 在所属 turn 的 assistant message 的 `toolResults[]` 字段（`ToolCallPanel` 渲染在 bubble 内），不独立走 `role:tool` bubble。1 user input 因此可能产生 **N 个 assistant bubble**（N = 该 input 触发的 agent turn 数）。per [ADR-0028](./adr/0028-bubble-boundary-per-agent-turn.md)。_避免_: V3.1 logical-unit boundary（旧 contract，跨 turn 聚合 thinking/tool_calls 到最终 bubble），content-type boundary（tool_result 独立 role=tool bubble），agent-loop bubble（语义含糊）。
- **Snapshot (快照)** — 计费提供方状态的时点视图。判别联合类型：`Balance { amount, currency, auto_recharge }` 或 `PlanQuota { remaining, total, expires_at?, daily_avg? }`。由计费工具返回。

### Providers

- **Provider (提供商)** — 公司维度的统一记录，承载一种或多种"对外能力"。一条记录 = 一家公司。shape: `{ id, label, enabled, apiKey, llm: {...}, billing?: {...} }`。`apiKey` 是该 provider 的对外调用凭据（明文存于 Settings JSON，见 ADR-0015）；`llm` 必选，`billing` 可选。_避免_：client、vendor、service。
- **Provider.llm (LLM 能力)** — Provider 必选子对象。shape: `{ defaultModel, baseUrl, apiType, models, modelsEndpoint }`。`apiType` 锁 `"anthropic-messages"`；`models: ModelMeta[]` 用户在 Settings 中可编辑；`modelsEndpoint: string` provider 维度的模型列表拉取 URL。**不变量**：`defaultModel` 始终是 `models` 数组中某个元素的 `id` 或 `""`（见 Default Model Invariant，ADR-0016）。Agent 的"燃料"。pi-ai 调 LLM 时 `Authorization: Bearer <Provider.apiKey>`。_避免_：model provider、API provider、AI provider。
- **Provider.billing (计费能力)** — Provider 可选子对象。shape: `{ kind }`。`kind` = `"balance" | "plan_quota"`。Agent 的一级工具目标。billing adapter 调计费端点时复用 `Provider.apiKey` 作 `Authorization: Bearer`。_避免_：billing source、计费源。
- **Protocol (协议)** — LLM 上游调用的 HTTP/SSE 形态。锁定 anthropic-messages（Anthropic Messages API 的请求/响应形状）；pi-ai 按 `api` 字段路由到对应 transport 实现。_避免_：API format、API type（实现细节）、wire format。
- **Adapter (适配器)** — 每个计费提供方的 HTTP 客户端与响应解析器，将 API key 转换为 `Snapshot`。位于 TS 端 (`src/features/billing/lib/adapters/`)：deepseek 仅实现 `balance`，minimax 实现 `plan_quota`（balance 端点未公开验证）。_避免_：HTTP client（过载）。
- **ModelMeta (模型元数据)** — `Provider.llm.models[]` 元素。shape: `{ id, label, contextWindow?, deprecated?, thinking? }`；用户在 Settings 中可增删编辑。`ProviderService.getModels(id)` 静态读出此列表（读 settings）；`ProviderService.fetchModels(id)` 调 `modelsEndpoint` 拉最新（OpenAI-compatible `/v1/models` 格式，`label` 默认 = `id`）。_避免_：model config、model info。
- **Models Endpoint (模型列表端点)** — `Provider.llm.modelsEndpoint`。per-provider 可配置 URL，用于 `fetchModels()` 拉模型列表。
- **Default Model Invariant (默认模型不变量)** — `Provider.llm.defaultModel` 始终是 `Provider.llm.models` 数组中某个元素的 `id`，或 `""`（models 为空时）。`appStore.refreshProviderModels` 在写 state 时强制执行：若 `defaultModel` 不在新数组中且数组非空，改成 `models[0].id`；若数组为空，改成 `""`（ADR-0016）。防止 UI dropdown 跳到默认第一项而 store 里 `defaultModel` 仍是无效值的"UI 看似 OK / store 不一致"的 bug。
- **Balance (余额)** — 计费提供方持有的可充值信用池。时点状态，可充值。
- **Plan Quota (用量)** — 套餐附带的固定、不可充值的配额。随使用减少，周期重置，不可充值。

### File IO

- **Workspace (工作区)** — 用户在 file tool 中操作的根目录，由 chat feature 管理（`WorkspaceService` + SQLite 持久化，per ADR-0023 D8-W）。创建后 `root_path` 不可变。**每个 Conversation 绑定 1 个 workspace** (per-Conv, `Conversation.workspace_id` 必填，详见 `Workspace-Bound Conversation`)；agent 的 file tool 仅在该目录树下操作，越界 (canonical path 不在任何 workspace root 内) 由 Electron Main process handler 拒绝 (返回 `SandboxViolation` 错误)。_避免_: sandbox、root directory、project root。
- **Workspace-Bound Conversation (绑定 workspace 的会话)** — 每个 Conversation 在创建时 (`createConversation(workspaceId, ...)`) 必须绑定 1 个 workspace (`workspace_id: string` 字段)，创建后不可更改。`workspace_id = ""` 表示 "needs workspace" (V1.x 迁移的旧 conv 状态，UI 灰标)。该绑定决定 file tool 沙箱边界；Home 上的 workspace 选择器决定新 conv 的绑定。_避免_: global workspace、workspace 切换 (per-Conv 锁定后不存在切换)。
- **Add Workspace (添加 Workspace)** — 用户在 Home 的 workspace picker dropdown 中通过 "+ Add new workspace…" Action slot 触发；调 `chatStore.pickWorkspacePath()` 弹 OS 原生 folder picker；picker 关闭后若返回非 null 路径，调用 `chatStore.addWorkspace(rootPath)` → `WorkspaceService.add`（SQLite 持久化）+ 自动派生 label（`deriveLabelFromPath`）+ dedup（同 root_path 重复时静默忽略并自动选已有）+ 关闭 dropdown + focus textarea。Home **不**再跳 /settings。_避免_: Navigate-to-Settings（V2.1 polish 早期设计，已废止）。
- **Workspace Label Derivation (workspace label 派生)** — 通过 OS folder picker 添加 workspace 时（`Add Workspace` 流程），`label` 从 `root_path` 自动派生：调用 `deriveLabelFromPath(rootPath)` (位于 `src/shared/lib/derive-label-from-path.ts`) 取路径最后非空段作为 label；空结果（`C:\`、`/`）fallback `"Untitled workspace"`。后续用户可通过 sidebar hover → Rename 按钮修改 label。_避免_: 强制用户在 picker 关闭后输入 label（增加 UI 阻塞；违反"calm/professional"原则）。
- **File Tool (文件工具)** — pi-agent 工具族，内置 5 个: `read_file` (读全文) / `write_file` (覆盖写) / `edit_file` (替换文本，支持 `replaceAll`) / `search_files` (glob + content 搜索) / `delete_file` (移至回收站)。所有工具通过 IPC 调 Electron Main process 的 `node:fs`，沙箱由 workspace 边界约束。_避免_: fs tool、file operation (过载)。
- **Webfetch (网页抓取工具)** — 内置 AgentTool（`webfetch`），对 LLM 暴露 HTTP/HTTPS 网页抓取能力。走 IPC（`webfetch:fetch`）到 Electron Main process，main 端实施 SSRF 防护（URL scheme 校验 + DNS 预解析 + IP 黑名单 + 大小限制 + 超时）。HTML 使用 turndown 转 Markdown。参数：`{ url, format, timeout? }`。renderer 端定义见 `src/renderer/src/tools/webfetch/`，main 端见 `src/main/features/webfetch/`。per ADR-0038。_避免_: fetch tool、http tool（非单字名）、url tool。
- **RunCommand (命令行执行工具)** — 内置 AgentTool（`run_command`），对 LLM 暴露单条 shell 命令执行能力。走 IPC（`runCommand`）到 Electron Main process，main 端通过 `child_process.spawn` 执行命令（Windows 走 `cmd.exe /c`，POSIX 走 `/bin/sh -c`）。参数：`{ command, cwd?, timeoutMs? }`。结果形状：`{ status: "ok", exitCode, stdout, stderr, durationMs }` | `{ status: "cancelled", partialOutput }` | `{ status: "timeout", partialOutput }` | `{ status: "error", error }`。安全模型：高风险命令（危险命令 + 破坏性 flag + 路径越界 + 解析失败）触发 `dialog.showMessageBox` 确认弹窗；用户拒绝返回 `PermissionDenied`。renderer 端定义见 `src/renderer/src/tools/run-command/`，main 端见 `src/main/features/run-command/`。per ADR-0048。_避免_: shell tool、exec tool、command tool。
- **Sandbox Violation (越界错误)** — Electron Main process 在 `fs.realpath(path)` 后检测到 `path` 不在任何 workspace 目录下时返回的错误。Agent 收到后必须重新规划 (改路径 / 让用户加 workspace) 而非重试原路径。V3 起语义不变；实现从 Rust `std::fs::canonicalize` 改为 Node `fs.realpath.native` (per ADR-0024)。**网络 SSRF 同样视为 sandbox 越界** (webfetch 等网络工具调 main 端 SSRF 黑名单拒绝私有 IP 时, throw `SandboxViolation` with `workspaceLabel: "webfetch"`, per ADR-0038 D1)。

### Plugins

- **Plugin (插件)** — Agent 的一项可独立启用能力模块。Skills 提供 prompt 知识扩展，MCP 提供外部工具能力；二者是正交能力，不互相替代。
- **Plugin Registry (插件注册表)** — renderer 中管理内置 Plugin 身份、启动状态和导航信息的统一边界。它协调 Plugin 初始化，但不拥有 Agent runtime 的 tools 或 system prompt 聚合职责。_避免_：动态模块发现、runtime tool registry。
- **Plugin Initialization (插件初始化)** — Agent 启动阶段为每个已注册 Plugin 建立可用状态的过程。所有 Plugin 完成成功或失败后，Agent 才结束该启动阶段；单个 Plugin 失败不会让其它 Plugin 失去机会。
- **Plugin Navigation Metadata (插件导航元数据)** — Plugin 对应的 canonical route 与 sidebar 展示信息。它统一 router 与 sidebar 的导航数据，但不意味着运行时动态创建 TanStack Router route。

### 架构

- **Runtime (运行时)** — 包装 pi-mono agent loop 的**纯工厂函数** `createAgentRuntime()`。无 `Context.Tag` service、无 Layer DI、无内部 Map（V2 起 per ADR-0019 supersede ADR-0014 D1）。每次调用 `createAgentRuntime()` 返回独立的 `AgentRuntime` 实体，存放在 `ConversationState.runtime`（per-conv 实例化）。`AgentRuntime.run({ context, provider })` 内部仍用 Queue-based Mailbox 架构（per ADR-0017）：`Queue.unbounded` 作为 event bus，`Effect.fork` 在子 fiber 里跑 `agent.subscribe + agent.prompt`，事件通过 `Queue.unsafeOffer` 推入；consumer 端 `Stream.fromQueue(queue)` 是 leaf operator。每次 `run()` 调用新建 pi-mono `Agent`，`initialState.messages = context`（store 来的浅拷贝，per ADR-0019 D2 "Agent 是 per-run transient"）；`AbortController` 注入 transport，`cancel()` 通过 `abortController.abort()` 触发 fetch abort。**事件 emit 契约**（per `Bubble Boundary`）：runtime 在每个 `turn_end` 触发 1 个 `done` 事件（emit 该 turn 的 assistant message），**不**在 `agent_end` 聚合跨 turn thinking/tool/text。`_避免_`：agent core、agent loop、AgentRuntime service（旧 Context.Tag + Layer 设计）。
- **Per-Conversation Runtime (会话级运行时)** — 每个 Conversation 对应一个 `createAgentRuntime()` 产物（即一个 `AgentRuntime` 实体），存放在 `ConversationState.runtime`（`src/features/chat/stores/chat.store.ts` inline 定义）。生命周期跟随 Conversation：创建于 Conversation 首次 send 时（lazy），销毁于 Conversation 被 delete / archive。in-flight 流不被 cancel — 切换 Conversation 时 partial 进度保留在 `ConversationState.messages`（stream 订阅实时写）。同一 Conversation 至多 1 个 active 流；多 Conversation 可并行 streaming。_避免_：singleton Agent（旧 ADR-0014 D1 已被 supersede）、per-request Agent、Per-Conversation Agent（旧 term,已并入本词条）。
- **Conversation State (会话视图)** — `Conversation`（DB-backed 持久字段）+ per-conv reactive state（`messages: Message[]` + `streamingMessageId: string | null`）+ per-conv runtime（`runtime: AgentRuntime`）的组合类型。定义在 `src/features/chat/stores/chat.store.ts`（V2 起合并原 `messages.store` + `agent.store`，per ADR-0019 D3）。Solid `createStore<{ activeId: string | null; byId: Record<ConvId, ConversationState> }>` 管理反应式。UI 读 `store.byId[activeId()]` 拿到 reactive 视图；store 是 single source of truth，runtime 是 stateless LLM caller。_避免_：Per-Conv message signal（旧 `messages$` 全局 signal，已废止）、Agent Map（旧 `Ref<Map<ConvId, Agent>>`，已废止）。
- **Bridge (桥接层)** — 将 Effect `Stream` / `Effect` 输出翻译为 Solid `createStore` 的层。V2 起归口到 `chat.store.ts`：stream `runForEach` 订阅 → `setStore("byId", convId, ...)` 写 reactive state。UI 组件不 `import 'effect'`。_避免_：adapter（过载）。
- **Chat Store (聊天域 Store)** — `src/features/chat/stores/chat.store.ts`（原 `conversations.store.ts`, 重命名 per ADR-0023 D8-W）。chat feature 唯一响应式源：拥有 conversations（ConversationState byId + CRUD + sendMessage）+ workspaces（WorkspaceService 桥接 + CRUD + selectedWorkspaceId 派生状态）。**公开 API 返回 `Effect<T, AppError, never>`**（per ADR-0016 D4 + "Bridge"），UI 通过 `Effect.runPromiseExit(...)` + `Exit.match(...)` 消费。公开 AS `chatStore` namespace（`features/chat/index.ts` barrel）。_避免_: agent store、messages store（旧拆分已合并 per ADR-0019 D3）。
- **Effect Service (Effect 服务)** — 类型化异步模块，暴露 `Effect<A, E, R>` 或 `Stream<A, E, R>`。通过 Effect layer 组合；通过 mock layer 测试（`@effect/vitest`）。V2 起 chat 域不再用 Effect Service 模式承载 runtime（`createAgentRuntime` 是纯工厂函数而非 Context.Tag），但 DB 桥接仍用 Service 模式（`ConversationService` / `MessageService` in `shared/lib/ipc.ts`）。
- **IPC** — Electron 跨进程命令桥接。Main 端 handler 注册在 `src/main/ipc.ts` 的 `ipcMain.handle(...)`；preload 通过 `contextBridge.exposeInMainWorld('codeman', api)` 暴露类型化 API；renderer 端包装在 `src/renderer/shared/lib/ipc.ts`（Service Tag + Live Layer）。Renderer 直接 import `window.codeman` 不出现；所有调用走 Service Tag。V3 起替代 V2 的 Tauri `invoke_handler` 桥接 (per ADR-0024)。
- **Input History (输入历史)** — V2.4+ 引入的 chat 输入最近提交记录栈（最多 100 条, 新的在前）。跨 Home / ChatView 两个输入框共享。↑ / ↓ 键在空 input（或历史导航态）上做历史导航（与 bash readline 同语义）。**存储偏离项目惯例**：`localStorage["codeman.input-history.v1"]` 而不是 SQLite——100 条 × 几 KB 的轻量、best-effort 语义、不引新 SQL migration。QuotaExceededError 静默吞。存储 / dedup / cap / trim 逻辑在 `src/features/chat/lib/input-history.ts`；Solid 反应式 + 导航 cursor 在 `src/features/chat/stores/input-history.store.ts`。_避免_: shell history、recent messages、消息历史（与 Conversation 持久化混淆）、history（与浏览器 `window.history` 撞名）。
- **Input History Cursor (输入历史光标)** — `inputHistoryCursor$(): -1 | number`。`-1` = 用户当前输入态（input 是真正草稿或空）；`0..N-1` = 历史导航态（input 显示 `history[cursor]`，用户可编辑但 cursor 保持在历史）。语义对应 bash readline 的 `history_pos`。提交消息（`recordInputEntry`）或回退到最新条目之后再按 ↓（`navigateInputHistoryNext`）时重置回 -1。_避免_: history index、navigation index、position。

- **`tools/` 目录 (6+1 白名单)** — `src/renderer/src/tools/<name>/` 顶层目录（与 `features/` 同级），存放 LLM-facing AgentTool 定义。每个 `<name>/` 根级仅允许 `index.ts`（barrel）+ `AGENTS.md`。ADR-0010 原 5+1 白名单（5 个 feature 子目录 + 1 个 shared），ADR-0038 扩展为 6+1（新增 `tools/`）。当前成员：`file-ops/`（5 个文件工具，从 `features/file-tools` 迁入）、`webfetch/`（网页抓取工具）。_避免_：放到 `features/<feature>/tools/`（已在 ADR-0010 被合并到 `lib/`）；`tools/` 下嵌套子目录（扁平约束）。

### 上下文压缩

- **Context Compaction (上下文压缩)** — 当 Conversation 的消息历史长度达到预设阈值时，自动将早前消息压缩为摘要，以控制 token 消耗的机制。支持手动触发（用户点击压缩按钮）和自动触发（达阈值后静默压缩）。
- **Compaction Entry (压缩条目)** — 被压缩进摘要的原始消息段。每段在 UI 中渲染为一个 `data-testid="compaction-marker"` 的可折叠块，展开后显示该段落的原始内容摘要。
- **Compaction Marker (压缩标记)** — UI 中标识已压缩消息段的视觉元素，`data-testid="compaction-marker"`。点击标记的摘要区域可展开查看 `data-testid="compaction-summary-body"`。
- **Auto Compaction Threshold (自动压缩阈值)** — 触发自动上下文压缩的 token 数量上限。当对话累计 token 达到此值时，Agent 自动执行压缩并插入 Compaction Marker，无需用户操作。

### Schema 与错误模型 (ADR-0025)

- **Schema (`effect/Schema`)** — `effect` 包内置的 schema/validation 模块（`import { Schema } from "effect"`），用于同时表达**运行时校验**与**TypeScript 类型**。`Schema.Struct({...})` 替代传统 `interface Foo { ... }`：编解码、JSON 序列化、错误实例化全部内建。V3.0 起 `src/` 全栈采用 effect/Schema 作为默认 schema 来源；不再使用 `@sinclair/typebox`（typebox 降级为 pi-ai 间接传递依赖，仅在 pi-ai 边界 `AgentTool<TParameters extends TSchema>` 出现）。_避免_：手写 `interface` + 单独 validator；引入 `@effect/schema` standalone 旧包（已被 effect@3.x 合并）；引入 zod / valibot（与 Effect 生态割裂）。
- **Schema.TaggedError (Tagged 错误基类)** — `Schema.TaggedError<...>()("Tag", { field: Schema.X })` 构造的类，生成带 `_tag` 判别字段 + Schema 字段的 error class 实例。可 `Effect.fail(new NotFound({...}))` 抛出、`instanceof NotFound` 类型守卫、`cause._tag === "NotFound"` 模式匹配、JSON Schema 自动派生（用于日志 / API 边界序列化）。本项目 `AppError` 基类（`src/shared/lib/errors.ts`，ADR-0025 D4）即采用此模式，8 个子类（`NotFound` / `Unauthorized` / `Network` / `InvalidConfig` / `Database` / `ToolCall` / `SandboxViolation` / `Unknown`）共享 `_tag` + `message` 公共字段。_避免_：手写判别联合 `{kind: "X"}` 对象（失去 `instanceof` 类型守卫 + JSON Schema 自动派生）；8 个独立 TaggedError 类 + 手动联合类型（破坏 `Effect<T, AppError>` 类型可表达性 + `instanceof AppError` 守卫）。
- **Schema.toJsonSchema (Schema → JSON Schema 转换)** — `Schema.toJsonSchema(schema)` 把 effect/Schema 输出转为标准 JSON Schema spec 对象。本项目用于 pi-ai 边界（`AgentTool.parameters` 必须接受 typebox `TSchema`，运行时被 pi-ai AJV 编译）。调用点统一走 `toToolParameters()` helper（`src/shared/lib/tool-schema.ts`，ADR-0025 D8），避免 `Schema.toJsonSchema(s) as unknown as TSchema` 在多处重复。
- **Branded Type (品牌类型)** — effect/Schema 通过 `Schema.String.pipe(Schema.brand("WorkspaceId"))` 给 `string` 加类型层 brand（编译期阻止 `string` 与 `WorkspaceId` 混用），运行时仍是 plain string，**0 性能成本**。PR 4 引入 `WorkspaceId` / `FilePath` / `ToolCallId` / `ConversationId` 等跨域 ID 时使用。_避免_：手写 `type WorkspaceId = string & { readonly __brand: "WorkspaceId" }`（与 Schema 不一致，PR 4 落地时统一用 Schema.brand）。
- **TSchema cast (typebox 类型 cast)** — pi-ai 的 `AgentTool<TParameters extends TSchema = TSchema>` 泛型约束要求 typebox `TSchema` 类型符号。本项目通过 `Schema.toJsonSchema(s) as unknown as TSchema` 满足该约束，并封装在 `toToolParameters()` helper。typebox 本身不安装为直接依赖（`package.json` 不声明）—— 通过 `pnpm ls @sinclair/typebox` 可见其作为 pi-ai 传递依赖存在。_避免_：`import { Type } from "@sinclair/typebox"`（直接 typebox 源码使用，违反 ADR-0025 D2）。

### Form (2026-07, Plan C → V2.5 ADR-0029)

- **TanStack Form (`@tanstack/solid-form`)** — V3 引入的跨域 form 状态库，`createForm(() => ({ defaultValues, validators, onSubmit }))` 创建 form，`form.Field name="..."` 暴露字段 API。**消费方**：`ProviderCard`（settings feature，Plan C 2026-07 首例）+ `HomeAgentForm` + `ChatView`（chat feature，V2.5 per [ADR-0029](./adr/0029-form-mode-for-home-and-chat-input.md)）；其它 form (rename-dialog / add-provider-dialog) 仍走「本地 createSignal + onSubmit」老模式。**模式**：typing 期间不写 store，commit 在 onBlur / onChange。**修复 bug**（Plan C）：之前 `handleBaseUrlChange` / `handleApiKeyChange` 每次按键都 `appStore.set({providers: array.map(...)})`，`settings.tsx` 的 `<For each={providers}>` 用引用相等性 diff 后整张 ProviderCard 被卸载重建 → 输入框 DOM 替换 → focus 丢失（"每输入一个字符就 blur"）。TanStack Form 接管 field 内部 signal，`<For>` 看到的 providers 数组引用稳定，DOM 不被替换。_避免_：V1 一致性 form 模式不引入 TanStack Form（chat-view / home / add-provider-dialog 已有「本地 signal + onSubmit」成熟样板 → 已被 ADR-0029 supersede，Home/ChatView 在 V2.5 一起迁到 form 模式）；TanStack Form 内部 `_op` 错误（`createForm` 必须在 `createRoot` / `render` 作用域内调用，与 Solid signal 同步）。
- **Standard Schema V1 (form validator 规约)** — [https://github.com/standard-schema/standard-schema](https://github.com/standard-schema/standard-schema) 定义的 validator interface: `{ "~standard": { version: 1, vendor: string, validate: (value) => { value } | { issues: [{ message, path? }] } } }`。`@tanstack/solid-form` 的 `form.Field.validators` slot 走这个规约。**官方支持** Zod / Valibot / ArkType / Yup。**Effect Schema 不实现** — 见 effect-schema-adapter。
- **effect-schema-adapter (Effect Schema → Standard Schema V1 适配)** — `src/shared/lib/effect-schema-adapter.ts`，把 `Schema.X` 包装成符合 Standard Schema V1 的 validator (~60 行)。关键点：(1) `ParseResult.validateEither(..., { errors: "all" })` 收集所有 field error 而非 default 的 "first"；(2) 递归扁平化 `Composite` + `Pointer` + `Refinement` + `Transformation` 节点；(3) `SchemaAST.getMessageAnnotation(ast)` 从 `ast.annotations[MessageAnnotationId]` 读 message 注解（Effect 在 runtime 接受 string 而不仅是 function）；(4) 标准 `StandardSchemaV1<I, A>` type 给 `tanstack-form` 用；(5) `firstErrorMessage(errors)` is also exported from the adapter — single source of truth for extracting a Standard-Schema-V1 `{ message: string }` from TanStack Form's `unknown[]` errors slot. Used by ProviderCard and any future form consumer. 5/5 unit tests。_避免_：直接 `Schema.validateSync` + 手动构造 issues（丢失 path 字段、丢失 errors:"all" 聚合）；重复实现 flatten 逻辑（统一走 adapter）。
- **Form-First Form Pattern (TanStack Form 模式下 ProviderCard 的提交策略)** — `ProviderCard` 把 4 个字段（baseUrl / apiKey / model / enabled）全走 `form.Field`，每个 `form.Field` 的 `onBlur` / `onChange` 调 `form.handleSubmit()`。onSubmit handler 写 `appStore.set({providers})` + `settingsSaver.flushNow()`（统一 flush，替代 V1.8+ 的"apiKey 走 flushNow、其它走 scheduleSave"二元路径，简单优先）。per-field schemas now live in `features/settings/lib/schemas.ts`, authored via the `withMessage(schema, message)` helper that writes to `SchemaAST.MessageAnnotationId` directly (no `as never` cast). _避免_：在 form 提交时同时在 `onChange` 也写 store（per-keystroke 写 store 是 V1.8+ 反模式，bug 根因）。
- **Draft (form field)** — `HomeAgentForm` 与 `ChatView` 中 textarea 绑定的用户在编辑文本。TanStack Form 接管后，submit 时从 `form.getFieldValue('draft')` 读取，触发三步流程（Home：`createConversation` → `recordInputEntry + navigate` → `sendMessage`；ChatView：`recordInputEntry` → `sendMessage`）。**哨兵**：field schema = `Schema.Union(Schema.Literal(''), Schema.String.pipe(Schema.minLength(1)))`，空草稿视为 invalid → Send 按钮 disable + form-level validator 拒提交，与 `Message.content`（已持久化的 assistant 正文）显式区分。V2.5 引入，per [ADR-0029](./adr/0029-form-mode-for-home-and-chat-input.md) D2。_避免_：叫 `input`（与本地 signal 命名冲突；语义"草稿、未提交"不够显式）；叫 `content`（与 `Message.content` 撞名，提交前后语义不同）。

### Skills (V3.1, Plan → V2.5+ ADR-0031)

- **Skill (技能)** — 端用户可加载的 prompt augmentation，存储为 `~/.agents/skills/<skill-name>/SKILL.md`（YAML frontmatter + Markdown body）。**职责**：仅修改 system prompt，不带新 AgentTool / 不带 UI 资源。与 MCP（加能力）正交。**双轨激活**：(1) 描述驱动自动发现（LLM 读 manifest 后主动 `_load_skill`）；(2) Slash command（用户在 chat 输入框打 `/<skill-name>`）。per [ADR-0031](./adr/0031-skills-system.md)。_避免_：与项目自带 `.agents/skills/`（AI agent 自身用）混淆——两者**目录字面一致**但**语义不同**（项目级 vs 用户级），互不读取对方目录。
- **Skill Manifest (技能清单)** — SKILL.md 的 YAML frontmatter 块：`{ name: string, description: string }`。`name` 必须 = 所在目录名；`description` 必填（为空 → 不出现在自动发现 manifest）。每次 `runtime.run()` 时所有 enabled skills 的 manifest 被 `formatSkillsManifestSection()` 拼成 `<available_skills>...</available_skills>` XML 块注入 system prompt。per ADR-0031 D3。_避免_：把 description 与 body 混在一起读（description 必须小到能塞进 system prompt 不撑爆）。
- **Slash Command (斜杠命令)** — 用户在 chat 输入框打 `/<skill-name>` 触发的显式 Skill 加载。V1 简化：解析 `/skill-name` 前缀并去掉，剩余文本作为正常 user 消息；skill body 通过 meta-tool `_load_skill` 等价路径立即注入 context。**不**在对话历史留下 `/skill-name` 字面（避免污染历史）。per ADR-0031 D5。
- **Slash Menu (斜杠菜单)** — Chat 输入框 + Home 表单中输入 `/` 触发的 fuzzy-filter 候选 popup，列出 enabled Skills。选中后插入 `/<skill-name> ` 到 textarea。组件位于 `src/plugins/skills/components/slash-menu.tsx`，基于 `@ark-ui/solid` Combobox；触发/定位由 chat-view.tsx + home.tsx 的 onKeyDown hook。per ADR-0031 D10。
- **Pre-installed Skill (预装技能)** — Ship-with-app Skill，bundled 进 `src/resources/skills/<name>/SKILL.md`，通过 electron-builder `extraResources` 打包。Electron main `whenReady` 阶段 `ensurePreinstalledSkills()` 一次性复制到 `~/.agents/skills/<name>/SKILL.md`（idempotent：已存在跳过，**不**覆盖用户修改）。V1 预装 4 个：`commit-helper` / `code-review` / `explain-error` / `summarize`。per ADR-0031 D6 + D7。_避免_：覆盖用户修改过的 SKILL.md（V1 idempotent-skip 是简化,V2+ 加 hash 检测 + 更新提示）。
- **`_load_skill` (meta-tool)** — 注入到 runtime tools[] 的特殊 AgentTool（name 前缀下划线暗示 meta 性质），LLM 主动调用以拉取 Skill 全文。`parameters: { skillName: string }`，`execute` 返回 `{ content: skillBody }`。与现有 tool result 同语义,body 不进 system prompt 而是经 tool_result message 流——避免永久累积撑爆 context window。per ADR-0031 D4。

### MCP (V3.1, Plan → V3.1 ADR-0032)

- **MCP (Model Context Protocol)** — Anthropic 2024-11 发布的 agent 工具扩展协议，让 agent 通过 JSON-RPC 调用外部 server 提供的 tools / resources / prompts。本项目 V1 仅以 **MCP Client** 角色接入（不支持作为 server）。per [ADR-0032](./adr/0032-mcp-client-stdio.md)。_避免_：与 Skills 混淆——Skill = 知识（prompt 上下文），MCP = 能力（新 tool）；两者职责正交，互不替代。
- **MCP Client (MCP 客户端)** — codeman-agent 扮演的角色：通过 stdio 启子进程 + JSON-RPC 2.0 (newline-delimited JSON over stdin/stdout) 与外部 MCP server 通信。**Transport**：V1 仅 stdio（生态 95%+ 覆盖）；SSE / Streamable HTTP 在 V2+ 评估。手写 JSON-RPC 客户端（不引 SDK）。per ADR-0032 D2。
- **MCP Server (MCP 服务器)** — 外部子进程，提供 tools 给 agent。本项目不**实现** server（仅消费 server）。Server 由用户配置启动：`npx -y @modelcontextprotocol/server-<name>` 之类。per ADR-0032。
- **MCP Server Config (MCP 服务器配置)** — `~/.agents/mcp_servers.json` 中的单条 server 记录：`{ name: string, command: string, args: string[], env?: Record<string,string>, enabled: boolean }`。**与 Skills 同根**（`~/.agents/`），与 Settings JSON（`%LocalAppData%\codeman-agent\settings.json`）分立——遵循「agent 生态配置走 `~/.agents/`，app 配置走 Settings JSON」(per ADR-0015)。enabled 字段控制启停（首次扫描到默认 `enabled: false`，需用户主动 enable）。per ADR-0032 D1 + D6。
- **MCP Tool (MCP 工具)** — MCP server 声明并通过 `tools/list` 返回的工具定义。注入 agent tool registry 时**强制重命名**为 `mcp_<server-name>_<tool-name>`（per ADR-0032 D3 grill 决议 mcp-a）——前缀避免与现有 7 个内置 tool 撞名 + LLM 一眼识别来源。`<server-name>` slug 化（小写 + 非字母数字替换为 `_`）；命名冲突由 runtime 保证唯一（冲突时 throw 启动错误 + disable 该 server）。
- **MCP-Enabled Tool Set (MCP 启用工具集)** — `runtime.tools[]` 中由 MCP server 注入的子集。**每次 `run()` 时 lazy fetch**（不缓存）——反映 MCP server enable/disable 最新状态；fetch 失败（IPC error）→ log warning + 空数组（不阻塞 LLM 启动）。per ADR-0032 D8。
- **MCP Server Status (MCP 服务器状态)** — 单 server 在 UI 显示的运行态枚举：`connected` / `spawn_failed` / `crashed` / `disabled` / `protocol_error` / `timeout`。每个状态有对应 lucide icon + 灰标错误信息。per ADR-0032 D5。

### Multi-Agents (V3.1, Plan → ADR-0049)

- **Multi-Agents Plugin (多 agent 插件)** — renderer Plugin Registry 第 3 个内置插件（与 `skills` / `mcp` 平级），提供「Sub-Agent Delegation」能力：主 Agent 可委派子任务给用户配置的 sub-agent。在 `src/renderer/src/plugins/multi-agents/` 目录。per [ADR-0049](./adr/0049-multi-agents-sub-agent-delegation.md)。_避免_：把 multi-agents 当成「多 session」(本质是 session 模型扩展而非 agent 协作)、当成「orchestrator」(V1 不引入新 Orchestrator 抽象)。
- **Sub-Agent (子代理)** — 用户在 Settings → Multi-Agents 中定义的 agent 配置。形态：`SubAgentConfig { id, name, description, systemPrompt, modelId, thinkingLevel, allowedTools, enabled, createdAt, updatedAt }`。Sub-agent 在被主 agent 委派时**现场实例化**——每次调用 `delegate_task` 新建独立 `Agent`（per ADR-0019 per-run transient），与主 agent 完全隔离。per ADR-0049 D1。_避免_：叫「worker」「child agent」「helper agent」(与现有 Conversation/Agent 词汇冲突)。
- **Delegate Task Tool (`delegate_task`)** — Multi-Agents 插件注入主 agent 工具集的**单个** generic AgentTool（不是 N 个专属工具）。name 固定 `delegate_task`，parameters: `{ agent_name: string, task: string }`。executionMode = `"parallel"`——主 agent 同一 turn 调多次时并发跑多个 sub-agent。**当用户未配置任何 enabled sub-agent 时,工具不注入**(避免给 LLM 投毒)。per ADR-0049 D5/D6。_避免_：每个 sub-agent 一个 `delegate_to_<name>` 专属工具(工具列表随 sub-agent 增长而膨胀,prompt bloat)。
- **Sub-Agent Delegation (子任务委派)** — 主 agent 调 `delegate_task` 触发。Dispatcher 按 `agent_name` 查找对应 SubAgentConfig → 实例化新 `Agent`(注入 `allowedTools` 子集,**排除 `delegate_task` 本身**防止递归, V1 决议)→ 跑 `agent.prompt(task)` → 仅返回最终 assistant 文本作为 tool result content。per ADR-0049 D4/D5。_避免_：sub-agent 接收主 conv 历史(隔离失败,token 高);sub-agent 返回完整消息史(token 高,主 agent 不需要看过程);sub-agent 递归调用 `delegate_task`(V1 不允许)。
- **Parallel Panel (并行面板)** — chat-view 在检测到 `delegate_task` toolCall 触发时挂载的 UI 容器，按 toolCallId 渲染 N 列 sub-agent live streaming（每列 = 一个 sub-agent 的 status badge + markdown streaming）。`tool_execution_end` 后所有列保留 + 状态变 "completed"，用户可折叠整组。per ADR-0049 D8。
- **Sub-Agent Stream Entry (子代理流条目)** — `sub-agents-stream.store.ts` Solid store 的 entry shape：`{ toolCallId, subAgentId, subAgentName, events, status: "running" | "completed" | "error", startedAt, completedAt?, finalText?, error? }`。Key = `toolCallId`（一个 toolCall = 一个 sub-agent 流）。LRU 清理（暂定 50 条）。per ADR-0049 D7。

### 密钥

- **API Key (API 密钥)** — Provider 的对外调用凭据，shape 为 `Provider.apiKey: string`。**明文存于 Settings JSON**（`%LocalAppData%\codeman-agent\settings.json`，由 `app.setPath('userData', '%LocalAppData%\\codeman-agent')` 锁定，per ADR-0024），与 Settings 其它字段同档；不再分 LLM / Billing 二分（ADR-0015）。LLM 调用和计费工具调端点都复用同一 key。V1 单机单用户威胁模型下接受明文；如未来需 OS 级密钥管理（keytar / Windows Credential Manager / Electron `safeStorage`）需重做 ADR-0015。_避免_：把 key 单独走 OS keychain 再走 IPC（V1.7+ 前的设计，已废止）。
- **Secret** — Rust 端 `Secret<String>` newtype，`Debug` / `Display` 打印 `Secret(***)` / `***`。V1.7+ 后 Settings JSON 明文存 key，`Secret` 主要用于 pi-agent 运行时构造 header 时临时包裹。**调用方**：`logger.*` / `log::*!` 不得打印完整 secret 值（任一语言）；`Secret` 类型自动重载 `Debug` / `Display`，裸字符串变量需手动 redact 为 `***`。V1.10+ 起本规则从"强制 redact"降级为 developer 自觉——理由是 simple logger API 与自动 redaction 实现冲突，详见 ADR-0018 D6。_避免_：对任何凭据使用裸 `String`。

### Settings 与状态

- **Settings (设置)** — 通过 `electron-store` 持久化的 JSON 文档，位于 `%LocalAppData%\codeman-agent\`（由 `app.setPath('userData', ...)` 显式锁定，与 V2 Tauri 路径对齐，per ADR-0024）。包含统一 `providers[]` 数组（每条 `Provider` 含 `apiKey` 明文字段，见 ADR-0015），以及 window / theme / systemPrompt / conversations / userLanguage / startAtLogin 等字段。`workspaces` 已从 Settings 移出，改由 `WorkspaceService`（SQLite 持久化，per ADR-0023 D8-W）。**API 密钥现在直接落在 Settings JSON 内**（V1.7+ 之前的"分 store 命名空间"模型已废止）。
- **App Store (全局应用状态)** — `src/shared/stores/app.store.ts` 提供的 Settings reactive 桥接层（ADR-0015 + ADR-0016）。`createStore` 包装 settings。公开 API（7 个）：
  - `appStore.state.value` — reactive 读
  - `appStore.set(patch)` — 写 state，**不**触发 IPC（debounce 由 `features/settings/lib/settings-saver` 触发）
  - `appStore.forceFlush()` — 跳过 debounce 立即 IPC（footer Save 调用）
  - `appStore.refresh()` — 从后端重载
  - `appStore.refreshProviderModels(id)` — 调 `ProviderService.fetchModels` 拉新 models 列表并写 state（含 `defaultModel` 自动 fallback 不变量）
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
- **Codeman Dialog (codeman-dialog 命令式 Modal)** — `shared/components/internal/codeman-dialog.tsx`（ADR-0023 D8-W6 引入，第 2 个 `internal/` 组件）。基于 `shared/components/ui/dialog.tsx`（`@ark-ui/solid` Dialog 原语包装的 shadcn/ui 风格通用 Dialog）。暴露 3 个命令式函数：`alert({ title, content, confirmText }) → Promise<void>`, `confirm({ title, content, confirmText, cancelText }) → Promise<boolean>`, `show<T>((resolve: (value: T) => void) => node) → Promise<T>`。纯 prop-driven，不依赖 feature stores。**两类消费**：(1) 确认对话框（`alert` / `confirm`）如 `settings` 域的清空历史确认 / `chat` 域的 workspace delete 确认；(2) form 对话框（`show<T>`），如 settings 域的 `createProviderFormDialog()` 命令式包装弹窗——renderFn 闭包内持有 form signals，Add 时 `resolve(provider)`、Cancel / dismiss 时 `resolve(null)`。_避免_：手写 dialog（@ark-ui/solid 提供 ARIA + 键盘 + focus trap）；form dialog 用受控 `<Dialog>` primitive（用户提交流程长 + 父组件需要序列化暂存数据时除外；常规 one-shot form 走 `show<T>()`）。
- **Codeman Toast (codeman-toast 命令式通知)** — `shared/components/internal/codeman-toast.tsx`（V2.5+ 引入，per [ADR-0029](./adr/0029-form-mode-for-home-and-chat-input.md) D5），第 3 个 `internal/` 组件。基于 `shared/components/ui/toast.tsx`（`@ark-ui/solid` Toast primitive 包装的 shadcn/ui 风格通用 Toast）。暴露 2 个命令式函数：`codemanToast.error(message: string, opts?)` / `codemanToast.success(message: string, opts?)`，与 `codeman-dialog` 同构（命令式、无 store signal、`<Toaster />` mount 在 `__root.tsx` 一次）。**统一错误反馈出口**：(1) Home submit 失败 (`createConversation` Exit.isFailure) — 替换了 V2.1 silent-return 缺陷；(2) ChatView runtime error — 取代 V2 inline `<div role="alert" data-testid="chat-error-banner">` banner（toast 比 banner 更"非阻塞"，不占消息列表顶部空间，不侵入 scroll 状态）。后续 settings save 失败 / provider refresh 失败 / workspace rename 失败 / 等更多异步动作失败都会走 `codemanToast.error`。_避免_：inline 文字贴 Send 按钮旁（"夹"住按钮视觉重）；Modal 错误（cDialog 阻断正在进行的输入）；per-feature 自建 toast（命令式 API 与 dialog 对称，自然跨 feature 复用）。
- **Cascade Sidebar Display (级联 sidebar 显示)** — `CodemanSidebar` 的视觉结构，由 [ADR-0023](./adr/0023-codeman-prefix-and-ark-ui-select.md) D7-CS 锁定。Workspaces 和 Conversations 渲染为**嵌套 tree**（每个 `WorkspaceNode` 含 `children: ConvNode[]`），**accordion 模式**——同一时刻至多 1 个 workspace 展开其 conversations，由 `@ark-ui/solid` 的 `Accordion.Root`（`multiple={false}` + `collapsible={true}`）承载（D7-CS8）。展开状态由 Ark UI 内部 zag-js state machine 管理（uncontrolled via `defaultValue={[]}`），`CodemanSidebar` **不持有展开 signal**，符合 ADR-0022 D3「codeman-* 组件严格 prop-driven」。Workspace **永远不 active**（无 `selectedWorkspaceId` prop）；只有 Conversation 可以 active（`selectedItemId`）。V1.x 迁移遗留 `workspace_id === ""` 的 convs 在 cascade 中不显示（与 V2.1 wave 1 行为一致）。空 workspace 展开后渲染可点击 `<button data-empty-workspace-id>` 文本「该 workspace 暂无会话」（CTA = `setLastUsedWorkspaceId(wsId)` + `clearActiveConversation()`，落到 HomeAgentForm 该 workspace 预选）。  语义属性：`data-workspace-id` / `data-conv-id` / `aria-expanded` / `aria-current="page"`，e2e 选择器契约。视觉指示：lucide `ChevronRight` 通过 Tailwind `group-data-[state=open]/item:rotate-90` 旋转 90°表示展开（D7-CS7）。_避免_：V1.x flat `data-conv-idx` 索引（已在 spec 09 重写时废止）；always-expanded tree（多 workspace 滚动条地狱）；sidebar 写 `last_used_workspace_id`（与 HomeAgentForm draft 解耦后由 HomeAgentForm 独占）；手写 accordion state machine（用 Ark UI 避免）。
- **Scroll Region (滚动区)** — 主栏（`ResizablePanel#main`）内**恰好一个**垂直滚动容器承载路由内容滚动的布局契约，per [ADR-0039](./adr/0039-main-content-sole-scroll-region.md)。两个**职责分离**的消费方：(1) 内容 wrapper `codeman-sidebar.tsx` → `<div class="flex-1 min-h-0 overflow-auto" data-scroll-region="true" data-testid="main-content-scroll">`（**layout 容器，div，不是 ScrollArea**——承载**非 chat 路由**的滚动，原生 overflow:auto；不该渲染自定义滚动条，否则会与内层 ScrollArea 的 ScrollBar 在右侧重叠，zag 的 ScrollBar 始终挂载） + (2) ChatView 消息区 → `<ScrollArea class="flex-1 min-h-0" data-scroll-region="true">`（**真正的内容 ScrollArea**，基于 `ui/scrollarea.tsx` = `.repos/shadcn/scroll-area.tsx` 的 Solid 移植，基于 `@ark-ui/solid/scroll-area`，契约标记透传到 **Viewport**——真正的滚动元素，zag 注入 `overflow:auto`）。ScrollArea 自带双滚动条防御：(a) Viewport `scrollbar-width:none` + `::-webkit-scrollbar display:none` 隐藏原生条（对齐 base-ui 的 `styleDisableScrollbar`）；(b) `!end-1` 让自定义 ScrollBar 离右侧 4px（覆盖 zag 注入的 `insetInlineEnd:0`）。**不变量**：主栏内**活动滚动区**（`scrollHeight > clientHeight`）恰好一个——非 chat 页是 wrapper div，chat 页是消息区 Viewport（wrapper 因 `conversation-route` `h-full overflow-hidden` 恰好贴合、无溢出）。**历史违规**：V2.9（`SidebarInset` 加 `overflow-y-auto` → 双滚动条 + 工具栏滚走）、V2.10（移除后 wrapper 未补滚动通道 → 非 chat 页无法滚动）、V3.x（wrapper 用 ScrollArea → 始终挂载的自定义 ScrollBar 与内层 ScrollArea 的 ScrollBar 在右侧重叠）。**强制机制**：单测（`scroll-region.test.ts` 断言模块 + `scrollarea.test.tsx` 契约测试 + `codeman-sidebar.test.tsx`）+ e2e（`03-layout-scroll.spec.ts`：超高页 wheel 生效 + 工具栏钉住 + 恰好一个活动滚动区 + 双滚动条守卫）。_避免_：在任意路由再自建 `overflow-y-auto` 容器（违反"恰好一个"不变量，V2.9 复发）；移除 wrapper 的滚动能力而不补替代通道（V2.10 复发）；把 wrapper 改用 ScrollArea（V3.x 复发，自定义 ScrollBar 始终挂载导致双滚动条）；把 `data-scroll-region`/`data-testid` 放到 ScrollArea 的 Root 上（Root 不是滚动元素，`scrollHeight` 断言会失效）；叫 scroll area / scroll container（与 shadcn `ScrollArea` 组件名混淆——组件用 `ScrollArea`，布局契约用「Scroll Region」）。

### 测试

- **Fake LLM Provider (假 LLM Provider)** — 本地开发与 e2e 测试共用的 Provider 记录，`baseUrl` 指向 Electron Main 启动的本地 HTTP server（默认 `http://127.0.0.1:50000/mock/anthropic`，dev / e2e 共用）。shape 与真实 Provider (`minimax` / `deepseek`) 完全一致（同 `id` / `label` / `apiKey` / `llm.{baseUrl, defaultModel, models, ...}` 字段），`AnthropicTransport` 不识别其性质 —— 一律走标准 `fetch()` 流程；data 来源是 `src/main/mock-server.ts`（per "Mock Server"），POST `/mock/anthropic/v1/messages` 后读 Q→A Table 出 SSE 字符串，沿用 `parseSseLine` 解析路径。**唯一数据源路径**：**Q→A Table** —— `src/assets/qa.dev.json`（per "Dev Q→A File"，dev 与 e2e 共用同一份文件，per ADR-0027）；mock-server 启动时一次性加载（per "Q→A Table"）；miss 无 `default` 时返回 `[mock] no canned response queued` warning SSE。V2 起 `__MOCK_LLM_QUEUE__` window global + `mockStreamTurn` 已整体移除；不保留进程内 JS shim 路径。e2e / dev 注册均走 `updateSettings` IPC 或 Settings UI（dev 在 Add Provider 弹窗里用 Mock 模版单选 prefill，per "Add Provider Dialog Mock Template"），路径与真实 Provider 注册一致（无 bypass 代码路径）。V3 起 IPC 实现从 Tauri command 变为 Electron `ipcMain.handle('updateSettings', ...)`；fake-provider 识别点与 bypass 路径不变 (per ADR-0024)。_避免_：transport 层识别 mock（`isMockMode` / `mock://` prefix 跳过 fetch）——一切走真 fetch；为测试单写 Electron IPC handler；wiremock / 独立 HTTP server 进程；为 dev 新起 independent mock marker (`mock://`、`test://`、`qa://` 等) —— 任何在 transport 之外的 mock 识别都违反本条。
- **Mock Server (本地 Q→A HTTP server)** — `src/main/mock-server.ts` 启动的本地 HTTP 服务，监听 `127.0.0.1:50000`（`process.env["CODEMAN_MOCK_PORT"]` 可覆盖）。POST `/mock/anthropic/v1/messages` 处理：读 JSON body，提取 `messages` 中**末条 `role:"user"` message**（per `extractLastUserText`；v2026-07-07+ 改 last-user-msg lookup，提升续接会话 UX — 用户中途换 entry key 如 "three-blocks" 即可命中；v3.0.x 早期版本锁首条，弃用），substring match Q→A Table（per "Q→A Table"），命中后按 `entry.turns[N]` 合成标准 Anthropic SSE 流（per "Scripted Multi-Turn Entry"），其中 N = assistant 消息数；miss 无 `default` 时返回 `[mock] no canned response queued` SSE。生产构建（`NODE_ENV === "production"`）**不启 server**（除非 dev 用户主动创建 `http://127.0.0.1:50000/...` provider）。e2e / dev 共用同一 server。_避免_：server 内识别 mock provider 性质（user 配啥 baseUrl 都受理）；server 依赖 vite / 渲染层；让 server 写 settings / IPC —— 服务是 stateless HTTP responder。
- **Q→A Table (Q→A 表)** — Fake LLM Provider 的 entry 数据源，**dev 与 e2e 共用同一份** `src/assets/qa.dev.json`（per "Dev Q→A File" 与 ADR-0027）。Electron Main process 启动时**一次性加载到内存数组**，**不在运行时重读**（reload 不在 scope，避免文件 mtime race + 简化语义）。加载优先级（per `qa-loader.ts::loadQaTable`）：`CODEMAN_TEST_QA_TABLE` env var（保留作为可选 override，正常 e2e 不设）→ 未设且 dev 模式则加载 `qa.dev.json` → 否则空表。V3 起加载位置在 Node `src/main/index.ts` 启动钩子 (per ADR-0024)。Shape：顶层 `QaEntry[]` JSON 数组。
- **Dev Q→A File (qa.dev.json)** — dev 与 e2e 共用的 Q→A seed，路径 `src/assets/qa.dev.json`（per ADR-0027）。在 dev 模式（`NODE_ENV !== "production"` 或 vite-dev server）或未设 `CODEMAN_TEST_QA_TABLE` 的 e2e spawn 时由 Main 启动钩子加载，作为 mock-provider 的 entry 数据。Shape 与 Q→A Entry 完全一致（`QaEntry[]`），含 `default?: true` fallback。文件 ship 进 git；每个 Playwright worker 的 mock-server 进程各自加载同一份文件（per-worker port 隔离而非 per-worker Q→A 隔离，per ADR-0027）。**条目顺序**：e2e spec-specific keys（`XX::`-前缀）排在前面，generic dev keys（`hello`/`read`/`list`/`ping`/`think`/`tool`/`three-blocks`/`summarize`）排在后面，default 排在最末。substring first-wins（per `mock-server.ts::lookupQaAnswer`）保证 spec 命中自己 entry 不会被 dev entry 截胡。开发期 substring miss + 无 default → mock server 走 `[mock] no canned response queued` SSE warning fallback（与 e2e 路径语义对齐，无 silent leak）。_避免_：起 `.test.`/`.fixture.`/`.e2e.` 后缀以区分（QA 术语已明确覆盖两类来源）；运行时改 qa.dev.json（per "Q→A Table" immutable 约束）；重新引入 per-worker Q→A 隔离文件（per ADR-0027，per-worker port 已足够隔离）。
- **Add Provider Dialog Mock Template (Add Provider 弹窗 Mock 模版)** — Settings → Providers 区 `+ Add provider` 弹窗实现为 **命令式函数** `createProviderFormDialog()`（`src/features/settings/components/add-provider-dialog.tsx`，基于 `codeman-dialog.show<Provider>`；dismiss 路径 resolve `null`）。弹窗顶部 type 单选 `[Real API] / [Mock (dev)]`。选 Mock 时仅作为字段预填 — 不锁字段、不隐藏字段：pre-fill 值为 `{ id: 'mock-N', label: 'Mock', apiKey: '', llm: { defaultModel: 'mock-default', baseUrl: 'http://127.0.0.1:50000/mock/anthropic', apiType: 'anthropic-messages', models: [{ id: 'mock-default', label: 'Mock' }], modelsEndpoint: '' } }`（`baseUrl` 默认指向本地 mock server，per "Mock Server"）；用户可在保存前手改任意字段（包含 baseUrl 与 port）。提交后 dialog 构造完整 `Provider` resolve 给 caller，caller 走 `appStore.set({ providers: [...cur, p] })` + `settingsSaver.scheduleSave()`（Settings.tsx 行内 handler，无独立 store action / composable）。添加后 Provider 走既有 `updateSettings` IPC + `buildEnabledProviders` 自动出现在 LLM selector（无新增过滤逻辑）。dev 启动不预填（无 settings.json 污染）；seed 数据从 "Dev Q→A File" 加载。_避免_：把 Mock 模版做成固定 entry 预填到 settings.json（与"manual add 哲学"冲突）；用新 schema 字段 `llm.kind` 区分（mock 性质已由 baseUrl 唯一识别 —— 而 baseUrl 即本地 mock server URL）；为 mock 单独写 IPC handler（违反 "Fake LLM Provider" 单一注册路径）；把 form 弹窗做成 settings.tsx 持久化的 `<Dialog>` 组件（违背 codeman-dialog 一致性，form-state 序列化反而绕路）。
- **Q→A Entry (Q→A 条目)** — Q→A Table 单条记录，shape: `{ question: string, turns: QaTurn[], default?: true }`（V3 起）。
  - `question` — 跟 user message content 做 **substring 匹配**（case-sensitive），first-wins 命中。
  - `turns` — script of agent-loop responses，由 mock-server 按 `entry.turns[N]` 顺序轮换。`N` = 请求中 `role: "assistant"` 的消息数（即上几轮已经发出去的 turn 数）；初始请求 N=0 → `turns[0]`；tool execution 后 follow-up 请求 N=1 → `turns[1]`，以此类推。N >= turns.length → 进入 **Script Exhausted Short-Circuit**（per "Scripted Multi-Turn Entry"）。
  - `default?: true` — fallback 标记。`substring` miss 且无 default 命中时，mock server 返回 `[mock] no canned response queued` warning SSE（避免静默漏测）。同一文件可含多个 `default: true` entry（按数组顺序 first-wins）。
  - **V2 兼容性**：`normalizeQaEntries` 仍接受 legacy 顶层 `answer`/`text`/`thinking`/`toolUses` 字段，自动包装为 `turns: [{text, thinking?, toolUses?}]`；新 fixture 一律写 `turns[]`（V3 强制，见 ADR 占位）。
- **Q→A Turn (Q→A 轮次)** — Q→A Entry 单 turn 形状，shape: `{ thinking?: string, text: string, toolUses?: QaToolUse[] }`。
  - `thinking?` — 可选思考内容，输出在 text 之前（Anthropic 协议顺序），单 `thinking_delta` + `signature_delta`（不 per-char 流，因 user-visible 度低）。
  - `text` — 必填 assistant 文本，可空串（当只有 thinking/toolUses 时）。mock-server 逐字 emit `text_delta`（per-char streaming, `CODEMAN_MOCK_DELTA_SIZE` 控制 chunk 长度）。
  - `toolUses?` — 可选工具调用数组，输出在 text 之后。每个变成完整 `tool_use` block（start + 单 `input_json_delta` + stop）。
- **Scripted Multi-Turn Entry (脚本化多 turn entry)** — `QaEntry.turns.length > 1` 的 entry，触发 agent loop 多轮响应。算法（mock-server.ts `handleRequest`）：
  1. **Lookup**：`substring` 匹配请求**末条** user message（v2026-07-07+ 从首条改末条；让用户在续接 session 中途换 entry key 即可触发不同 canned response，无需开新会话；v3.0.x 早期版本锁首条，弃用）。
  2. **Turn Index**： `turnIdx = min(asstCount, entry.turns.length - 1)` — asstCount（请求里 `role:"assistant"` 消息数）超出 entry turns 数时 cap 到最后一个 turn。**v2026-07-07+ 行为变更**：取消 `(mock) Script complete.` short-circuit；单 turn entry 因此永远 serve `turns[0]`（任何 asstCount 下 user 都能拿到 canned response，无需开新会话）。多 turn entry asstCount 仍按 N 递增推进 fresh chat iteration，但 overshoot 时不再 short-circuit 而是 serve 最后一个 turn。
  3. **Serve**：`entry.turns[turnIdx]` 经 `buildSseTurnEvents` 合成完整 Anthropic SSE 流（thinking + text + toolUses 顺序固定）。
  4. **Loop Termination**：agent loop 不会因为 short-circuit 取消而卡死 — 每次 tool execution 后 last user msg 变成 toolResult 内容（不再匹配 entry key），自然走到 `*` default fallback 的 end_turn，loop 终止。
  - **历史 post-tool short-circuit 已废止**：v2026-07-07+ 不再有 `(mock) Script complete.` 短响应；canned response 永远 serve（`turns[0]` 为单 turn entry 默认；多 turn 按 asstCount 推进；overshoot cap 到 last turn）。旧版 `(mock) Tool execution acknowledged.` 文本已删除。
  - _避免_：维护 in-memory `Map<convKey, {entry, idx}>` 状态化方案（per "Mock Server" stateless 约束）；让脚本 turn 间改 `model`/`system`/`temperature`（per-turn control 超出 Q→A 表职责）；从 V3 first-user lock 倒退回 early V2 last-user + toolResult short-circuit 模式（已证 UX 不友好，2026-07-07 调研固化）。

### Localization

- **Developer Language (开发者语言)** — 标识符、注释、治理文档的语言。分层：identifier 保持英文（与 Electron / Solid / Effect-TS / pi-mono / Tailwind / Vite / Vitest / Playwright 生态对齐），prose 与注释走中文。Canonical 词汇表是 `CONTEXT.md`。_避免_：bilingual inline annotations、翻译 identifier。
- **User Language (用户语言)** — UI 字符串（按钮 / 错误 / 提示）的语言。通过 `Settings.userLanguage: "zh" | "en" | "auto"` 配置。没有 i18n runtime；UI 字符串硬编码英文，与该设置解耦。_避免_：作为代码注释翻译的副作用改动 UI 字符串。
- **Test Description (测试描述)** — `it("xxx")` / `test("xxx")` 中描述测试目标的可读字符串。出现在测试报告中。约定：**中文**（例如 `it("可以保存 LLM API key")`）。_避免_：新测试使用英文 test description。
- **Assertion (断言)** — 测试体内的 runtime 检查，例如 `expect(x).toBe(y)`。**锚定 UI 字符串时英文**（必须与 UI 完全一致），**fixture 数据时中文**（例如 `toHaveBeenCalledWith({ content: '你好' })`）。_避免_：当底层值是 UI 字符串时使用中文断言字符串（运行时会失败）。
- **UI String (UI 字符串)** — 渲染 UI 中展示的文本（按钮标签、placeholder、错误信息、aria-label）。始终输出英文 UI 字符串，与 `userLanguage` 无关。注释翻译工作不动 UI 字符串；未来 i18n 工作独立追踪。
- **Developer String (开发者字符串)** — 写入日志、console、panic 消息或 `Result::Err` 变体（不向用户展示）的字符串字面量。约定：**中文**。_避免_：新代码使用英文 log message（破坏 grep 一致性）。
- **Translation Rules (翻译规则)** — 操作手册，位于 `docs/translation-rules.md`。包含品牌名保留、术语映射表、标点规则、注释格式。翻译工作流以此文档为一致性约束。

## Domain shape

```
Agent
  ├── runtime          (createAgentRuntime() 工厂, per-conv 实例化 per ADR-0019)
  ├── bridge           (Effect → Solid createStore 翻译器, conversations.store.ts)
  └── tools[]          (类型化函数；计费 + 文件 + 网页抓取)
        ├── get_balance(provider_id)             → Snapshot
        ├── get_plan_quota(provider_id)          → Snapshot
        ├── read_file(workspaceId, path)        → string
        ├── write_file(workspaceId, path, text) → void
        ├── edit_file(workspaceId, path, old, new, replaceAll) → void
        ├── search_files(workspaceId, glob, pattern?) → FileMatch[]
        ├── delete_file(workspaceId, path)      → void
        └── webfetch(url, format?, timeout?)    → string

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

Provider              (Settings.providers[].apiKey + llm 必选 + .billing 可选, ADR-0015)
  ├── id, label, enabled
  ├── apiKey: string                    ← 明文, 单一字段, LLM + billing 共用
  ├── llm: { defaultModel, baseUrl, apiType, models[], modelsEndpoint }
  └── billing?: { kind: "balance" | "plan_quota" }
```

## Settings

通过 `electron-store` 持久化（JSON 文件位于 `%LocalAppData%\codeman-agent\settings.json`，per ADR-0024；V3.1+ schema 字段 camelCase，per ADR-0024 D10）。完整 schema 位于 `src/main/settings-schema.ts`；canonical TS 镜像位于 `src/renderer/shared/lib/types.ts`。`SettingsSchema.sanitize()` 钳制不变量（`autoArchiveAfterDays >= 1`、`maxHistory >= 10` 等）。

```ts
interface Settings {
  // A. Providers (统一记录:llm 必选,billing 可选)
  providers: Array<{
    id: string; // 预置 "minimax"
    label: string; // 人类可读名
    enabled: boolean;
    apiKey: string; // 明文;LLM + billing 共用 (ADR-0015)
    llm: {
      // 必选
      defaultModel: string;
      baseUrl: string;
      apiType: "anthropic-messages";
      models: ModelMeta[]; // 用户可编辑的模型列表
      modelsEndpoint: string; // 拉取模型列表的 URL(per-provider 可配置)
    };
    billing?: {
      // 可选
      kind: "balance" | "plan_quota";
    };
  }>;

  // B. 默认行为
  defaultLlmProviderId?: string;
  userLanguage: "zh" | "en" | "auto";
  theme: "light" | "dark" | "system";

  // C. App
  startAtLogin: boolean;

  // D. Window
  window: {
    rememberPosition: boolean;
    rememberSize: boolean;
    defaultSize: { width: number; height: number };
    minSize: { width: number; height: number };
  };

  // E. System prompt
  systemPrompt: {
    default: string; // 多行
    userCanEdit: boolean;
  };

  // F. Conversations
  conversations: {
    autoArchiveAfterDays: number; // 默认 30
    maxHistory: number; // 默认 1000
  };

  // G. Deleted — workspaces 已移出 Settings,改由 WorkspaceService (SQLite) 管理 (ADR-0023 D8-W)
}

interface ModelMeta {
  id: string; // "MiniMax-M2.5-highspeed" | ...
  label: string; // "M2.5 Highspeed" | ...
  contextWindow?: number; // token 上限
  deprecated?: boolean; // UI 标灰
  thinking?: boolean; // 是否支持 extended thinking
}
```

**API 密钥现在直接进 Settings JSON**（`Provider.apiKey` 字段，明文存盘，见 ADR-0015）。**没有**单独的 store 命名空间或 OS keyring 隔离。V1.7+ 之前的 `llm_providers/<id>/api_key` 与 `billing/<id>/api_key` 两个 store 路径已删除。同一家公司 LLM 和 billing 调用复用**同一** key。

**默认预填**：`Settings::Default` 编译时预置一条 LLM provider 记录（`id: "minimax"` / `defaultModel: "MiniMax-M2.5-highspeed"` / `baseUrl: "https://api.minimaxi.com/anthropic"` / `apiType: "anthropic-messages"`），并预填对应 billing 子对象（`kind: PlanQuota`）。首次启动即可用，用户只需在 Settings UI 填 MiniMax API key。

## 认证约定

- **LLM providers** 通过 pi-mono 标准机制认证（因 provider 而异：OpenAI Bearer、Anthropic `x-api-key`、OpenAI 兼容自定义 header）。`pi-ai` 负责构造 header；密钥值来自 `Provider.apiKey`（Settings JSON 字段，ADR-0015）。
- **Billing providers** 使用 `Authorization: Bearer <Provider.apiKey>`。header 在 TS adapter 内部构造；密钥值来自同一字段。密钥存 webview 进程内的 Settings JSON；前端可直接读取字符串值（V1.7+ 前的 `has_key: boolean` 探测已废止，因字段恒存在）。

## Non-goals

- 单 provider 多账号
- 历史图表 / 时序数据
- 分支会话
- 跨会话用户事实的自动记忆 / 跨 session 持久化
- 内置通用工具（无 shell、无 IDE 集成——但用户可经 MCP 引入外部工具，per ADR-0032）
- 无鼠标操作（无热键、无键盘快捷键）
- 跨平台打包（Electron 保持可移植；仅 Windows，per ADR-0024）
- 自动更新、代码签名
- 点击穿透透明区域
