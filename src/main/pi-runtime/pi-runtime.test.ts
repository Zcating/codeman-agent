import { describe, it, expect, vi, beforeEach } from "vitest";
import { PiRuntime } from "./pi-runtime.js";

vi.mock("@earendil-works/pi-coding-agent", () => ({
  SessionManager: {
    create: vi.fn(() => ({ getCwd: () => "/test" })),
    inMemory: vi.fn(),
    list: vi.fn(),
  },
  ModelRuntime: {
    create: vi.fn(() => ({})),
  },
  SettingsManager: {
    create: vi.fn(() => ({})),
    inMemory: vi.fn(),
  },
  createAgentSession: vi.fn(),
}));

describe("pi-runtime", () => {
  describe("PiRuntime.getInstance()", () => {
    it("returns singleton instance", () => {
      const instance1 = PiRuntime.getInstance();
      const instance2 = PiRuntime.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe("PiRuntime.init()", () => {
    beforeEach(() => {
      PiRuntime.getInstance().reset();
    });

    it("creates SessionManager, ModelRuntime, and SettingsManager", async () => {
      const { SessionManager, ModelRuntime, SettingsManager } = await import("@earendil-works/pi-coding-agent");

      const runtime = PiRuntime.getInstance();
      await runtime.init({ cwd: "/test" });

      expect(SessionManager.create).toHaveBeenCalled();
      expect(ModelRuntime.create).toHaveBeenCalled();
      expect(SettingsManager.create).toHaveBeenCalled();
    });

    it("throws if initialized twice", async () => {
      const runtime = PiRuntime.getInstance();
      await runtime.init({ cwd: "/test" });

      const initAgain = async () => {
        await runtime.init({ cwd: "/test2" });
      };
      await expect(initAgain()).rejects.toThrow("already initialized");
    });
  });

  describe("PiRuntime.getSessionManager()", () => {
    beforeEach(() => {
      PiRuntime.getInstance().reset();
    });

    it("returns the session manager after init", async () => {
      const runtime = PiRuntime.getInstance();
      await runtime.init({ cwd: "/test" });

      const sm = runtime.getSessionManager();
      expect(sm).toBeDefined();
    });
  });
});
