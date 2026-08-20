import { describe, it, expect, vi, beforeEach } from "vitest";
import { PiRuntime } from "./pi-runtime.js";

const mockSession = {
  sessionId: "test-session",
  sessionFile: "/test/session.jsonl",
  prompt: vi.fn(),
  subscribe: vi.fn(() => () => {}),
  dispose: vi.fn(),
};

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
    create: vi.fn(() => ({ getGlobalSettings: () => ({}) })),
    inMemory: vi.fn(),
  },
  DefaultResourceLoader: vi.fn().mockImplementation(() => ({
    reload: vi.fn().mockResolvedValue(undefined),
  })),
  createAgentSession: vi.fn().mockResolvedValue({ session: mockSession, extensionsResult: {} }),
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

  describe("PiRuntime.createSession()", () => {
    beforeEach(() => {
      PiRuntime.getInstance().reset();
    });

    it("creates session with webfetch tool and extensions wired", async () => {
      const { createAgentSession } = await import("@earendil-works/pi-coding-agent");
      const runtime = PiRuntime.getInstance();
      await runtime.init({ cwd: "/test" });

      await runtime.createSession();

      expect(createAgentSession).toHaveBeenCalled();
      const call = (createAgentSession as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.customTools).toBeDefined();
      expect(call.customTools.length).toBeGreaterThan(0);
      expect(call.tools).toContain("webfetch");
      expect(call.tools).toContain("read");
    });
  });
});
