import { describe, it, expect, vi, beforeEach } from "vitest";
import { ModelRuntimeWrapper } from "./model-runtime.js";

vi.mock("electron", () => ({
  app: { getPath: vi.fn().mockReturnValue("/home/user") },
}));

const mockModelRuntime = {
  getProviders: vi.fn(),
  setRuntimeApiKey: vi.fn(),
};

describe("ModelRuntimeWrapper", () => {
  let wrapper: ModelRuntimeWrapper;

  beforeEach(() => {
    vi.clearAllMocks();
    wrapper = new ModelRuntimeWrapper(mockModelRuntime as any);
  });

  describe("listProviders", () => {
    it("returns provider catalog from ModelRuntime", async () => {
      const mockProviders = [
        {
          id: "deepseek",
          name: "DeepSeek",
          baseUrl: "https://api.deepseek.com/anthropic",
          getModels: vi.fn().mockReturnValue([
            { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", contextWindow: 200000, thinking: false },
          ]),
        },
      ];
      mockModelRuntime.getProviders.mockReturnValue(mockProviders);

      const result = await wrapper.listProviders();

      expect(mockModelRuntime.getProviders).toHaveBeenCalledOnce();
      expect(result).toEqual([
        {
          id: "deepseek",
          label: "DeepSeek",
          baseUrl: "https://api.deepseek.com/anthropic",
          defaultModel: "",
          models: [
            { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash", contextWindow: 200000, thinking: false },
          ],
        },
      ]);
    });
  });

  describe("setApiKey", () => {
    it("writes API key to auth.json via ModelRuntime", async () => {
      mockModelRuntime.setRuntimeApiKey.mockResolvedValue(undefined);

      await wrapper.setApiKey("deepseek", "sk-test-key");

      expect(mockModelRuntime.setRuntimeApiKey).toHaveBeenCalledWith("deepseek", "sk-test-key");
    });
  });

  describe("getConfigPaths", () => {
    it("returns auth.json and models.json paths", () => {
      const paths = wrapper.getConfigPaths();

      expect(paths.authJson).toMatch(/\.pi\/auth\.json$/);
      expect(paths.modelsJson).toMatch(/\.pi\/models\.json$/);
    });
  });
});
