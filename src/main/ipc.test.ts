import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const testDataDir = mkdtempSync(join(tmpdir(), "codeman-ipc-test-"));

const fakeIpcMain = { handle: vi.fn() };
const fakeApp = {
  setLoginItemSettings: vi.fn(),
  getPath: vi.fn().mockReturnValue(testDataDir),
};
const fakeDialog = { showOpenDialog: vi.fn() };
const fakeNotification = vi.fn();
const fakeShell = { openExternal: vi.fn() };
const fakeWin = {
  webContents: { send: vi.fn() },
  isDestroyed: () => false,
};

vi.mock("electron", () => ({
  ipcMain: fakeIpcMain,
  app: fakeApp,
  BrowserWindow: { getAllWindows: () => [fakeWin] },
  dialog: fakeDialog,
  Notification: fakeNotification,
  shell: fakeShell,
}));

const EXPECTED_CHANNELS = [
  "getSettings",
  "updateSettings",
  "deleteProvider",
  "clearAllHistory",
  "listConversations",
  "getConversation",
  "createConversation",
  "archiveConversation",
  "deleteConversation",
  "renameConversation",
  "listMessages",
  "appendMessage",
  "searchMessages",
  "listWorkspaces",
  "addWorkspace",
  "renameWorkspace",
  "deleteWorkspace",
  "pickWorkspacePath",
  "readFile",
  "writeFile",
  "editFile",
  "searchFiles",
  "deleteFile",
  "setLoginItem",
  "notify",
  "openExternal",
  "getLogPath",
  "abortRequest",
  "skillsScan",
  "skillsLoad",
  "subAgents:list",
  "subAgents:add",
  "subAgents:update",
  "subAgents:delete",
  "subAgents:setEnabled",
  "runCommand",
  "automations:list",
  "automations:create",
  "automations:update",
  "automations:delete",
  "automations:toggle",
  "automations:run-now",
  "automations:list-executions",
  "automations:get-execution",
  "automations:run-missed",
];

describe("ipc.ts barrel", () => {
  beforeEach(() => {
    fakeIpcMain.handle.mockClear();
    fakeWin.webContents.send.mockClear();
  });

  it("registers all expected ipcMain.handle channels", async () => {
    const { registerIpcHandlers } = await import("./ipc.js");
    const { registerSkillsIpc } = await import("./features/skills/ipc.js");
    registerIpcHandlers({ getMainWindow: () => fakeWin as any });
    registerSkillsIpc();
    const channels = fakeIpcMain.handle.mock.calls.map((c) => c[0]);
    expect(channels).toEqual(expect.arrayContaining(EXPECTED_CHANNELS));
    expect(channels.length).toBe(EXPECTED_CHANNELS.length);
  });

  it("registers all automation channels via registerIpcHandlers (boot must not re-register)", async () => {
    const seen: string[] = [];
    fakeIpcMain.handle.mockImplementation((channel: string) => {
      seen.push(channel);
    });

    const { registerIpcHandlers } = await import("./ipc.js");
    registerIpcHandlers({ getMainWindow: () => fakeWin as any });

    const automationChannels = EXPECTED_CHANNELS.filter((c) => c.startsWith("automations:"));
    expect(automationChannels.length).toBeGreaterThan(0);
    for (const ch of automationChannels) {
      expect(seen).toContain(ch);
    }

    fakeIpcMain.handle.mockReset();
  });

  it("emitStreamChunk forwards event to first window", async () => {
    const { emitStreamChunk } = await import("./ipc.js");
    emitStreamChunk({ kind: "token", content: "hi" });
    expect(fakeWin.webContents.send).toHaveBeenCalledWith("stream-chunk", {
      kind: "token",
      content: "hi",
    });
  });

  it("emitStreamChunk skips destroyed windows", async () => {
    const destroyed = {
      webContents: { send: vi.fn() },
      isDestroyed: () => true,
    };
    const electron = await import("electron");
    vi.spyOn(electron.BrowserWindow, "getAllWindows").mockReturnValueOnce([
      destroyed as any,
      fakeWin as any,
    ]);
    const { emitStreamChunk } = await import("./ipc.js");
    emitStreamChunk({ kind: "x" });
    expect(destroyed.webContents.send).not.toHaveBeenCalled();
    expect(fakeWin.webContents.send).toHaveBeenCalled();
  });
});

afterAll(() => {
  rmSync(testDataDir, { recursive: true, force: true });
});
