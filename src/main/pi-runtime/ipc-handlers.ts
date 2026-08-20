import type { IpcMain, BrowserWindow } from "electron";
import { PiRuntime } from "./pi-runtime.js";
import { createEventBridge, createEventBridgeUnsubscriber } from "./event-bridge.js";

export function registerPiIpcHandlers(ipcMain: IpcMain, mainWindow: BrowserWindow): void {
  const runtime = PiRuntime.getInstance();

  ipcMain.handle("pi:create-session", async (_event, args?: { cwd?: string }) => {
    const session = await runtime.createSession({ cwd: args?.cwd });
    const eventBridge = createEventBridge(mainWindow.webContents);
    const unsubscribe = session.subscribe(eventBridge);
    createEventBridgeUnsubscriber(unsubscribe);

    return { sessionId: session.sessionId, sessionFile: session.sessionFile };
  });

  ipcMain.handle("pi:prompt", async (_event, _args: { sessionId: string; text: string }) => {
    return { ok: true };
  });

  ipcMain.handle("pi:abort", async (_event, _args: { sessionId: string }) => {
    return { ok: true };
  });

  ipcMain.handle("pi:open-session", async (_event, args: { path: string }) => {
    const { SessionManager } = await import("@earendil-works/pi-coding-agent");
    const sm = runtime.getSessionManager();
    const manager = SessionManager.open(args.path, sm.getSessionDir());
    return { sessionId: manager.getSessionId() };
  });

  ipcMain.handle("pi:list-sessions", async (_event, _args?: { cwd?: string }) => {
    const { SessionManager } = await import("@earendil-works/pi-coding-agent");
    const sm = runtime.getSessionManager();
    const sessions = await SessionManager.list(sm.getCwd(), sm.getSessionDir());
    return sessions;
  });

  ipcMain.handle("pi:close-session", async (_event, _args: { sessionId: string }) => {
    return { ok: true };
  });
}
