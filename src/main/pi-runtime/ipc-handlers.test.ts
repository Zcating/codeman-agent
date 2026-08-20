import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BrowserWindow } from "electron";

const mockIpcMain = { handle: vi.fn(), removeHandler: vi.fn() };

vi.mock("electron", () => ({
  ipcMain: mockIpcMain,
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
  SessionManager: {
    create: vi.fn(),
    inMemory: vi.fn(),
    list: vi.fn(),
    open: vi.fn(),
  },
  createAgentSession: vi.fn(),
}));

const mockWebContents = { send: vi.fn() };
const mockWindow = {
  webContents: mockWebContents,
  isDestroyed: () => false,
} as unknown as BrowserWindow;

import { registerPiIpcHandlers } from "./ipc-handlers.js";
import { PiRuntime } from "./pi-runtime.js";

describe("ipc-handlers", () => {
  beforeEach(() => {
    mockIpcMain.handle.mockClear();
    mockIpcMain.removeHandler.mockClear();
    mockWebContents.send.mockClear();
    PiRuntime.getInstance().reset();
  });

  describe("registerPiIpcHandlers", () => {
    it("registers 10 expected IPC channels", () => {
      registerPiIpcHandlers(mockIpcMain as any, mockWindow);

      const channels = mockIpcMain.handle.mock.calls.map((c: unknown[]) => c[0]);
      expect(channels).toContain("pi:create-session");
      expect(channels).toContain("pi:prompt");
      expect(channels).toContain("pi:abort");
      expect(channels).toContain("pi:open-session");
      expect(channels).toContain("pi:list-sessions");
      expect(channels).toContain("pi:close-session");
      expect(channels).toContain("pi:list-providers");
      expect(channels).toContain("pi:set-api-key");
      expect(channels).toContain("pi:get-settings");
      expect(channels).toContain("pi:set-setting");
      expect(channels.length).toBe(10);
    });
  });
});
