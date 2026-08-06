// ADR-0053 TC — main-listener.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ipcRenderer } from "electron";
import { setupAutomationMainListener, cleanupAutomationMainListener } from "./main-listener";

// Mock electron ipcRenderer
vi.mock("electron", () => ({
  ipcRenderer: {
    on: vi.fn(),
    send: vi.fn(),
    removeAllListeners: vi.fn(),
  },
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock window.__appStore
const mockAppStore = {
  value: {
    providers: [
      {
        id: "test-provider",
        apiKey: "test-key",
        llm: {
          baseUrl: "https://api.test.com/v1/messages",
        },
      },
    ],
  },
};
Object.defineProperty(window, "__appStore", { value: mockAppStore, writable: true });

describe("main-listener", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    cleanupAutomationMainListener();
  });

  afterEach(() => {
    cleanupAutomationMainListener();
  });

  describe("setupAutomationMainListener", () => {
    it("registers listener for automations:execute-llm channel", () => {
      setupAutomationMainListener();

      expect(ipcRenderer.on).toHaveBeenCalledWith(
        "automations:execute-llm",
        expect.any(Function),
      );
    });

    it("does not register duplicate listeners", () => {
      setupAutomationMainListener();
      setupAutomationMainListener();

      // Should only be called once
      expect(ipcRenderer.on).toHaveBeenCalledTimes(1);
    });
  });

  describe("LLM execution flow", () => {
    it("sends result back via ipcRenderer.send on success", async () => {
      setupAutomationMainListener();

      // Get the listener callback
      const listenerCallback = (ipcRenderer.on as ReturnType<typeof vi.fn>).mock.calls[0][1];

      // Mock successful API response
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ content: [{ type: "text", text: "Hello from LLM!" }] }),
      });

      // Simulate main process sending execution request
      const payload = {
        executionId: "exec-123",
        action: {
          kind: "llm" as const,
          systemPrompt: "You are helpful.",
          userPrompt: "Say hello",
          providerId: "test-provider",
          modelId: "test-model",
          timeoutMs: 300_000,
        },
      };

      // Invoke the listener callback manually
      await listenerCallback(null, payload);

      // Verify result was sent back
      expect(ipcRenderer.send).toHaveBeenCalledWith(
        "automations:execute-llm-result",
        expect.objectContaining({
          executionId: "exec-123",
          status: "success",
          finalText: "Hello from LLM!",
        }),
      );
    });

    it("handles API errors gracefully", async () => {
      setupAutomationMainListener();

      const listenerCallback = (ipcRenderer.on as ReturnType<typeof vi.fn>).mock.calls[0][1];

      // Mock failed API response
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
      });

      const payload = {
        executionId: "exec-456",
        action: {
          kind: "llm" as const,
          systemPrompt: "You are helpful.",
          userPrompt: "Say hello",
          providerId: "test-provider",
          modelId: "test-model",
          timeoutMs: 300_000,
        },
      };

      await listenerCallback(null, payload);

      expect(ipcRenderer.send).toHaveBeenCalledWith(
        "automations:execute-llm-result",
        expect.objectContaining({
          executionId: "exec-456",
          status: "error",
          error: expect.stringContaining("401"),
        }),
      );
    });

    it("handles network errors gracefully", async () => {
      setupAutomationMainListener();

      const listenerCallback = (ipcRenderer.on as ReturnType<typeof vi.fn>).mock.calls[0][1];

      // Mock network error
      mockFetch.mockRejectedValue(new Error("Network failure"));

      const payload = {
        executionId: "exec-789",
        action: {
          kind: "llm" as const,
          systemPrompt: "You are helpful.",
          userPrompt: "Say hello",
          providerId: "test-provider",
          modelId: "test-model",
          timeoutMs: 300_000,
        },
      };

      await listenerCallback(null, payload);

      expect(ipcRenderer.send).toHaveBeenCalledWith(
        "automations:execute-llm-result",
        expect.objectContaining({
          executionId: "exec-789",
          status: "error",
          error: expect.stringContaining("Network failure"),
        }),
      );
    });

    it("returns error when provider not found", async () => {
      setupAutomationMainListener();

      const listenerCallback = (ipcRenderer.on as ReturnType<typeof vi.fn>).mock.calls[0][1];

      const payload = {
        executionId: "exec-unknown",
        action: {
          kind: "llm" as const,
          systemPrompt: "You are helpful.",
          userPrompt: "Say hello",
          providerId: "nonexistent-provider",
          modelId: "test-model",
          timeoutMs: 300_000,
        },
      };

      await listenerCallback(null, payload);

      expect(ipcRenderer.send).toHaveBeenCalledWith(
        "automations:execute-llm-result",
        expect.objectContaining({
          executionId: "exec-unknown",
          status: "error",
          error: expect.stringContaining("not found"),
        }),
      );
    });
  });
});
