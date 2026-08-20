# codeman-agent — V4 项目语境

Windows 桌面 AI 编码 agent（基于 Electron + Solid.js + TypeScript），运行时底座采用 `@earendil-works/pi-coding-agent` (≥ 0.84.x)。V4 启动于 2026-08-20，是从 V3（pi-mono 自建运行时底座 + SQLite 会话层 + 沙箱安全模型）的大版本重构。V3 仓库的历史 ADR / CONTEXT.md 在 V4 启动时整体清零，本文档从零按 V4 目标态写。

本文档固定词汇表，确保 plan、code 与 commit message 保持一致。V4 决策依据详见 `docs/adr/0001–0012`。

## 词汇表

### 领域

- **Agent (代理)** — 产品本体。LLM 驱动的桌面 AI 助手，运行在独立 Windows 桌面窗口中，V4 起由 pi-coding-agent 头less SDK 提供运行时底座。_避免_：widget、app、client、chatbot。
- **Pi Session (pi 会话)** — 单个用户对话的持久化单位。由 pi-coding-agent `SessionManager` 管理，存为 cwd 下的 JSONL session 文件（`~/.pi/sessions/<id>.jsonl`）。V4 起替代 V3 SQLite `conversations` + `messages` 表。_避免_：conversation（旧 SQLite 实体语义）、thread、chat history。
- **Session Entry (会话条目)** — Pi Session 文件中的单条 JSONL 记录，可能为 `user / assistant / tool_use / tool_result / system / compaction_marker`。V4 起替代 V3 `Message` SQLite 实体。_避免_：message（旧 SQLite 实体语义）。
- **Tool (工具)** — Agent 可调用的类型化函数。V4 工具集 = pi-coding-agent 内置 7 件套（`read / write / edit / bash / grep / find / ls`）+ 1 个自定义工具（`webfetch`）。_避免_：command、function、action。
- **Tool Call (工具调用)** — LLM 请求调用工具的指令。携带工具名与 JSON 参数。V4 由 pi runtime 通过 tool_use / tool_result JSONL 条目持久化。_避免_：function call（旧 OpenAI 术语）。
- **Tool Result (工具结果)** — 工具调用的返回值。可能携带类型化错误。_避免_：function result。

### Cwd

- **Cwd (当前工作目录)** — Pi Session 的工作目录。V4 起替代 V3 Workspace 概念。`SessionManager.create(cwd)` 创建 session 时绑定 cwd；`SessionManager.open(path)` 打开已有 session。**无沙箱边界**——pi 内置工具（`read / write / edit / bash`）直接以用户权限操作 cwd 下的任意文件。_避免_：workspace（V3 实体，已删除）、root directory、project root、working directory。
- **Change Cwd (切换 cwd)** — 用户在 Home 点击按钮触发 `dialog.showOpenDialog` 选新 cwd → 关闭当前 session + `SessionManager.create(newCwd)` 新建 session。V4 不再有"workspace 切换"语义（V3 的 per-Conv workspace 锁定删除）。_避免_：workspace switch、change directory。

### Provider

- **Provider (提供商)** — V4 由 pi-coding-agent `ModelRuntime` 管理的 LLM provider 记录。`auth.json`（API key）+ `models.json`（模型目录）。V4 替代 V3 自建 `electron-store settings.json providers[]` 数组。_避免_：client、vendor、service（过载）。
- **Pi Auth.json (认证存储)** — V4 API key 明文存储位置，由 `ModelRuntime.create({ configPath })` 指定（默认 `~/.pi/auth.json`）。明文存储与 V3 ADR-0015 "V1 单机单用户威胁模型下接受明文" 一致。_避免_：API key、credentials、secrets（无加密机制）。
- **Pi Models.json (模型目录)** — pi 自带 provider 目录的模型列表，V4 起替代 V3 自建 `Provider.llm.models[]`。pi 自动从 provider endpoint 拉取最新模型列表（auto-refreshed）。_避免_：model list、models array、provider catalog（vague）。
- **Pi ModelRuntime (provider 运行时)** — V4 provider + auth + model catalog 的统一抽象层。`ModelRuntime.create({ configPath })` 初始化，暴露给 extensions 与 session。V4 替代 V3 自建 `createProviderFromConfig` + electron-store 组合。_避免_：ProviderService（V3）、provider manager。

### Protocol

- **Protocol (协议)** — LLM 上游调用的 HTTP/SSE 形态。V4 由 pi-coding-agent 的 provider 抽象管理，**不**锁死 `anthropic-messages`（V3 单协议锁定）。pi 自带 30+ 内置 provider 目录，每个 provider 有自己的 protocol 实现。V3 `Provider.llm.apiType` 字段删除。_避免_：API format、wire format（实现细节）。

### Tools

- **Pi Read / Write / Edit Tool (读写改工具)** — V4 文件操作工具，由 pi-coding-agent 内置 `createReadTool / createWriteTool / createEditTool` 提供。**无沙箱**：操作 cwd 下任意文件。V3 自建 `read_file / write_file / edit_file / search_files / delete_file` 整体删除。_避免_：file tool（V3 沙箱部分语义）、fs tool。
- **Pi Bash Tool (bash 工具)** — V4 shell 命令执行工具，由 pi-coding-agent 内置 `createBashTool` 提供。**无权限确认弹窗**：以当前用户权限直接执行子进程。V3 自建 `run_command` + PermissionService + Permission Inline Dock 整体删除。_避免_：shell tool、command tool、run command。
- **Pi Grep / Find / Ls Tool (搜索工具)** — V4 内容/文件名/目录搜索工具，由 pi-coding-agent 内置 `createGrepTool / createFindTool / createLsTool` 提供。**无沙箱**：搜索 cwd 下任意路径。
- **Webfetch (网页抓取工具)** — V4 **唯一自定义工具**，通过 pi `defineTool()` 注册。参数 `{ url, format, timeout? }`。**保留 V3 SSRF 防护**（URL scheme 校验 + DNS 预解析 + IP 黑名单 + 大小限制 + 超时），但**不**有 sandbox。HTML 用 turndown 转 Markdown。V4 替代 V3 自建 webfetch + IPC handler。_避免_：fetch tool、http tool、url tool。

### Pi Extension

- **Pi Extension (pi 扩展)** — V4 通过 pi-coding-agent `ExtensionAPI` 注册的可插拔模块。注册点：`registerTool / registerCommand / on(event) / pi.events`。V4 替代 V3 自建 Plugin Registry。_避免_：plugin（V3 概念）、module、addon。
- **Pi Skills System (技能系统)** — V4 通过 pi-coding-agent Agent Skills standard 原生支持的 prompt augmentation。skill 存放 `~/.agents/skills/<name>/SKILL.md`（YAML frontmatter + Markdown body），pi 自动发现 + manifest 注入 + `_load_skill` meta-tool。V4 替代 V3 自建双轨 skills 系统（描述驱动 + slash command）。_避免_：skill plugin（V3 概念）。
- **Pi Subagent Extension (子代理扩展)** — V4 通过 pi `ExtensionAPI` 实现的 `delegate_task` 工具，基于 pi 官方 subagent 示例。子 agent 在被委派时**现场实例化**（per-run transient），与主 session 完全隔离。V4 替代 V3 自建 multi-agents 插件。_避免_：worker agent、child agent、helper agent。
- **Pi MCP Extension (MCP 扩展)** — V4 通过 pi `ExtensionAPI` 实现的 MCP client。pi 无内置 MCP client（README 明确），自写 JSON-RPC stdio client 作为 extension 注册。V4 替代 V3 自建 MCP client + Plugin Registry 中的 MCP plugin。MCP server 配置保留在 `~/.agents/mcp_servers.json`（V3 路径不变）。_避免_：MCP plugin（V3 概念）。
- **Pi DefaultResourceLoader (资源加载器)** — V4 自动发现 cwd 下 context 文件（如 `AGENTS.md`）并注入 system prompt。V4 替代 V3 `buildSystemPrompt` 中的项目指令加载。_避免_：project instructions（V3 概念）。
- **Pi Extension Before Prompt Hook (扩展前置钩子)** — V4 通过 `ExtensionAPI.on('before_prompt')` 注册的 system prompt section 注入点。V4 identity 段、用户默认 systemPrompt、cwd 页脚通过此钩子注入。_避免_：system prompt section（V3 概念）。

### Automations

- **Automation (自动化)** — V4 端用户配置的定时任务单元，持久化于 `~/.agents/automations.json`。由 renderer UI + Electron Main `AutomationScheduler` 协同承载，**保留自建**（pi 无对应）。V4 LLM action 从"V3 走 IPC 跳 renderer 创建自建 Agent"改为"V4 走 IPC 跳 renderer 创建 pi session"。V3 plugin registry 中的 automations plugin 删除（自动化主流程保留，插件入口删除）。_避免_：cron job、scheduled task。
- **Automation Rule (自动化规则)** — V4 单条 automation 配置：`{ id, name, enabled, schedule, action, createdAt, updatedAt }`。`schedule` human-readable（interval / daily / weekly）；`action` 二选一（`llm` 或 `script`）。V3 schema 语义保留。
- **Automation Schedule (调度计划)** — V4 human-readable 表达：`interval` / `daily` / `weekly` 三选一，6 预设 + 自定义 radio。V3 schema 保留。
- **Automation Action (自动化动作)** — V4 二选一：
  - `llm`：Main IPC → renderer 创建 pi session 跑 LLM action。**为什不在 Main 跑**：V4 与 V3 一致，pi-coding-agent 仅 main 端可用，Main 跑时需跨 IPC。`{ systemPrompt, userPrompt, providerId, modelId, timeoutMs }`
  - `script`：`child_process.spawn` + 5min 默认 timeout。V4 与 V3 一致，**无 sandbox**（per ADR 0003 workspace sandbox 删除后，script action 也变"裸跑"）。`{ language: "shell" | "javascript", source, workspaceId, timeoutMs }`
- **Automation Execution (自动化执行)** — V4 单次触发的实例，持久化于 SQLite `automation_executions` 表（V4 保留 SQLite 唯一表）。`{ id, rule_id, status, trigger_kind, started_at, completed_at, duration_ms, final_text, exit_code, stderr, error, metadata_json }`。V3 schema 语义保留。
- **AutomationScheduler (Main 端调度器)** — V4 `src/main/features/automations/scheduler.ts` 单例。`app.whenReady()` 钩子 `scheduler.start()`；`before-quit` 钩子 `scheduler.stop()`。**per-rule FIFO queue**：同一 rule 在 `status=running` 时新触发进 queue，等前一个跑完。V3 语义保留。

### Thinking Level

- **Thinking Level (思考强度)** — V4 Agent 的 per-run 临时态配置 `thinkingLevel: "off" | "minimal" | "low" | "medium" | "high" | "xhigh"`，由 pi session `initialState.thinkingLevel` 字段管理。**会话内 transient**：不持久化、无 localStorage 偏好、无 Settings 全局项。**默认值跟随所选 provider 模型能力**（`ModelMeta.thinking !== true` 时 chat-view 选择器不渲染）。V3 语义保留，传输链路改为 chat-view → IPC → main → pi session。_避免_：reasoning level、思考深度。

### System Prompt

- **Pi System Prompt 组装 (pi 系统提示词组装)** — V4 由 pi-coding-agent 内部 + Extension API `on('before_prompt')` 钩子共同完成。节序：身份段（extension 注入）→ tools 列表（pi 自动从 `registerTool` 生成）→ guidelines（extension 注入）→ context 文件（`DefaultResourceLoader` 加载）→ skills manifest（pi 原生）→ 用户默认（extension 注入 SettingsManager 配置）→ cwd 页脚（extension 注入）。V3 自建 `buildSystemPrompt` 整体删除。_避免_：prompt builder（V3 概念）。
- **Context File (上下文文件)** — V4 cwd 下的项目指令文件（如 `AGENTS.md`），由 pi `DefaultResourceLoader` 自动发现并注入 system prompt。用户可在 Settings 配置 glob 模式（`SettingsManager.contextFiles`）。_避免_：AGENTS.md（特定文件名，应泛化）、project instructions。
- **User Default System Prompt (用户默认系统提示词)** — V4 用户在 Settings 配置的默认 systemPrompt，由 codeman-agent-extension 在 `before_prompt` 钩子中注入。**会话级别覆盖删除**（V3 per-conversation systemPrompt 删除）。_避免_：default prompt、user prompt template。

### Architecture

- **Pi Runtime (pi 运行时)** — V4 main process 单例，由 `createAgentSession()` + `SessionManager` + `ModelRuntime` + `SettingsManager` 构成。位于 `src/main/pi-runtime/`，在 `app.whenReady()` 后初始化。**唯一允许持有 pi-coding-agent 引用的位置**。V4 替代 V3 renderer 侧 `createAgentRuntime` 工厂（已删除）。_避免_：runtime service、V3 runtime、V3 core/llm。
- **Pi IPC Bridge (IPC 桥接层)** — V4 main ↔ renderer 的事件流桥接。main 通过 `webContents.send('pi:event', event)` 推事件，renderer 通过 `window.codeman.onPiEvent((event) => ...)` 订阅。沿用 V3 ADR-0025 D7 IPC 流式模式（V3 D7 不追溯，模式参考）。V3 `Effect.fork + Queue + Stream.fromQueue` 模式删除——pi 自带 event subscription。_避免_：stream bridge、event bus、message channel。
- **Pi Event Projection (事件投影层)** — V4 main 端把 pi 的 `AgentEvent` 转为 renderer 边界的稳定 `RuntimeEvent`（`token / thinking / tool_call / tool_result / done / message_stop / error`）。**唯一允许 renderer 与 pi 事件耦合的层**。投影后的事件类型保持稳定，renderer 代码不依赖 pi 事件类型。_避免_：event mapper（impl 细节）、event transformer。
- **Renderer View (renderer 视图层)** — V4 renderer 不持有任何 pi-coding-agent 引用（**不** `import "@earendil-works/pi-coding-agent"`）。所有 pi 交互走 `window.codeman.pi.*` IPC API。renderer = 纯视图层（Solid.js 组件 + IPC 事件订阅）。V3 renderer 同时承担 UI + runtime 的角色删除。_避免_：前端（中文歧义）、UI layer（与 V3 混）。
- **Runtime Event (运行时事件)** — V4 renderer 边界稳定事件类型：`{ type: 'token' | 'thinking' | 'tool_call' | 'tool_result' | 'done' | 'message_stop' | 'error', ... }`。由 main 端 `Pi Event Projection` 投影生成。V3 schema 语义保留（事件名不变），仅事件来源从 V3 自建 runtime 换成 IPC 桥接。_避免_：UI event（impl 细节）、view event。
- **Chat Store (聊天域 Store)** — V4 `src/renderer/src/features/chat/stores/chat.store.ts` IPC 桥接层。订阅 IPC `pi:event` 流 → Solid `createStore` 写 state。调用 `window.codeman.pi.*` 调 create session / prompt / abort / open session / list sessions。V3 合并 conversations.store + messages.store + agent.store 后**重写**为 IPC 桥接（V3 store 整体删除）。_避免_：chat state、conversations store（旧语义）。
- **IPC** — V4 Electron 跨进程命令桥接。Main 端 `ipcMain.handle(...)`；preload `contextBridge.exposeInMainWorld('codeman', api)`；renderer `window.codeman.*`。V3 包装 Service Tag + Live Layer 模式**保留**。V4 IPC surface 调整：删除 conversations / workspaces / permission / run_command；新增 `pi.*`。V3 IPC channel 命名规范（camelCase）保留。

### Schema 与错误模型

- **Schema (`effect/Schema`)** — V4 `effect` 包内置的 schema/validation 模块。V3 `Schema.Struct` + `Schema.TaggedError` 模式保留并扩展。V4 `toToolParameters()` helper 保留（pi 的 `defineTool().parameters` 仍需 typebox `TSchema`）。_避免_：zod、valibot（与 Effect 生态割裂）。
- **AppError (`AppError` 基类)** — V4 `Schema.TaggedError` 基类，位于 `src/shared/lib/errors.ts`。V3 7 个保留子类 + V4 17 个 pi 错误映射子类 = 共 **18 个子类**（详见 ADR 0009）。_避免_：Error（标准库名）、自定义 Error 基类。
- **AppError 子类清单（V4）** — 18 个子类：
  - V3 保留（7）：`NotFound / Unauthorized / Network / InvalidConfig / Database / ToolCall / Unknown`
  - V4 新增（17）：`ModelProvider / ModelAuth / ModelRateLimit / ModelContextLength / ModelTimeout / ModelProtocol / SessionNotFound / SessionPermission / SessionFilesystem / ToolExecute / ToolArgument / ToolUnavailable / Compaction / ExtensionLoad / CredentialStore / ResourceLoad / PiRuntime`
  - V3 删除（1）：`SandboxViolation`（per ADR 0003 sandbox 删除）
- **Pi Error Classifier (pi 错误分类器)** — V4 `PiError.classify(err)` 归一化分类 pi 错误（基于 `err.constructor.name` 或 `err._tag`）。位于 `src/main/pi-runtime/error-classifier.ts`。_避免_：error normalizer（impl 细节）。
- **Pi Error to AppError Mapper (错误映射层)** — V4 `src/main/pi-runtime/error-mapper.ts`，把分类后的 pi 错误映射为对应 AppError 子类。**IPC 边界错误传递的唯一出口**。_避免_：error translator、exception bridge。
- **Branded Type (品牌类型)** — V4 effect/Schema 通过 `Schema.brand` 实现的类型层 brand。V3 `WorkspaceId / FilePath / ToolCallId / ConversationId` 等品牌类型重新定义：`WorkspaceId` 删除（workspace 概念删除），`FilePath` 保留（pi 工具参数仍需），`ToolCallId / ConversationId` 重新定义为 PiSessionId / SessionEntryId。_避免_：手写 `type X = string & { readonly __brand: "X" }`。

### 密钥

- **API Key (API 密钥)** — V4 Provider 的对外调用凭据，shape 为 Pi Auth.json 单条记录。明文存于 `~/.pi/auth.json`（由 `ModelRuntime.create({ configPath })` 指定路径）。V3 ADR-0015 "明文 settings.json" 迁移到 pi auth.json（仍是明文）。V3 `Secret<String>` newtype 删除（pi 无 Secret 类型）。_避免_：token、credential、secret。

### Settings

- **Settings (设置)** — V4 由 pi-coding-agent `SettingsManager` 管理的 JSON 文档，位于 `SettingsManager.create({ configPath })` 指定路径（默认 `~/.pi/settings.json`）。包含通用字段：`theme / window / systemPrompt / userLanguage / startAtLogin / contextFiles`。V3 `electron-store settings.json providers[]` 字段删除（迁 pi auth.json）。V3 `SettingsV15` + `migrateV15SnakeToCamel` 删除（pi SettingsManager 处理 schema migration）。_避免_：preferences、configuration、options。
- **Pi SettingsManager (设置管理器)** — V4 `SettingsManager.create()` / `inMemory()`，管理全局 + project-local 分层 settings。V4 替代 V3 `electron-store`。_避免_：Settings Service（V3 概念）、App Store（V3 概念）。

### 样式

- **Utility Class (工具类)** — V4 Tailwind v4 utility-first CSS 类。V3 词汇表语义保留。
- **Theme (主题)** — V4 三态视觉模式（`light / dark / system`）；通过 `<html class="dark">` 切换。V3 语义保留。
- **Style Token (样式令牌)** — V4 `@theme` 块定义的语义名（`primary-500 / zinc-900` 等）。V3 语义保留（DESIGN.md 不变）。

### 组件

- **Codeman Component (codeman-* namespace)** — V4 `shared/components/internal/` 目录下 `codeman-` 前缀组件。V3 命名规则保留。
- **UI Primitive (design system atoms)** — V4 `shared/components/ui/` 目录下的纯展示组件（Button / Card / Checkbox / Input / Textarea / Select / Dialog / ...）。V3 语义保留。
- **Codeman Dialog (codeman-dialog 命令式 Modal)** — V4 `shared/components/internal/codeman-dialog.tsx`。V3 语义保留（`alert / confirm / show<T>`）。

### 测试

- **Unit Test (单元测试)** — V4 `vitest` + `@effect/vitest` + `@solidjs/testing-library`。V3 测试栈保留。V4 新增测试 fixture（per ADR 0012 D4）。
- **E2E Test (端到端测试)** — V4 Playwright + 真 Electron。V3 e2e 大部分删除（依赖 V3 SQLite / V3 runtime / V3 IPC），V4 新增 e2e spec 11 个（per ADR 0012 D4）。_避免_：integration test（impl 细节）。

### Localization

- **CJK-First Typography (CJK 优先排版)** — V4 Noto Sans SC 跟 Inter 同等优先级，行高按 CJK 优化（1.55 body / 1.3 label）。V3 语义保留（DESIGN.md 不变）。
- **Locale (`locale`)** — V4 `userLanguage: "zh-CN" | "en-US"`。V3 语义保留。

## Domain Shape

V4 domain shape：

```
PiCodingAgent (headless SDK)
  ├─ SessionManager ─→ JSONL session file (cwd/.pi/sessions/<id>.jsonl)
  ├─ ModelRuntime ─→ auth.json + models.json (~/.pi/)
  └─ SettingsManager ─→ settings.json (~/.pi/)
        ↑
        │ createAgentSession()
        │
Pi Runtime (main process)
  ├─ PiRuntime 单例 (src/main/pi-runtime/)
  ├─ Custom Tools: webfetch (SSRF-protected)
  ├─ Built-in Tools: read / write / edit / bash / grep / find / ls
  └─ Extensions:
       ├─ codeman-agent-extension (system prompt sections + identity)
       ├─ Pi Skills System (Agent Skills standard)
       ├─ Pi Subagent Extension (delegate_task)
       └─ Pi MCP Extension (JSON-RPC stdio client)
        ↑
        │ IPC bridge (webContents.send + ipcMain.handle)
        │
Renderer View (Electron renderer)
  ├─ Chat Store (IPC bridge → Solid createStore)
  ├─ Solid UI Components (chat-view / sidebar / settings / etc.)
  └─ RuntimeEvent (token / thinking / tool_call / tool_result / done / message_stop / error)
```

## 认证约定

- API key 明文存于 `~/.pi/auth.json`（pi `ModelRuntime` 拥有）
- 不反射回 DOM / 不在日志输出完整 key
- V3 `Secret<String>` newtype 删除（pi 无 Secret 类型）

## Settings

V4 Settings 字段（`SettingsManager` 持有）：

| 字段 | 类型 | 默认 |
 | 场景 |
 |---|---|---|
 | `theme` | `"light" \| "dark" \| "system"` | `"system"` |
 | `window.rememberPosition` | `boolean` | `true` |
 | `window.rememberSize` | `boolean` | `true` |
 | `window.defaultSize` | `{ width: number; height: number }` | `{ width: 800, height: 600 }` |
 | `window.minSize` | `{ width: number; height: number }` | `{ width: 600, height: 400 }` |
 | `systemPrompt` | `string` | `""` |
 | `userLanguage` | `"zh-CN" \| "en-US"` | `"zh-CN"` |
 | `startAtLogin` | `boolean` | `false` |
 | `contextFiles` | `string[]` (glob patterns) | `["AGENTS.md"]` |

V4 Provider 配置（`ModelRuntime` 持有）：

| 字段 | 类型 |
 |---|---|
 | `auth.json` entries | `{ providerId: string; apiKey: string }[]` |
 | `models.json` entries | 由 pi 自带 provider 目录自动管理 |

V3 `Provider.llm.{defaultModel / baseUrl / apiType / models / modelsEndpoint}` 字段删除——pi provider 目录自动管理。

## 不可逆决策

V4 启动时以下决策已**不可逆**（回滚需大量代码改动）：

- 删 Workspace 实体 + workspace-bound conversation（per ADR 0004）
- 删 Workspace Sandbox + PermissionService（per ADR 0003）
- 删 SQLite 会话层 + FTS5 全文搜索（per ADR 0005）—— V3 旧用户数据丢失
- 删 buildSystemPrompt 自建组装器（per ADR 0007）
- 删 Provider.billing 子对象 + 计费工具（per ADR 0011）
- 删 60+ V3 provider preset 硬编码清单（per ADR 0008）
- 运行时整体迁 main process（per ADR 0002）—— V3 renderer 自建 runtime 删除
- 错误模型扩展到 18 个子类（per ADR 0009）

详见 `docs/adr/0001`（V4 总纲）的 Reversibility 章节。

## Anti-references

V4 起，**避免**以下反模式（基于 V4 决策）：

- 重新引入 sandbox / permission 安全模型（pi-coding-agent 设计哲学是"用户权限裸跑"）
- 重新引入 SQLite 会话存储或 FTS5 全文搜索（pi JSONL session 是唯一源）
- 重新引入 workspace 实体或 workspace-bound conversation（cwd 是唯一源）
- 重新引入计费工具（V3 已删除，V4 不做计费）
- 重新引入 V3 自建 buildSystemPrompt（pi DefaultResourceLoader + Extension API 是唯一）
- 重新引入 V3 `core/llm/` 自建运行时底座（pi-coding-agent 是唯一底座）
- 重新引入 V3 `electron-store settings.json providers[]`（pi ModelRuntime 是唯一 provider 配置）

## References

- pi-coding-agent：`https://github.com/earendil-works/pi`（`packages/coding-agent/`）
- pi-coding-agent SDK：`createAgentSession / SessionManager / ModelRuntime / SettingsManager / DefaultResourceLoader / ExtensionAPI / defineTool / createReadTool / createWriteTool / createEditTool / createBashTool / createGrepTool / createFindTool / createLsTool / runPrintMode / runRpcMode`
- V4 ADR：`docs/adr/0001–0012`
- V3 git log：保留在 git history，可追溯 V3 决策

---

V4 CONTEXT.md last updated: 2026-08-20（grilled 14 步决策 + 重生成 ADR 0001–0012）