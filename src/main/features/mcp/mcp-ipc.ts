/**
 * src/main/features/mcp/mcp-ipc.ts
 *
 * PR-γ : McpManager class → factory。
 * 工厂方法中 Effect-returning 的部分（restart / setEnabled）通过 runMain
 * 桥接回 Promise，保持 IPC handler 签名兼容。
 */
import { ipcMain } from "electron";
import { runMain } from "../../runtime.js";
import type { McpManager } from "./mcp-manager";

export function registerMcpIpcHandlers(manager: McpManager): void {
  ipcMain.handle("mcp:list-servers", () => manager.listServers());
  ipcMain.handle("mcp:get-tools", (_e, args: { serverName: string }) =>
    manager.listServerTools(args.serverName),
  );
  ipcMain.handle("mcp:get-all-tools", () => manager.listAllTools());
  ipcMain.handle(
    "mcp:enable",
    (_e, args: { serverName: string; enabled: boolean }) =>
      runMain(manager.setEnabled(args.serverName, args.enabled)),
  );
  ipcMain.handle("mcp:restart", (_e, args: { serverName: string }) =>
    runMain(manager.restart(args.serverName)),
  );
  ipcMain.handle(
    "mcp:call-tool",
    async (
      _e,
      args: { serverName: string; toolName: string; args: unknown },
    ) => manager.callTool(args.serverName, args.toolName, args.args),
  );
  ipcMain.handle("mcp:open-config-dir", () => manager.openConfigDir());
}