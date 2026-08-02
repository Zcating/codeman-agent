import { ipcMain } from "electron";
import type { Settings } from "./settings-schema";
import type { SettingsState } from "./state.js";
import { sandboxHandler } from "../../lib/sandbox-handler.js";

export function registerSettingsIpc(deps: {
  settings: SettingsState;
}): void {
  ipcMain.handle("getSettings", () => deps.settings.load());
  ipcMain.handle("updateSettings", sandboxHandler(async (args: unknown) => {
    const rawPatch =
      (args && typeof args === "object" && ("newSettings" in args ? (args as { newSettings: unknown }).newSettings : args)) ?? {};
    return deps.settings.update(rawPatch as Partial<Settings>);
  }));
  ipcMain.handle("deleteProvider", sandboxHandler(async (args: { id: string }) => {
    return deps.settings.deleteProvider(args.id);
  }));

  // Sub-agents CRUD handlers
  ipcMain.handle("subAgents:list", () => {
    const settings = deps.settings.load();
    return settings.subAgents ?? [];
  });

  ipcMain.handle("subAgents:add", (_, config: unknown) => {
    const settings = deps.settings.load();
    const newSubAgents = [...(settings.subAgents ?? []), config];
    deps.settings.update({ subAgents: newSubAgents } as Partial<Settings>);
    return config;
  });

  ipcMain.handle("subAgents:update", (_, args: { id: string; patch: unknown }) => {
    const { id, patch } = args;
    const settings = deps.settings.load();
    const newSubAgents = (settings.subAgents ?? []).map((c) =>
      c.id === id ? { ...c, ...(patch as object), updatedAt: Date.now() } : c
    );
    deps.settings.update({ subAgents: newSubAgents } as Partial<Settings>);
    const updated = newSubAgents.find((c) => c.id === id);
    return updated;
  });

  ipcMain.handle("subAgents:delete", (_, id: string) => {
    const settings = deps.settings.load();
    const newSubAgents = (settings.subAgents ?? []).filter((c) => c.id !== id);
    deps.settings.update({ subAgents: newSubAgents } as Partial<Settings>);
  });

  ipcMain.handle("subAgents:setEnabled", (_, id: string, enabled: boolean) => {
    const settings = deps.settings.load();
    const newSubAgents = (settings.subAgents ?? []).map((c) =>
      c.id === id ? { ...c, enabled, updatedAt: Date.now() } : c
    );
    deps.settings.update({ subAgents: newSubAgents } as Partial<Settings>);
    const updated = newSubAgents.find((c) => c.id === id);
    return updated;
  });
}
