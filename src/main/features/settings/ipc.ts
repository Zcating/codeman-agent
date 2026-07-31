import { ipcMain } from "electron";
import type { Settings } from "../../settings-schema";
import type { SettingsState } from "./state.js";

export function registerSettingsIpc(deps: {
  settings: SettingsState;
}): void {
  ipcMain.handle("getSettings", () => deps.settings.load());
  ipcMain.handle("updateSettings", (_e, args: unknown) => {
    const rawPatch =
      (args && typeof args === "object" && ("newSettings" in args ? (args as { newSettings: unknown }).newSettings : args)) ?? {};
    return deps.settings.update(rawPatch as Partial<Settings>);
  });
  ipcMain.handle("deleteProvider", (_e, args: { id: string }) => {
    return deps.settings.deleteProvider(args.id);
  });
}
