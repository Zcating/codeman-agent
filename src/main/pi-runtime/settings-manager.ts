import type { SettingsManager } from "@earendil-works/pi-coding-agent";
import { getSettingsJsonPath } from "./pi-config.js";

export interface PiUserSettings {
  theme?: string;
  defaultProvider?: string;
  defaultModel?: string;
}

export class SettingsManagerWrapper {
  private manager: SettingsManager;

  constructor(manager: SettingsManager) {
    this.manager = manager;
  }

  async getSettings(): Promise<PiUserSettings> {
    const settings = this.manager.getGlobalSettings();
    return {
      theme: settings.theme,
      defaultProvider: settings.defaultProvider,
      defaultModel: settings.defaultModel,
    };
  }

  async setSetting(key: string, value: unknown): Promise<void> {
    switch (key) {
      case "theme":
        this.manager.setTheme(value as string);
        break;
      case "defaultProvider":
        this.manager.setDefaultProvider(value as string);
        break;
      case "defaultModel":
        this.manager.setDefaultModel(value as string);
        break;
      default:
        break;
    }
  }

  getConfigPath(): string {
    return getSettingsJsonPath();
  }
}
