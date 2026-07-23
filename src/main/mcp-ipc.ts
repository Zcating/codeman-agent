//! V3.1 MCP — IPC handler registration (ADR-0032 D3-D4).
//!
//! Exposes McpManager operations to the renderer over 7 IPC channels.
//! Wired in electron/main/index.ts (per ADR-0024 D10 channel-name convention).

import { ipcMain } from "electron";
import type { McpManager } from "./mcp-manager";

export function registerMcpIpcHandlers(manager: McpManager): void {
  ipcMain.handle("mcp:list-servers", () => manager.listServers());
  ipcMain.handle("mcp:get-tools", (_e, args: { serverName: string }) => manager.listServerTools(args.serverName));
  ipcMain.handle("mcp:get-all-tools", () => manager.listAllTools());
  ipcMain.handle("mcp:enable", (_e, args: { serverName: string; enabled: boolean }) => {
    // ADR-0032 D1: persist toggle to ~/.agents/mcp_servers.json (canonical storage).
    return manager.setEnabled(args.serverName, args.enabled);
  });
  ipcMain.handle("mcp:restart", (_e, args: { serverName: string }) =>
    manager.restart(args.serverName),
  );
  ipcMain.handle(
    "mcp:call-tool",
    async (_e, args: { serverName: string; toolName: string; args: unknown }) =>
      manager.callTool(args.serverName, args.toolName, args.args),
  );
  ipcMain.handle("mcp:open-config-dir", () => manager.openConfigDir());
}