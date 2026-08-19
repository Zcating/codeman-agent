export { McpSettingsTab } from "@codeman-frontend/features/mcp/components/settings-tab";
export {
  mcpServers$,
  mcpAllTools$,
  refresh,
  enable,
  restart,
  openConfigDir,
  _resetMcpStoreForTest,
} from "@codeman-frontend/features/mcp/stores/store";
export type {
  McpServerStatus,
  McpServerConfig,
  McpTool,
  McpCallResult,
  McpServerInfo,
  McpToolEntry,
} from "@codeman-frontend/shared/lib/types";

export const mcpManifest = {
  id: "mcp",
  label: "MCP",
  path: "/tools/mcp",
  icon: "Cable",
} as const;
