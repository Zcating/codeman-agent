# src/plugins/mcp/ — MCP Client Plugin (MCP 客户端插件)

> **Scope:** V3.1 MCP Client — stdio-based MCP server management + tool exposure (per ADR-0032)。
> **职责**: 管理 MCP 服务器生命周期，将可用工具注入 pi-agent runtime。
> **路径**: `~/.agents/mcp_servers.json` (与 skills `~/.agents/skills/` 正交)。

## 目录布局

```
src/plugins/mcp/
├── index.ts              # Barrel (plugin 根级唯一允许的文件之一)
├── AGENTS.md             # 本文件
│
├── components/           # UI 组件
│   └── settings-tab.tsx  # McpSettingsTab — MCP 服务器管理 UI
│
└── stores/               # Solid signal + Effect 桥接层
    ├── store.ts          # mcpServers$ / mcpAllTools$ + refresh/enable/restart/openConfigDir
    └── store.test.ts     # 5/5 测试 (signal 状态管理)
```

## 数据流

```
src/main/mcp-manager.ts  ←IPC→  McpService (shared/lib/ipc.ts)
                                      ↓
                              mcpServers$ / mcpAllTools$ (stores/store.ts)
                                      ↓
                              McpSettingsTab (components/settings-tab.tsx)
```

## IPC 通道 (mini-3 合约, 7 channels)

| 通道 | 方向 | 类型 |
|---|---|---|
| `mcp:list-servers` | main → renderer | `McpServerInfo[]` |
| `mcp:get-tools` | main → renderer | `McpTool[]` (per-server, per ADR-0032 D7) |
| `mcp:get-all-tools` | main → renderer | `McpToolEntry[]` (flat, for renderer buildMcpTools) |
| `mcp:enable` | renderer → main | `void` (args: `{serverName, enabled}`) |
| `mcp:restart` | renderer → main | `void` (args: `{serverName}`) |
| `mcp:call-tool` | renderer → main | `McpCallResult` (args: `{serverName, toolName, args}`) |
| `mcp:open-config-dir` | renderer → main | `void` |

## 硬性规则

- **UI 组件 (`components/*.tsx`) 禁止导入 `effect` 用于计算**，但允许 `Effect.runPromiseExit` 在事件处理器里执行 store 返回的 Effect（与 skills-section.tsx 同模式）。
- **业务函数 (`stores/*.ts`) 用 `Effect.gen` + `Effect.provide(McpServiceLive)` 包装**（per parent rule in `src/plugins/AGENTS.md` — IIFE services get the carve-out, trace overhead not worth it for one-time construction）。
- **错误复用 `AppError` union**（`NotFound` / `InvalidConfig` / `Unknown`）。
- **`as any` / `@ts-ignore` / 空 catch 全部禁用**。
- **类型 re-export 自 `src/shared/lib/types.ts`**（在 `index.ts` 中做 re-export，不新建文件）。

## 与 runtime.ts 集成 (ADR-0032 D4)

`src/features/chat/lib/runtime.ts` 在每次 `run()` 入口将 `mcpAllTools$()` 展平成 pi-agent `AgentTool[]`，追加到 `tools[]` 数组。

每个 `McpToolEntry` → pi-agent tool definition：
```typescript
{
  label: entry.agentName,           // e.g. "mcp_github_create_issue"
  name: entry.agentName,
  description: entry.description,
  parameters: entry.inputSchema as TSchema,  // JSON Schema
  execute: async (_id, args) => Effect.runPromiseExit(McpService.callTool(entry.agentName, args)),
}
```

工具名格式 (`mcp_<server-slug>_<tool-slug>`) 由 `src/main/mcp-manager.ts::McpManager.startAll()` 保证唯一性；冲突时第二个 server 被标记 `protocol_error` 并停止（per ADR-0032 D3）。

## ADR 参考

- [ADR-0032](../../../docs/adr/0032-mcp-client-stdio.md) — MCP Client 设计决策
- [ADR-0010](../../../docs/adr/0010-frontend-5-1-folder-whitelist.md) — plugins/ 5+1 whitelist
- [ADR-0031](../../../docs/adr/0031-skills-system.md) — Skills Plugin (参考模式)
- [ADR-0003](../../../docs/adr/0003-effect-ts-logic-layer.md) — Effect-TS 逻辑层