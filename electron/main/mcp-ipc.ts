//! V3.1 MCP — IPC handler registration (ADR-0032 D3-D4).
//!
//! Exposes McpManager operations to the renderer over 6 IPC channels.
//! Wired in electron/main/index.ts (per ADR-0024 D10 channel-name convention).

import { ipcMain } from "electron";
import type { McpManager } from "./mcp-manager";

export function registerMcpIpcHandlers(manager: McpManager): void {
  ipcMain.handle("mcp:list-servers", () => manager.listServers());
  ipcMain.handle("mcp:get-all-tools", () => manager.listAllTools());
  ipcMain.handle("mcp:enable", (_e, args: { serverName: string; enabled: boolean }) => {
    // V1: toggle in-memory only (config file write-back is future work).
    // The McpManager's #configs map is updated to reflect the new state
    // for next listServers() read, but the on-disk config is unchanged.
    const info = manager.listServers().find((s) => s.config.name === args.serverName);
    if (info) info.config.enabled = args.enabled;
    return undefined;
  });
  ipcMain.handle("mcp:restart", (_e, args: { serverName: string }) =>
    manager.restart(args.serverName),
  );
  ipcMain.handle(
    "mcp:call-tool",
    async (_e, args: { agentName: string; args: unknown }) =>
      manager.callTool(args.agentName, args.args),
  );
  ipcMain.handle("mcp:open-config-dir", () => manager.openConfigDir());
}