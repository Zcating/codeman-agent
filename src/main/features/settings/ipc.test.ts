import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerSettingsIpc } from "./ipc.js";
import { SettingsState } from "./state.js";

const fakeIpcMain = vi.hoisted(() => ({ handle: vi.fn() }));

vi.mock("electron", () => ({
  ipcMain: fakeIpcMain,
}));

describe("registerSettingsIpc", () => {
  beforeEach(() => {
    fakeIpcMain.handle.mockClear();
  });

  it("registers getSettings/updateSettings/deleteProvider channels", () => {
    registerSettingsIpc({ settings: new SettingsState("/tmp/x") });
    const channels = fakeIpcMain.handle.mock.calls.map((c) => c[0]);
    expect(channels).toEqual([
      "getSettings",
      "updateSettings",
      "deleteProvider",
      "subAgents:list",
      "subAgents:add",
      "subAgents:update",
      "subAgents:delete",
      "subAgents:setEnabled",
    ]);
    expect(fakeIpcMain.handle).toHaveBeenCalledTimes(8);
  });

  it("getSettings handler delegates to settings.load()", () => {
    const load = vi.fn().mockReturnValue({ providers: [] });
    registerSettingsIpc({
      settings: {
        load,
        update: vi.fn(),
        deleteProvider: vi.fn(),
      } as unknown as SettingsState,
    });
    const handler = fakeIpcMain.handle.mock.calls.find(
      (c) => c[0] === "getSettings",
    )![1] as () => unknown;
    const result = handler();
    expect(load).toHaveBeenCalled();
    expect(result).toEqual({ providers: [] });
  });

  it("updateSettings handler unwraps newSettings and calls settings.update()", async () => {
    const update = vi.fn().mockReturnValue({ theme: "dark" });
    registerSettingsIpc({
      settings: {
        load: vi.fn(),
        update,
        deleteProvider: vi.fn(),
      } as unknown as SettingsState,
    });
    const handler = fakeIpcMain.handle.mock.calls.find(
      (c) => c[0] === "updateSettings",
    )![1] as (e: unknown, args: unknown) => unknown;
    const result = await handler(undefined, { newSettings: { theme: "dark" } });
    expect(update).toHaveBeenCalledWith({ theme: "dark" });
    expect(result).toEqual({ theme: "dark" });
  });

  it("deleteProvider handler delegates to settings.deleteProvider(id)", async () => {
    const deleteProvider = vi.fn().mockReturnValue([{ id: "p2" }]);
    registerSettingsIpc({
      settings: {
        load: vi.fn(),
        update: vi.fn(),
        deleteProvider,
      } as unknown as SettingsState,
    });
    const handler = fakeIpcMain.handle.mock.calls.find(
      (c) => c[0] === "deleteProvider",
    )![1] as (e: unknown, args: { id: string }) => unknown;
    const result = await handler(undefined, { id: "p1" });
    expect(deleteProvider).toHaveBeenCalledWith("p1");
    expect(result).toEqual([{ id: "p2" }]);
  });

  it("subAgents:update handler receives single args object and correctly destructures id and patch", async () => {
    const update = vi.fn().mockReturnValue({ subAgents: [] });
    const mockSubAgents = [
      { id: "agent-1", name: "Agent 1", description: "", systemPrompt: "", modelId: "", thinkingLevel: "off" as const, allowedTools: [], enabled: true, createdAt: 0, updatedAt: 0 },
    ];
    registerSettingsIpc({
      settings: {
        load: vi.fn().mockReturnValue({ subAgents: mockSubAgents }),
        update,
        deleteProvider: vi.fn(),
      } as unknown as SettingsState,
    });
    const handler = fakeIpcMain.handle.mock.calls.find(
      (c) => c[0] === "subAgents:update",
    )![1] as (e: unknown, args: { id: string; patch: unknown }) => unknown;
    // This is the RED test: invoke with single object args (how preload calls it)
    const result = await handler(undefined, { id: "agent-1", patch: { name: "Updated Agent" } });
    expect(update).toHaveBeenCalledWith({
      subAgents: expect.arrayContaining([
        expect.objectContaining({ id: "agent-1", name: "Updated Agent" }),
      ]),
    });
    expect(result).toEqual(expect.objectContaining({ id: "agent-1", name: "Updated Agent" }));
  });
});
