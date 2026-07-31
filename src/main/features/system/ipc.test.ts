import { describe, it, expect, vi, beforeEach } from "vitest";

const fakeIpcMain = { handle: vi.fn() };
const fakeApp = { setLoginItemSettings: vi.fn() };
const fakeNotification = vi.fn();
const fakeShell = { openExternal: vi.fn().mockResolvedValue(undefined) };

vi.mock("electron", () => ({
  ipcMain: fakeIpcMain,
  app: fakeApp,
  Notification: fakeNotification,
  shell: fakeShell,
}));

vi.mock("electron-log", () => ({
  default: { transports: { file: { getFile: () => ({ path: "/tmp/log.txt" }) } } },
}));

const { registerSystemIpc } = await import("./ipc.js");

class FakeNotificationInstance {
  constructor(public opts: unknown) {}
  show = vi.fn();
}

beforeEach(() => {
  fakeIpcMain.handle.mockClear();
  fakeApp.setLoginItemSettings.mockClear();
  fakeNotification.mockClear();
  fakeShell.openExternal.mockClear();
  fakeNotification.mockImplementation(FakeNotificationInstance as unknown as () => unknown);
});

describe("registerSystemIpc", () => {
  it("registers 4 channels with expected names", () => {
    registerSystemIpc();
    const channels = fakeIpcMain.handle.mock.calls.map((call) => call[0]);
    expect(channels).toEqual(["setLoginItem", "notify", "openExternal", "getLogPath"]);
  });

  it("setLoginItem handler sets openAtLogin true when args.enabled is true", async () => {
    registerSystemIpc();
    const handler = fakeIpcMain.handle.mock.calls.find((call) => call[0] === "setLoginItem")?.[1];
    await handler(null, { enabled: true });
    expect(fakeApp.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true });
  });

  it("setLoginItem handler sets openAtLogin false when args is null", async () => {
    registerSystemIpc();
    const handler = fakeIpcMain.handle.mock.calls.find((call) => call[0] === "setLoginItem")?.[1];
    await handler(null, null);
    expect(fakeApp.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: false });
  });

  it("notify handler shows a Notification", async () => {
    registerSystemIpc();
    const handler = fakeIpcMain.handle.mock.calls.find((call) => call[0] === "notify")?.[1];
    await handler(null, { title: "Hello", body: "World" });
    const instance = fakeNotification.mock.results[0]?.value as FakeNotificationInstance | undefined;
    expect(fakeNotification).toHaveBeenCalledWith({ title: "Hello", body: "World" });
    expect(instance?.show).toHaveBeenCalled();
  });

  it("openExternal handler calls shell.openExternal", async () => {
    registerSystemIpc();
    const handler = fakeIpcMain.handle.mock.calls.find((call) => call[0] === "openExternal")?.[1];
    await handler(null, { url: "https://example.com" });
    expect(fakeShell.openExternal).toHaveBeenCalledWith("https://example.com");
  });

  it("getLogPath handler returns the log file path", async () => {
    registerSystemIpc();
    const handler = fakeIpcMain.handle.mock.calls.find((call) => call[0] === "getLogPath")?.[1];
    const result = await handler(null, null);
    expect(result).toBe("/tmp/log.txt");
  });
});
