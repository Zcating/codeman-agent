# ADR 0006 — Feature-to-Extension Mapping Strategy

**Status**: accepted · **Date**: 2026-08-20 · **Scope**: codeman-agent V4 features (skills / multi-agents / MCP / automations / chat UI / settings)
**Related**: ADR 0001 (V4 总纲 D6), ADR 0008 (provider/model-runtime), ADR 0007 (system prompt)

## Context

V3 维护了 5 个 renderer 端 feature（chat / mcp / multi-agents / settings / skills）+ 多个 main 端 feature（automations / file-ops / run-command / webfetch / permission / workspaces / conversations / system）。每个 feature 有自己的数据模型 + UI + IPC handlers。

pi-coding-agent 提供 `ExtensionAPI` 作为扩展点：

- `registerTool(...)` 注册自定义工具
- `registerCommand(...)` 注册自定义命令（slash command）
- `on(eventName, handler)` 订阅事件
- `pi.events` pub-sub
- `defineTool(...)` 定义工具的官方 API

V4 必须把 V3 各个 feature 映射到 pi 生态（或保留自建）。

## Decision

V3 → V4 feature 映射：

| V3 Feature | V4 归宿 | 机制 | ADR |
|---|---|---|---|
| Skills（双轨激活：描述驱动 + slash command） | pi 原生 skills | Agent Skills standard；pi 自动发现 `.agents/skills/`；`/skill:name` 调用 | — |
| Multi-Agents（delegate_task） | pi extension | 官方 subagent 示例（`extensions/subagent/`）；ExtensionAPI 实现 | — |
| MCP（JSON-RPC stdio client） | 自写 pi extension | pi 无内置 MCP，README "build your own with extensions"；自写 client 作为 extension | — |
| Automations（定时任务） | 保留自建 | pi 无对应；main 端 `AutomationScheduler` 保留 + 桥接 pi session 事件 | — |
| Settings（provider 配置 / 用户偏好） | ModelRuntime + SettingsManager | pi 的 `SettingsManager.create()` 接管 | ADR 0008 |
| Chat UI（消息流 + 工具调用可视化 + 输入区） | 保留 Solid 视图 | V3 Solid UI 组件保留，事件源换成 IPC 桥 | ADR 0002 |

### D1. Skills 迁 pi 原生

V3 自建 skills 系统的双轨激活（描述驱动自动发现 + slash command）+ manifest 注入 system prompt + `_load_skill` meta-tool + preload skills + slash menu UI **整体删除**。

V4 用 pi-coding-agent 原生 skills：

- pi 自动发现 `~/.agents/skills/` 与 `.pi/skills/` 下的 `SKILL.md`（Agent Skills standard）
- pi 自动把 manifest 拼成 `<available_skills>` 块注入 system prompt
- pi 通过 `_load_skill` meta-tool 让 LLM 主动拉取 skill body
- slash command 由 pi 的 `ExtensionAPI.registerCommand` 提供（与 skills 集成）
- preload skills 不需要单独机制（pi 自动处理）
- slash menu UI 改为消费 pi `extension.listSkills()` IPC API

### D2. Multi-Agents 迁 pi extension

V3 自建 multi-agents 系统的 `delegate_task` 工具 + `MultiAgentsPlugin` + `sub-agent-factory` + `sub-agents-stream.store` + `Parallel Panel` UI **整体删除**。

V4 用 pi-coding-agent 官方 subagent 模式（基于 `extensions/subagent/` 示例）：

- 自写 pi extension 注册 `delegate_task` 工具（与 V3 同名同语义：parameters = `{ agent_name, task }`，executionMode = parallel）
- 子 agent 在被委派时由 pi 实例化（per-run transient，与 V3 ADR-0020 哲学一致）
- 子 agent 不接收主 session 历史（隔离语义保留）
- 子 agent 输出 final text 作为 tool result content

`Parallel Panel` UI 保留 V3 Solid 实现，订阅子 agent 事件流。

### D3. MCP 自写 pi extension

V3 自建 MCP client（JSON-RPC stdio）+ `mcp_servers.json` 配置 + MCP server 状态枚举（`connected / spawn_failed / crashed / disabled / protocol_error / timeout`）+ mcp tool 自动重命名为 `mcp_<server>_<tool>` **部分保留**，包装为 pi extension。

V4 MCP：

- 自写 `pi-mcp` extension：
  - `registerTool` 注册每个 MCP server 的 tools
  - `registerCommand` 提供 `/mcp` 命令（list / enable / disable server）
  - `on("session_start")` 启动 enabled MCP servers
  - `on("session_end")` 关闭 MCP servers
- MCP server 配置文件位置：保留 V3 的 `~/.agents/mcp_servers.json`
- 命名规则保留：`mcp_<server>_<tool>`
- Server 状态枚举保留（UI 用）

### D4. Automations 保留自建

V3 Automations（renderer Plugin Registry 第 4 个 builtin plugin + Electron Main `AutomationScheduler` + `automations.json` 持久化 + `automation_executions` 表 + LLM action 走 IPC → renderer 跑）**保留自建**。V4 调整为：

- Renderer UI 保留 V3 实现
- Main 端 `AutomationScheduler` 保留
- LLM action 从"V3 走 IPC 跳 renderer 创建 Agent"改为"V4 走 IPC 跳 renderer 创建 pi session"——本质一样，只是底层 agent 从自建换 pi
- Script action 不变（`child_process.spawn` + workspace sandbox 检查由 D4 sandbox 删除——V4 script action 也变"裸跑"，per ADR 0003）

### D5. Settings 走 ModelRuntime + SettingsManager

详见 ADR 0008。

### D6. Chat UI 保留 Solid 视图

V3 chat feature 的 Solid 组件（`chat-view.tsx` / `sidebar.tsx` / `chat-input.tsx` / `tool-call-card.tsx` / `message-bubble.tsx` / 等）**全部保留**作为 V4 renderer 视图层。底层事件源从 V3 `core/llm/runtime.ts` 的 `Stream<RuntimeEvent>` 换成 IPC 桥接的 pi session 事件投影（per ADR 0002 D4）。

V3 chat store（`chat.store.ts` 合并自 conversations.store + agent.store + messages.store）**重写为 IPC 桥接层**：

- 调用 pi IPC API（create session / prompt / abort / open session / list sessions）
- 订阅 IPC `pi:event` 流（per ADR 0002 D2）
- Solid `createStore` 暴露给 UI 组件

### D7. 词汇表清理与新增

V3 `CONTEXT.md` 词汇表删除：

- `Plugin Registry`（V3 自建插件边界；V4 由 pi extension 接管）
- `Plugin Initialization` / `Plugin Navigation Metadata`（V3 概念）
- `MCP / MCP Client / MCP Server / MCP Server Config / MCP Tool / MCP-Enabled Tool Set / MCP Server Status`（V3 概念；V4 包装为 pi extension 但保留语义，新增"Pi MCP Extension"词条）
- `Multi-Agents Plugin / Sub-Agent / Delegate Task Tool / Sub-Agent Delegation / Parallel Panel / Sub-Agent Stream Entry`（V3 概念；V4 包装为 pi extension 但保留语义，新增"Pi Subagent Extension"词条）
- `Thinking Level`（V3 per-run 配置；V4 由 pi `thinkingLevel` 字段接管，词条保留并更新）
- `Automation / Automation Rule / Automation Schedule / Automation Action / Automation Execution / Trigger Kind / Missed Run / AutomationScheduler`（V4 保留自建，词条保留并更新）

V4 新增：

- `Pi Extension`（pi-coding-agent 的 `ExtensionAPI` 注册的扩展）
- `Pi Skills System`（Agent Skills standard，由 pi 自动发现）
- `Pi Subagent Extension`（基于 pi subagent 示例的 multi-agents 实现）
- `Pi MCP Extension`（基于 pi extension 的 MCP client 实现）
- `Pi Session Event`（pi session 事件流中的单条事件）

## Considered

#### 选 1（已选）：逐 feature 映射到 pi 生态
skills / multi-agents / MCP 迁 pi；automations 保留自建；chat UI 保留自建。

#### 选 2：只保留 chat + settings，其余全砍
最小化重构范围。代价：丢失 multi-agents / MCP / automations 等已有能力。**不选**。

#### 选 3：所有 feature 全保留自建
feature 层完全不动，只把底层 Agent runtime 换 pi。代价：feature 层与 pi 生态脱节，未来想用 pi 的 skills / sub-agent / extension 时仍需重构。**不选**。

## Consequences

### Positive

- **skills / multi-agents 与 pi 生态对齐**：复用官方机制 + 扩展点
- **MCP 保留自建 client**：保证 V3 MCP 配置格式向后兼容
- **automations 保留**：产品差异化能力（定时任务）不丢失
- **chat UI 保留**：V3 Solid UI 不动

### Negative

- **Skills 双轨激活语义**：V3 自建 skills 的"双轨（描述驱动 + slash command）"语义需在 pi 体系中找到对应——pi 原生 skills 支持 manifest 自动发现 + `_load_skill` meta-tool，slash command 由 extension 注册。语义保留但实现细节差异。
- **Multi-agents 并行面板**：V3 `Parallel Panel` 的 UI 与 pi subagent 事件流需要适配——subagent 事件流 API 与 V3 不同
- **MCP 包装成本**：自写 pi-mcp extension 需把 V3 MCP client 的 JSON-RPC + spawn + 状态机 重新封装为 pi extension API
- **Automations LLM action 重构**：从 V3 renderer 创建自建 Agent 改为 V4 renderer 创建 pi session

### Neutral

- **V3 Plugin Registry 整体删除**：`src/renderer/src/plugins/` 子目录全部删除
- **V3 renderer feature 子目录重命名**：原 `features/skills/` / `features/multi-agents/` / `features/mcp/` 保留目录但内容重写为 IPC 桥接层

## Cross-file impact

| 路径 | 变化 |
|---|---|
| `src/renderer/src/plugins/` | **整体删除**（Plugin Registry 等） |
| `src/renderer/src/features/skills/` | 重写为 IPC 桥接层（订阅 pi skills API） |
| `src/renderer/src/features/multi-agents/` | 重写为 IPC 桥接层（订阅 pi subagent events） |
| `src/renderer/src/features/mcp/` | 重写为 IPC 桥接层（订阅 pi MCP extension events） |
| `src/renderer/src/features/chat/` | 重写为 IPC 桥接层 + 保留 UI 组件 |
| `src/main/pi-runtime/extensions/skills/` | **新建**：包装 pi 原生 skills（注册 preload / slash command） |
| `src/main/pi-runtime/extensions/subagent/` | **新建**：基于 pi subagent 示例实现 multi-agents |
| `src/main/pi-runtime/extensions/mcp/` | **新建**：自写 MCP client 作为 pi extension |
| `src/main/features/automations/` | 保留；LLM action 改为调 pi session IPC |
| `src/main/db/migrations/00XX-create-automations.sql` | 保留（per D4 automations 仍 SQLite 持久化） |
| `src/main/db/migrations/00XX-create-automation-executions.sql` | 保留 |
| `src/shared/lib/types.ts` | 删除 `SubAgentConfig / MultiAgentsPlugin / MCP Server Config / Automation Rule` 等 V3 schema；保留 UI 投影 schema |
| `CONTEXT.md` 词汇表 | 删除：`Plugin Registry / Plugin Initialization / Plugin Navigation Metadata`；更新：`MCP / Multi-Agents / Skills / Automation / Thinking Level`；新增：`Pi Extension / Pi Skills System / Pi Subagent Extension / Pi MCP Extension / Pi Session Event` |

## Reversibility

中等可逆：

- 恢复 Plugin Registry 需重写 `src/renderer/src/plugins/`
- 恢复 V3 skills 系统需重写 `src/renderer/src/features/skills/` 为自建实现
- 恢复 V3 multi-agents 系统需重写 `sub-agent-factory` + `multi-agents.stream.store`
- 恢复 V3 MCP client 需重写 `src/main/features/mcp/`（保留旧 client 代码在 git log）

预计回滚耗时：2–3 周。

## References

- pi-coding-agent ExtensionAPI：`registerTool / registerCommand / on(...) / pi.events / defineTool`
- pi-coding-agent 官方 subagent 示例：`packages/coding-agent/examples/extensions/subagent/`
- pi-coding-agent Skills：Agent Skills standard（pi 自动发现 + `_load_skill` meta-tool）
- pi-coding-agent README on MCP："MCP integration" 是 extension 可自行 build
- V3 Plugin Registry（per git log）：不追溯