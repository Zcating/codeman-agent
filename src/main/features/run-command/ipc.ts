import { ipcMain } from "electron";
import { sandboxHandler } from "../../lib/sandbox-handler.js";
import { assessRisk } from "./risk.js";
import { executeCommand } from "./exec.js";
import { PermissionServiceTag, PermissionServiceLive } from "../permission/index.js";
import { Effect } from "effect";

export function registerRunCommandIpc(): void {
  ipcMain.handle("runCommandAssess", sandboxHandler(async (args: { command: string; cwd?: string }) => {
    const cwd = args.cwd ?? process.cwd();
    const risk = assessRisk({ command: args.command, cwd });
    if (risk.kind === "low") {
      return { risk };
    }
    const requestID = crypto.randomUUID();
    const program = Effect.gen(function* () {
      const svc = yield* PermissionServiceTag;
      yield* svc.ask({
        sessionID: "",
        tool: "run_command",
        command: args.command,
        cwd,
        risk,
      });
    }).pipe(Effect.provide(PermissionServiceLive));
    try {
      await Effect.runPromise(program);
      return { risk, requestID };
    } catch {
      return { risk, requestID };
    }
  }));

  ipcMain.handle("runCommandExecute", sandboxHandler(async (args: { command: string; cwd?: string; timeoutMs?: number }) => {
    const cwd = args.cwd ?? process.cwd();
    return executeCommand({ command: args.command, cwd, timeoutMs: args.timeoutMs });
  }));

  ipcMain.handle("runCommandReply", sandboxHandler(async (args: { requestID: string; reply: "once" | "always" | "reject" }) => {
    const program = Effect.gen(function* () {
      const svc = yield* PermissionServiceTag;
      yield* svc.reply(args);
    }).pipe(Effect.provide(PermissionServiceLive));
    await Effect.runPromise(program);
    return { ok: true };
  }));
}
