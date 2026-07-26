// MCP plugin barrel (ADR-0032 Phase B mini-4).
//
// V3.1 MCP Client plugin — stdio-based tool augmentation (per ADR-0032).
// Responsibility: exposes MCP servers as agent tools via pi-agent tool interface.

export { McpSettingsTab } from "@codeman-frontend/plugins/mcp/components/settings-tab";
export {
  mcpServers$,
  mcpAllTools$,
  refresh,
  enable,
  restart,
  openConfigDir,
  _resetMcpStoreForTest,
} from "@codeman-frontend/plugins/mcp/stores/store";
export type {
  McpServerStatus,
  McpServerConfig,
  McpTool,
  McpCallResult,
  McpServerInfo,
  McpToolEntry,
} from "@codeman-frontend/shared/lib/types";
