import { ipcMain } from "electron";
import { sandboxHandler } from "../../lib/sandbox-handler.js";
import { assessRisk } from "./risk.js";
import { confirmIfRisky } from "./confirm.js";
import { executeCommand } from "./exec.js";

export function registerRunCommandIpc(): void {
  ipcMain.handle("runCommand", sandboxHandler(async (args: { command: string; cwd?: string; timeoutMs?: number }) => {
    const cwd = args.cwd ?? process.cwd();
    const risk = assessRisk({ command: args.command, cwd });
    const decision = await confirmIfRisky({ command: args.command, cwd, risk });
    if (decision === "deny") {
      return { status: "error", error: { kind: "PermissionDenied", message: "用户拒绝执行该命令" } };
    }
    return executeCommand({ command: args.command, cwd, timeoutMs: args.timeoutMs });
  }));
}
