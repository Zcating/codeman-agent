# 0032 — MCP Client (stdio-only, tools scope, mcp_servers.json config)

**Status**: accepted · **Date**: 2026-07-21 · **Scope**: src/plugins/mcp/ (新增) + src/main/mcp-host.ts (新增) + src/features/chat/lib/runtime.ts (改 — MCP tools 注入) + src/features/settings/components/mcp-tab.tsx (新增) + src/renderer/shared/lib/ipc.ts (改 — McpService Tag) + src/renderer/shared/lib/types.ts (改 — McpServerConfig) + electron-builder.yml (不改 — 无 electron 侧二进制)

**Related**: ADR-0003 (Effect-TS logic layer), ADR-0010 (5+1 feature whitelist — mcp 是第 5 个 feature), ADR-0019 (per-run transient agent — MCP tools 在 run() 入口注入 tools[]), ADR-0025 (effect/Schema), ADR-0031 (Skills 是正交能力)

## Context

### 触发

> "实现 Skills 和 MCP 功能。" — 2026-07-21 user request。

Skills 部分在 [ADR-0031](./0031-skills-system.md) 锁定。本 ADR 处理 MCP。

### MCP 在 codeman-agent 当前形态 = 零

- `src/` 中无 MCP 代码 (grep `mcp|MCP|model_context_protocol` 无命中)
- `src/main/` 中无 MCP 代码
- `package.json` 无 `@modelcontextprotocol/*` 依赖
- 已有 MCP 集成仅限**我作为 agent** 通过 `context7` MCP server 取文档——与 codeman-agent 产品无关

### 三个核心张力（grill 已收齐）

1. **Client / Server / Both?** 决议：**Client only**。让 codeman-agent 作为 MCP Client 连接外部 stdio MCP server，扩展 tool 能力。Server 端不做（V2+ 再评估）。
2. **Transport?** 决议：**stdio only**。`npx -y @some/mcp-server` 启子进程 + stdin/stdout JSON-RPC。生态 95%+ 都是 stdio。SSE/HTTP 覆盖不足以抵消工程量。
3. **Scope (tools / resources / prompts)?** 决议：**tools only**。MCP resources / prompts 不在 V1 范围——前者通常以 tool 形式间接读（无需独立 UI），后者集成 chat 输入框需要额外 UI 决策。

### Skills vs MCP 职责正交（关键决策）

| | Skill (ADR-0031) | MCP (本 ADR) |
|---|---|---|
| 加什么 | **知识** — system prompt 内容 | **能力** — 新 AgentTool |
| 形态 | Markdown 文件 | stdio 子进程 |
| 触发 | LLM 主动 + user slash | 自动（注入 tools[]） |
| 用户视角 | 「让 agent 知道 X」 | 「让 agent 能做 Y」 |

## Decision

### D1 — Config 文件：`~/.agents/mcp_servers.json`

与 Skills 同根（per ADR-0031 D-storage）。Schema：

```ts
// src/plugins/mcp/lib/mcp-config-schema.ts
const McpServerConfigStruct = Schema.Struct({
  name: Schema.String,                                    // 唯一 ID (in user's filesystem)
  command: Schema.String,                                  // e.g. "npx"
  args: Schema.Array(Schema.String),                       // e.g. ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
  env: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
  enabled: Schema.Boolean,                                 // 用户 toggle
});

const McpConfigFileStruct = Schema.Struct({
  version: Schema.Literal(1),
  servers: Schema.Array(McpServerConfigStruct),
});
```

**与 Skills config 路径对称**：`~/.agents/skills-lock.json` ↔ `~/.agents/mcp_servers.json`。两者都用 `~/.agents/` 作为 agent 生态配置根（与 Settings JSON `%LocalAppData%\codeman-agent\settings.json` 分立,per ADR-0015）。

### D2 — stdio transport：spawn child + JSON-RPC over stdio

`src/main/mcp-host.ts::McpStdioServer` 类：
- 构造：`spawn(command, args, { env: { ...process.env, ...config.env }, stdio: ['pipe', 'pipe', 'pipe'] })`
- 握手：
  1. send `initialize` request (JSON-RPC 2.0) → wait `InitializeResult`
  2. send `notifications/initialized` (no response expected)
  3. send `tools/list` request → cache `Tool[]`
- 之后监听子进程 stdout，每个 newline-delimited JSON message 是 response or notification
- 工具调用：`tools/call` request → 收 response → return `result` or throw
- 生命周期：`app.whenReady` 时启动所有 `enabled === true` 的 server；`app.on('before-quit')` 时 graceful kill

**JSON-RPC 实现**：手写 ~150 行 (不引外部 SDK, 维持依赖最小化)。**id 分配**用原子计数器；`Promise<unknown>` map 维护 pending request → response 路由。

**错误处理**：
- 子进程 spawn 失败（command not found）→ 标记 server `status: "spawn_failed"`，UI 显示错误信息，不阻塞其它 server
- 子进程退出（意外）→ 标记 `status: "crashed"`，UI 提供 Restart 按钮
- tool call 超时 → 默认 60s（per-tool 可配置 via `tools/list` response 的 `_meta.timeoutMs`），超时 throw `McpToolTimeout`
- JSON-RPC 协议错误（malformed response）→ 标记 server `status: "protocol_error"`，disable 该 server 直到用户手动重连

### D3 — Tool 注入：`mcp_<server-name>_<tool-name>` 命名

**决议（grill mcp-a）**：所有 MCP tool 在 agent tool registry 中重命名为 `mcp_<server-name>_<tool-name>`，避免与现有 7 个内置 tool 撞名 + LLM 一眼识别来源。

- `<server-name>` = `McpServerConfig.name` slug（lowercase + 非字母数字替换为 `_`）
- `<tool-name>` = MCP server 声明的 `Tool.name`

示例：MCP server `name: "github"` 提供 `Tool.name: "create_issue"` → agent tool name `mcp_github_create_issue`。

**命名约束**：
- 生成的 name 唯一性由 runtime 保证；重复时 throw 启动错误并 disable 该 server
- runtime `tools[]` 数组 = `createFileTools(...)` + `[loadSkillTool, ...mcpTools]` （per ADR-0031 D4 `_load_skill` + 本 ADR MCP tools）

### D4 — Tool 调用路径

LLM emit `tool_call` for `mcp_github_create_issue`:
1. `runtime.ts` 的 tool dispatch 收到 `tool_call({name: "mcp_github_create_issue", args})`
2. 路由到 `McpManager.callTool(serverName="github", toolName="create_issue", args)`
3. `McpManager` 找到对应 `McpStdioServer` 实例 → 发送 `tools/call` request
4. 收到 response → return result content → 走标准 tool_result 路径

**当前工具 dispatch 实现**：`createFileTools(workspaceId)` 返回 5 个 AgentTool,每个的 `execute` 内部 `Effect.runPromiseExit(invoke(...))` 走 IPC。`McpTool` 是新增类型,execute 内部走 `mcpManager.callTool(...)` (in main process, 同步 await + return)。

**架构细节**：MCP 通信**完全在 Electron main process** 内（spawn child process 是 Node 能力,不能跑 renderer）。Renderer 不直接调 MCP——只通过 `invoke('mcp:call-tool', ...)` IPC 转 main → main 内部 routing → child process。**意味着** `McpTool` 在 renderer 端的 AgentTool.execute 实际是 IPC `mcp:call-tool` 的 Effect 包装。

### D5 — Settings UI：MCP tab

`src/features/settings/components/mcp-tab.tsx`：
- 顶部：解析 `~/.agents/mcp_servers.json` 结果（success / parse error）+ 「打开配置文件」按钮 (`shell.openPath('~/.agents/')`)
- 列表：每个 server 一行
  - name + command (灰标) + enabled toggle
  - 状态徽标：`connected` / `spawn_failed` / `crashed` / `disabled` / `protocol_error`（不同 lucide icon）
  - 启用时显示：available tools 数量 + 「Restart」按钮（重连）
- 添加 server：UI 不做直接编辑（V1 简化）；提供「打开配置文件」按钮让用户手动编辑 JSON
- 错误展示：每个 server 的 last error message 灰标展开

**Edit UX 决定**：V1 不做 in-UI form edit MCP server（form 复杂度高 + JSON 配置更适合手写）。Settings UI 仅 toggle + restart + status。

### D6 — Security：pre-launch authorization（已决议 p1）

仅 enabled flag 控制启停。`~/.agents/mcp_servers.json` 本身需用户手动编辑或 git clone（**用户自己写入 = 隐式授权**）。

**显式 first-time confirm dialog**：V1 **不**做（grill p1 决议）。理由：
- MCP server 列表本质是用户主动配置
- 类似 npm 全局安装 / pip 全局安装，无 first-time prompt
- `enabled: false` 是默认（首次扫描到新 server 时默认 disable，user 需主动 enable）

**V2+ 增强**：
- per-tool permission UI（每次 `mcp_github_create_issue` 调用前弹确认）
- command 白名单（拒绝 `cmd.exe` / `powershell.exe` 等危险 binary）
- 仅 stdio（V1 已锁定）天然限制 attack surface（只能起子进程,不能开网络端口）

### D7 — IPC surface（renderer ↔ main）

| Channel | Direction | Payload |
|---|---|---|
| `mcp:list-servers` | renderer → main | void → `McpServerInfo[]` |
| `mcp:get-tools` | renderer → main | `{ serverName }` → `McpTool[]` (per-server) |
| `mcp:get-all-tools` | renderer → main | void → `McpToolEntry[]` (flat across all servers; renderer uses for `buildMcpTools`) |
| `mcp:enable` | renderer → main | `{ serverName, enabled }` → void |
| `mcp:restart` | renderer → main | `{ serverName }` → void |
| `mcp:call-tool` | renderer → main | `{ serverName, toolName, args }` → `McpToolResult` |
| `mcp:open-config-dir` | renderer → main | void → void（调 shell.openPath） |

`McpService` 在 `src/shared/lib/ipc.ts` 走 `Context.Tag` + `Layer.effect` 模式（与 `ConversationService` / `MessageService` 同构, per ADR-0016）。

### D8 — Runtime integration

`src/features/chat/lib/runtime.ts` 改造 `tools[]` 构造：

```ts
// 旧
const tools = [loadSkillTool, ...createFileTools(provider.workspaceId)];

// 新 (lazy load MCP tools at run() 入口)
const mcpTools = yield* Effect.promise(() => 
  McpService.getAllTools().pipe(Effect.runPromise)
);
const tools = [loadSkillTool, ...createFileTools(provider.workspaceId), ...mcpTools];
```

**关键设计**：MCP tools 在**每次 run()** 时 fetch（不缓存）——理由：MCP server 可能随时 enable/disable，runtime 应反映最新状态。fetch 失败（IPC error）→ log warning + 用空数组（不阻塞 LLM 启动）。

## Considered Options

### Client / Server / Both（已决议 Client）

**拒绝 Server**：codeman-agent 作为 MCP server 让 Claude Code / Cursor 调它——价值不大（用户已经在 codeman 里了）；MCP server 实现还需 JSON-RPC server surface + transport 选择,工程量大

**拒绝 Both**：代价加倍

### stdio / SSE / HTTP / 全部（已决议 stdio only）

**拒绝 SSE / HTTP**：MCP 生态 95%+ stdio; SSE/HTTP 多覆盖 <5% 用例; Streamable HTTP (2025 新 spec) 与 SSE 不兼容,选边风险大

**拒绝 stdio + SSE + HTTP**：~3 周工作量,且需要 (a) OAuth flow for HTTP server auth (b) SSE reconnection logic (c) Streamable HTTP 不同 framing

**采用 stdio only**：MVP 锁 1 周工作量;V2+ 按需扩展(用户请求 + 生态成熟度)

### Tools only / +Resources / +Prompts（已决议 Tools only）

**拒绝 +Resources**：resources 通常以 tool 形式间接读(many MCP servers 把 list/read 资源封装为 tool); 独立 UI 收益低

**拒绝 +Prompts**：prompts 是 user 在 chat 输入框选模板填参数——需深度集成 chat UI (slash menu 冲突);V2+ 评估

### Tool 命名 `mcp_<server>_<tool>` vs 原名（已决议 mcp-a）

**拒绝 原名直接注入**：撞名风险;LLM 难以识别来源

**拒绝 server 隔离命名空间**：需改 tool dispatcher 支持 nested routing;pi-agent-core 0.80.3 的 tool name 是 flat string,改造需改 runtime 内部 dispatch

**采用 `mcp_<server>_<tool>` 前缀**：0 runtime 改造 (走现有 dispatcher);LLM 看到前缀自动识别来源;prefix 字符串长度可控

### MCP tool call 路径：renderer direct spawn vs main process spawn（已决议 main process）

**拒绝 renderer spawn**：
- webview 沙箱拒绝 `child_process.spawn`(sandbox: false 但 contextIsolation: true, 仍受 Node integration 限制)
- 即使可 spawn,stdout JSON-RPC 流式处理在 webview 不合适(需 long-lived stream)

**采用 main process spawn**：与现有 file-tools (per ADR-0013) 同构 — `tools[].execute` 走 IPC 到 main,main 执行 fs 操作

## Consequences

### 正面
- **端用户能装 MCP server 扩展工具**：与 Skill (知识) 正交,提供能力扩展入口
- **与现有 file-tools pattern 复用**：`McpTool.execute` 包装 IPC `mcp:call-tool`,与 file-tools 的 `read_file.execute` 走 `invoke('read_file', ...)` 同构
- **stdio 单一 transport**：实现 / 测试 / debug 矩阵可控
- **与 Skills 配置同根**：用户从 Claude Code / Cursor 迁移认知零成本
- **错误状态丰富**：spawn_failed / crashed / protocol_error / timeout 等都有显式 UI

### 代价
- 子进程管理复杂度: spawn / kill / restart / orphan cleanup
- JSON-RPC 手写 ~150 行 (无 SDK)
- MCP tool call 走 IPC 跨 main → renderer 边界, 比 file-tools 多一次 IPC 跳数 (+5ms typical)
- 启动时间增加 (按 enabled server 数,每个 spawn ~50-200ms, 并行启动)
- 安全 posture 仅靠 enabled flag + 用户主动编辑 JSON (V2+ 加 per-tool permission)

### 跨文件影响清单

| 文件 | 改动 |
|---|---|
| `src/plugins/mcp/index.ts` | 新增 barrel |
| `src/plugins/mcp/AGENTS.md` | 新增 |
| `src/plugins/mcp/lib/mcp-config-schema.ts` | 新增 — McpServerConfig / McpConfigFile schemas |
| `src/plugins/mcp/lib/mcp-config.ts` | 新增 — 读 + parse mcp_servers.json |
| `src/plugins/mcp/lib/mcp-config.test.ts` | 新增 |
| `src/plugins/mcp/lib/mcp-tool-builder.ts` | 新增 — McpToolDefinition → AgentTool 转换 + `mcp_<name>_<tool>` 命名 |
| `src/plugins/mcp/lib/mcp-tool-builder.test.ts` | 新增 |
| `src/plugins/mcp/stores/mcp.store.ts` | 新增 — server status + tools signal |
| `src/plugins/mcp/stores/mcp.store.test.ts` | 新增 |
| `src/main/mcp-host.ts` | 新增 — McpStdioServer + McpManager |
| `src/main/mcp-host.test.ts` | 新增 — mocked spawn, JSON-RPC framing, error paths |
| `src/main/jsonrpc.ts` | 新增 — 轻量 JSON-RPC 2.0 client (~150 行) |
| `src/main/jsonrpc.test.ts` | 新增 |
| `src/main/index.ts` | 改 — whenReady 内 `mcpManager.start()`; before-quit graceful shutdown |
| `src/main/ipc.ts` | 改 — 加 6 个 mcp:* IPC handlers |
| `src/shared/lib/ipc.ts` | 改 — McpService Context.Tag + Live Layer |
| `src/shared/lib/types.ts` | 改 — McpServerConfig / McpTool / McpServerStatus types |
| `src/features/settings/components/mcp-tab.tsx` | 新增 — UI |
| `src/features/settings/components/mcp-tab.test.tsx` | 新增 |
| `src/features/settings/routes/settings-layout.tsx` | 改 — Sidebar 加 "MCP Servers" item |
| `src/features/chat/lib/runtime.ts` | 改 — tools[] 注入 MCP tools |
| `src/features/chat/lib/runtime.test.ts` | 改 — 加 MCP tools 测试 |
| `CONTEXT.md` | 改 — 加 MCP Client / MCP Server / MCP Server Config / MCP Tool / MCP-Enabled Tool Set 词条 |
| `docs/adr/0032-mcp-client-stdio.md` | 本 ADR |

### 不可逆性
推翻本 ADR 需:
- 删 `src/plugins/mcp/` + `src/main/mcp-host.ts` + `src/main/jsonrpc.ts`
- 回退 runtime.ts tools[] 注入
- 回退 ipc.ts 6 个 mcp:* handlers
- 删 mcp-tab UI
- 撤回本 ADR + 重写

总改动 ≥ 15 文件 + 1 ADR。成本有意义 → 不可逆标记成立。

## References

- MCP spec (Anthropic, 2024-11): https://modelcontextprotocol.io
- MCP JSON-RPC framing: newline-delimited JSON over stdio
- ADR-0013 (File IO tools) — 同构 IPC pattern (`tools[].execute` → `invoke(...)` → main process)
- ADR-0019 (per-run transient agent) — tools[] 在 run() 时构造, MCP tools 每次 lazy fetch
- ADR-0031 (Skills) — 职责正交;Skills 加知识,MCP 加能力
- ADR-0015 (Settings 单档) — `~/.agents/mcp_servers.json` 与 Settings JSON 分立;遵循「agent 生态配置走 `~/.agents/`,app 配置走 Settings JSON」
- grill-with-docs session 2026-07-21 — 决议依据