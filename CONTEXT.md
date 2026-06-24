# codeman-agent — 项目语境

独立 Windows 桌面 AI 智能体，基于 Tauri 2 (Rust) + Solid.js + TypeScript + Effect-TS，运行时采用 pi-mono (`@mariozechner/pi-ai` + `@mariozechner/pi-agent`)。主窗口是 LLM 对话 (`/`)，设置走 `/settings` 路由（TanStack Router），内置 2 个计费工具（`get_balance`、`get_plan_quota`，覆盖 DeepSeek 与 MiniMax）和 5 个文件工具（`read_file` / `write_file` / `edit_file` / `search_files` / `delete_file`）。本文档固定词汇表，确保 plan、code 与 commit message 保持一致。

## 词汇表

### 领域

- **Agent (代理)** — 产品本体。LLM 驱动的助手，运行在独立 Windows 桌面窗口中。_避免_：widget、app、client。
- **Conversation (会话)** — 用户拥有的持久聊天线程。线性消息序列；不支持分支。每 Conversation 至多 1 个 active 流，多 Conversation 可并行 streaming。active 流定义：`run()` 已调用且 `done` / `error` / `cancel` 之一尚未触发。active 流的取消走 `AgentRuntime.cancel(conversationId)`。
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

- **Workspace (工作区)** — 用户在 Settings (`Settings.workspaces: Array<{ id, label, root_path, enabled }>`) 中配置的根目录，agent 的 file tool 仅在该目录树下操作。Agent 越界 (canonical path 不在 workspace root 内) 由 Tauri command 拒绝 (返回 `SandboxViolation` 错误)。_避免_: sandbox、root directory、project root。
- **File Tool (文件工具)** — pi-agent 工具族，内置 5 个: `read_file` (读全文) / `write_file` (覆盖写) / `edit_file` (替换文本，支持 `replace_all`) / `search_files` (glob + content 搜索) / `delete_file` (移至回收站)。所有工具通过 Tauri command 调 Rust `std::fs`，沙箱由 workspace 边界约束。_避免_: fs tool、file operation (过载)。
- **Sandbox Violation (越界错误)** — Tauri command 在 `canonicalize(path)` 后检测到 `path` 不在任何已启用 workspace 目录下时返回的错误。Agent 收到后必须重新规划 (改路径 / 让用户加 workspace) 而非重试原路径。

### 架构

- **Runtime (运行时)** — 包装 pi-mono agent loop 的**纯工厂函数** `createAgentRuntime()`。无 `Context.Tag` service、无 Layer DI、无内部 Map（V2 起 per ADR-0019 supersede ADR-0014 D1）。每次调用 `createAgentRuntime()` 返回独立的 `AgentRuntime` 实体，存放在 `ConversationState.runtime`（per-conv 实例化）。`AgentRuntime.run({ context, provider })` 内部仍用 Queue-based Mailbox 架构（per ADR-0017）：`Queue.unbounded` 作为 event bus，`Effect.fork` 在子 fiber 里跑 `agent.subscribe + agent.prompt`，事件通过 `Queue.unsafeOffer` 推入；consumer 端 `Stream.fromQueue(queue)` 是 leaf operator。每次 `run()` 调用新建 pi-mono `Agent`，`initialState.messages = context`（store 来的浅拷贝，per ADR-0019 D2 "Agent 是 per-run transient"）；`AbortController` 注入 transport，`cancel()` 通过 `abortController.abort()` 触发 fetch abort。_避免_：agent core、agent loop、AgentRuntime service（旧 Context.Tag + Layer 设计）。
- **Per-Conversation Runtime (会话级运行时)** — 每个 Conversation 对应一个 `createAgentRuntime()` 产物（即一个 `AgentRuntime` 实体），存放在 `ConversationState.runtime`（`src/features/chat/stores/conversations.store.ts` inline 定义）。生命周期跟随 Conversation：创建于 Conversation 首次 send 时（lazy），销毁于 Conversation 被 delete / archive。in-flight 流不被 cancel — 切换 Conversation 时 partial 进度保留在 `ConversationState.messages`（stream 订阅实时写）。同一 Conversation 至多 1 个 active 流；多 Conversation 可并行 streaming。_避免_：singleton Agent（旧 ADR-0014 D1 已被 supersede）、per-request Agent、Per-Conversation Agent（旧 term,已并入本词条）。
- **Conversation State (会话视图)** — `Conversation`（DB-backed 持久字段）+ per-conv reactive state（`messages: Message[]` + `streamingMessageId: string | null`）+ per-conv runtime（`runtime: AgentRuntime`）的组合类型。定义在 `src/features/chat/stores/conversations.store.ts`（V2 起合并原 `messages.store` + `agent.store`，per ADR-0019 D3）。Solid `createStore<{ activeId: string | null; byId: Record<ConvId, ConversationState> }>` 管理反应式。UI 读 `store.byId[activeId()]` 拿到 reactive 视图；store 是 single source of truth，runtime 是 stateless LLM caller。_避免_：Per-Conv message signal（旧 `messages$` 全局 signal，已废止）、Agent Map（旧 `Ref<Map<ConvId, Agent>>`，已废止）。
- **Bridge (桥接层)** — 将 Effect `Stream` / `Effect` 输出翻译为 Solid `createStore` 的层。V2 起归口到 `conversations.store.ts`：stream `runForEach` 订阅 → `setStore("byId", convId, ...)` 写 reactive state。UI 组件不 `import 'effect'`。_避免_：adapter（过载）。
- **Effect Service (Effect 服务)** — 类型化异步模块，暴露 `Effect<A, E, R>` 或 `Stream<A, E, R>`。通过 Effect layer 组合；通过 mock layer 测试（`@effect/vitest`）。V2 起 chat 域不再用 Effect Service 模式承载 runtime（`createAgentRuntime` 是纯工厂函数而非 Context.Tag），但 DB 桥接仍用 Service 模式（`ConversationService` / `MessageService` in `shared/lib/tauri.ts`）。
- **IPC** — Tauri 命令桥接。Rust 端命令注册在 `src-tauri/src/lib.rs::invoke_handler!`；TS 端包装在 `src/shared/lib/tauri.ts`（Service Tag + Live Layer）。`invoke` 在该文件之外不出现。

### 密钥

- **API Key (API 密钥)** — Provider 的对外调用凭据，shape 为 `Provider.api_key: string`。**明文存于 Settings JSON**（`%LocalAppData%\codeman-agent\settings.json`），与 Settings 其它字段同档；不再分 LLM / Billing 二分（ADR-0015）。LLM 调用和计费工具调端点都复用同一 key。V1 单机单用户威胁模型下接受明文；如未来需 OS 级密钥管理（keyring / Windows Credential Manager）需重做 ADR-0015。_避免_：把 key 单独存 Tauri store 再走 IPC（V1.7+ 前的设计，已废止）。
- **Secret** — Rust 端 `Secret<String>` newtype，`Debug` / `Display` 打印 `Secret(***)` / `***`。V1.7+ 后 Settings JSON 明文存 key，`Secret` 主要用于 pi-agent 运行时构造 header 时临时包裹。**调用方**：`logger.*` / `log::*!` 不得打印完整 secret 值（任一语言）；`Secret` 类型自动重载 `Debug` / `Display`，裸字符串变量需手动 redact 为 `***`。V1.10+ 起本规则从"强制 redact"降级为 developer 自觉——理由是 simple logger API 与自动 redaction 实现冲突，详见 ADR-0018 D6。_避免_：对任何凭据使用裸 `String`。

### Settings 与状态

- **Settings (设置)** — 通过 `tauri-plugin-store` 持久化的 JSON 文档，位于 OS app-data 目录。包含统一 `providers[]` 数组（每条 `Provider` 含 `api_key` 明文字段，见 ADR-0015），以及 window / theme / system_prompt / conversations / workspaces / user_language / start_at_login 等字段。**API 密钥现在直接落在 Settings JSON 内**（V1.7+ 之前的"分 Tauri store 命名空间"模型已废止）。
- **App Store (全局应用状态)** — `src/shared/stores/app.store.ts` 提供的 Settings reactive 桥接层（ADR-0015 + ADR-0016）。`createStore` 包装 settings。公开 API（5 个）：
  - `appStore.state.value` — reactive 读
  - `appStore.set(patch)` — 写 state，**不**触发 IPC（debounce 由 `features/settings/lib/settings-saver` 触发）
  - `appStore.forceFlush()` — 跳过 debounce 立即 IPC（footer Save 调用）
  - `appStore.refresh()` — 从后端重载
  - `appStore.refreshProviderModels(id)` — 调 `ProviderService.fetchModels` 拉新 models 列表并写 state（含 `default_model` 自动 fallback 不变量）
  - `appStore.pickWorkspacePath()` — 调 OS folder picker，返回选中路径或 `null`
  - `appStore.deleteProvider(id)` — 从 `providers[]` 移除指定记录
  - `appStore.clearAllHistory()` — 清 SQLite conversation 表（settings 路由 advanced tab 调用）

  **D4 硬规则（ADR-0016）**：**所有** service 操作（`Effect.gen(...yield* Service...)` / 裸 `invoke("...")` / 裸 `fetch`）只能在 Store 中出现。组件层 `.tsx` 文件**禁止**直接 import service 或调 IPC，全部走 `Effect.runPromiseExit(store.method(...))` + `Exit.match`。测试代码（`*.test.ts*`）不受 D4 约束。
- **Stale (过期)** — `Snapshot` 时间戳超过 Billing Provider 的 `stale_after_seconds`；传统的"过期徽标"语义在 tool result 缓存场景保留。

### 样式

- **Utility Class (工具类)** — Tailwind v4 utility-first CSS 类（例如 `flex h-screen bg-zinc-50`）。唯一的视觉层；每个组件的外观都通过 utility class 表达。_避免_：BEM class、atomic CSS、scoped CSS。
- **Theme (主题)** — 用户在 Settings 中选择的三态视觉模式（`light` / `dark` / `system`）；通过 `<html class="dark">` 切换（无 `prefers-color-scheme` 媒体查询 —— `system` 模式由 `src/shared/stores/theme.ts` 中的 Solid effect 读取）。_避免_：color scheme、appearance、mode。
- **Style Token (样式令牌)** — 在 `@theme` 块中定义的语义名（例如 `primary-500`、`zinc-900`），组件引用而非裸 hex。_避免_：design token（与 Material / Apple / IBM 词汇过载）、CSS variable（实现细节）。

### Localization

- **Developer Language (开发者语言)** — 标识符、注释、治理文档的语言。分层：identifier 保持英文（与 Tauri / Solid / Effect-TS / pi-mono / Tailwind / Vite / Vitest / Playwright 生态对齐），prose 与注释走中文。Canonical 词汇表是 `CONTEXT.md`。_避免_：bilingual inline annotations、翻译 identifier。
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

Conversation State    (src/features/chat/stores/conversations.store.ts, V2 in-memory view)
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

通过 `tauri-plugin-store` 持久化（JSON 文件位于 app-data 目录）。完整 schema 位于 `src-tauri/src/settings.rs`；canonical TS 镜像位于 `src/shared/lib/types.ts`。`Settings::sanitized()` 钳制不变量（`auto_archive_after_days >= 1`、`max_history >= 10` 等）。

```ts
interface Settings {
  // A. Providers (统一记录：llm 必选，billing 可选)
  providers: Array<{
    id: string;             // 预置 "minimax"
    label: string;          // 人类可读名
    enabled: boolean;
    api_key: string;        // 明文；LLM + billing 共用 (ADR-0015)
    llm: {                  // 必选
      default_model: string;
      base_url: string;
      api_type: "anthropic-messages";
      models: ModelMeta[];             // 用户可编辑的模型列表
      models_endpoint: string;         // 拉取模型列表的 URL（per-provider 可配置）
    };
    billing?: {             // 可选
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

  // G. File IO workspaces
  workspaces: Array<{
    id: string;
    label: string;
    root_path: string;
    enabled: boolean;
  }>;
}

interface ModelMeta {
  id: string;               // "MiniMax-M2.5-highspeed" | ...
  label: string;            // "M2.5 Highspeed" | ...
  context_window?: number;  // token 上限
  deprecated?: boolean;     // UI 标灰
  thinking?: boolean;       // 是否支持 extended thinking
}
```

**API 密钥现在直接进 Settings JSON**（`Provider.api_key` 字段，明文存盘，见 ADR-0015）。**没有**单独的 Tauri store 命名空间或 keyring 隔离。V1.7+ 之前的 `llm_providers/<id>/api_key` 与 `billing/<id>/api_key` 两个 Tauri store 路径已删除。同一家公司 LLM 和 billing 调用复用**同一** key。

**默认预填**：`Settings::Default` 编译时预置一条 LLM provider 记录（`id: "minimax"` / `default_model: "MiniMax-M2.5-highspeed"` / `base_url: "https://api.minimaxi.com/anthropic"` / `api_type: "anthropic-messages"`），并预填对应 billing 子对象（`kind: PlanQuota`）。首次启动即可用，用户只需在 Settings UI 填 MiniMax API key。

## 认证约定

- **LLM providers** 通过 pi-mono 标准机制认证（因 provider 而异：OpenAI Bearer、Anthropic `x-api-key`、OpenAI 兼容自定义 header）。`pi-ai` 负责构造 header；密钥值来自 `Provider.api_key`（Settings JSON 字段，ADR-0015）。
- **Billing providers** 使用 `Authorization: Bearer <Provider.api_key>`。header 在 TS adapter 内部构造；密钥值来自同一字段。密钥存 webview 进程内的 Settings JSON；前端可直接读取字符串值（V1.7+ 前的 `has_key: boolean` 探测已废止，因字段恒存在）。

## MiniMax 端点

MiniMax `plan_quota` 端点（`https://api.minimaxi.com/anthropic/v1/quota/plan`）当前有效。`balance` 端点尚未公开验证，调用时 adapter 返回 `Upstream` 错误。DeepSeek balance 端点 `https://api.deepseek.com/user/balance` 当前有效；DeepSeek 不支持 `plan_quota`，调用时 adapter 返回 `Upstream` 错误。

## Non-goals

- 单 provider 多账号
- 历史图表 / 时序数据
- 分支会话
- 跨会话用户事实的自动记忆 / 跨 session 持久化
- 计费与文件工具之外的通用工具（无 shell、无 IDE 集成）
- 无鼠标操作（无热键、无键盘快捷键）
- 跨平台打包（Tauri 保持可移植；仅 Windows）
- 自动更新、代码签名
- 点击穿透透明区域

