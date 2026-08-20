import { describe, it, expect, vi, beforeEach } from "vitest";
import { SettingsManagerWrapper } from "./settings-manager.js";

vi.mock("electron", () => ({
  app: { getPath: vi.fn().mockReturnValue("/home/user") },
}));

const mockSettingsManager = {
  getGlobalSettings: vi.fn(),
  setTheme: vi.fn(),
  setDefaultProvider: vi.fn(),
  setDefaultModel: vi.fn(),
};

describe("SettingsManagerWrapper", () => {
  let wrapper: SettingsManagerWrapper;

  beforeEach(() => {
    vi.clearAllMocks();
    wrapper = new SettingsManagerWrapper(mockSettingsManager as any);
  });

  describe("getSettings", () => {
    it("returns user settings from SettingsManager", async () => {
      const mockSettings = {
        theme: "dark",
        defaultProvider: "deepseek",
        defaultModel: "deepseek-v4-flash",
      };
      mockSettingsManager.getGlobalSettings.mockReturnValue(mockSettings);

      const result = await wrapper.getSettings();

      expect(mockSettingsManager.getGlobalSettings).toHaveBeenCalledOnce();
      expect(result).toEqual({
        theme: "dark",
        defaultProvider: "deepseek",
        defaultModel: "deepseek-v4-flash",
      });
    });
  });

  describe("setSetting", () => {
    it("sets theme setting", async () => {
      await wrapper.setSetting("theme", "light");

      expect(mockSettingsManager.setTheme).toHaveBeenCalledWith("light");
    });

    it("sets defaultProvider setting", async () => {
      await wrapper.setSetting("defaultProvider", "deepseek");

      expect(mockSettingsManager.setDefaultProvider).toHaveBeenCalledWith("deepseek");
    });

    it("sets defaultModel setting", async () => {
      await wrapper.setSetting("defaultModel", "deepseek-v4-flash");

      expect(mockSettingsManager.setDefaultModel).toHaveBeenCalledWith("deepseek-v4-flash");
    });

    it("does nothing for unknown key", async () => {
      await wrapper.setSetting("unknownKey", "value");

      expect(mockSettingsManager.setTheme).not.toHaveBeenCalled();
      expect(mockSettingsManager.setDefaultProvider).not.toHaveBeenCalled();
      expect(mockSettingsManager.setDefaultModel).not.toHaveBeenCalled();
    });
  });

  describe("getConfigPath", () => {
    it("returns settings.json path", () => {
      const path = wrapper.getConfigPath();

      expect(path).toMatch(/\.pi\/settings\.json$/);
    });
  });
});
