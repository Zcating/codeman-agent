// Tests the renderer-side automations LLM listener (formerly main-listener.test.ts).
// Mocks `window.codeman` bridge instead of `electron` because the IPC
// subscription now lives in preload.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  setupAutomationMainListener,
  cleanupAutomationMainListener,
  executeLlmInRenderer,
  handleAutomationLlm,
} from "./automation-llm";
import type { LlmExecuteRequest } from "@codeman-frontend/shared/apis";

// Mock sub-agent factory
const mockPrompt = vi.fn();
const mockAbort = vi.fn(() => {});

vi.mock("@codeman-frontend/plugins/multi-agents/lib/sub-agent-factory", () => ({
  createSubAgent: vi.fn(() => ({
    subscribe: vi.fn(() => () => {}),
    prompt: mockPrompt,
    abort: mockAbort,
  })),
  ToolRegistry: Map,
}));

// Mock window.__appStore
const mockAppStore = {
  value: {
    providers: [
      {
        id: "test-provider",
        apiKey: "test-key",
        llm: {
          baseUrl: "https://api.test.com/v1/messages",
          defaultModel: "test-model",
          models: [
            { id: "test-model", label: "Test Model", contextWindow: 200_000, thinking: false, deprecated: false },
          ],
        },
      },
    ],
  },
};
Object.defineProperty(window, "__appStore", { value: mockAppStore, writable: true });

// Bridge mock — mirrors the new preload surface .
// Captures handlers so tests can invoke them, and tracks result-posts.
const bridgeHandlers: Array<(req: LlmExecuteRequest) => void | Promise<void>> = [];
const mockSubscription = vi.fn((handler) => {
  bridgeHandlers.push(handler);
  return () => {
    const idx = bridgeHandlers.indexOf(handler);
    if (idx !== -1) {
      bridgeHandlers.splice(idx, 1);
    }
  };
});
const mockSendResult = vi.fn();

Object.defineProperty(window, "codeman", {
  value: {
    automationsExecuteLlm: mockSubscription,
    automationsSendLlmResult: mockSendResult,
  },
  writable: true,
  configurable: true,
});

describe("automation-llm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrompt.mockReset();
    mockSendResult.mockReset();
    // Clear any captured handlers from previous tests
    bridgeHandlers.length = 0;
    cleanupAutomationMainListener();
  });

  afterEach(() => {
    cleanupAutomationMainListener();
  });

  describe("setupAutomationMainListener", () => {
    it("registers a bridge subscription", () => {
      setupAutomationMainListener();

      expect(mockSubscription).toHaveBeenCalledTimes(1);
      expect(typeof mockSubscription.mock.calls[0][0]).toBe("function");
    });

    it("does not register duplicate subscriptions", () => {
      setupAutomationMainListener();
      setupAutomationMainListener();

      expect(mockSubscription).toHaveBeenCalledTimes(1);
    });

    it("cleanupAutomationMainListener unsubscribes", () => {
      setupAutomationMainListener();
      cleanupAutomationMainListener();
      setupAutomationMainListener();

      expect(mockSubscription).toHaveBeenCalledTimes(2);
      // After second setup, only the second handler is active.
      expect(bridgeHandlers.length).toBe(1);
    });
  });

  describe("executeLlmInRenderer", () => {
    const baseAction = {
      kind: "llm" as const,
      systemPrompt: "You are helpful.",
      userPrompt: "Say hello",
      providerId: "test-provider",
      modelId: "test-model",
      timeoutMs: 300_000,
    };

    it("returns success with finalText on happy path", async () => {
      mockPrompt.mockResolvedValue({
        stopReason: "end_turn",
        content: [{ type: "text", text: "Hello from LLM!" }],
        usage: { inputTokens: 10, outputTokens: 20 },
      });

      const result = await executeLlmInRenderer(baseAction);

      expect(result).toEqual({ status: "success", finalText: "Hello from LLM!" });
    });

    it("returns error when provider is missing", async () => {
      const result = await executeLlmInRenderer({ ...baseAction, providerId: "nonexistent" });

      expect(result.status).toBe("error");
      expect(result.error).toContain("nonexistent");
    });

    it("returns error when sub-agent stopReason is 'error'", async () => {
      mockPrompt.mockResolvedValue({
        stopReason: "error",
        errorMessage: "Model not found",
        content: [],
        usage: { inputTokens: 10, outputTokens: 0 },
      });

      const result = await executeLlmInRenderer(baseAction);

      expect(result).toEqual({ status: "error", error: "Model not found" });
    });

    it("catches promise rejections from sub-agent", async () => {
      mockPrompt.mockRejectedValue(new Error("Network failure"));

      const result = await executeLlmInRenderer(baseAction);

      expect(result.status).toBe("error");
      expect(result.error).toContain("Network failure");
    });
  });

  describe("handleAutomationLlm", () => {
    const baseRequest: LlmExecuteRequest = {
      executionId: "exec-123",
      action: {
        kind: "llm",
        systemPrompt: "You are helpful.",
        userPrompt: "Say hello",
        providerId: "test-provider",
        modelId: "test-model",
        timeoutMs: 300_000,
      },
    };

    it("posts success result on happy path", async () => {
      mockPrompt.mockResolvedValue({
        stopReason: "end_turn",
        content: [{ type: "text", text: "Hi!" }],
        usage: { inputTokens: 5, outputTokens: 3 },
      });

      await handleAutomationLlm(baseRequest);

      expect(mockSendResult).toHaveBeenCalledWith({
        executionId: "exec-123",
        status: "success",
        finalText: "Hi!",
        error: undefined,
      });
    });

    it("posts error result when sub-agent fails", async () => {
      mockPrompt.mockResolvedValue({
        stopReason: "error",
        errorMessage: "Model not found",
        content: [],
        usage: { inputTokens: 5, outputTokens: 0 },
      });

      await handleAutomationLlm(baseRequest);

      expect(mockSendResult).toHaveBeenCalledWith({
        executionId: "exec-123",
        status: "error",
        finalText: undefined,
        error: "Model not found",
      });
    });

    it("posts error result when executeLlmInRenderer throws", async () => {
      mockPrompt.mockRejectedValue(new Error("Network failure"));

      await handleAutomationLlm(baseRequest);

      expect(mockSendResult).toHaveBeenCalledWith({
        executionId: "exec-123",
        status: "error",
        finalText: undefined,
        error: expect.stringContaining("Network failure"),
      });
    });

    it("preserves executionId across the round-trip", async () => {
      mockPrompt.mockResolvedValue({
        stopReason: "end_turn",
        content: [{ type: "text", text: "ok" }],
        usage: { inputTokens: 1, outputTokens: 1 },
      });

      await handleAutomationLlm({ ...baseRequest, executionId: "exec-other-456" });

      expect(mockSendResult.mock.calls[0][0].executionId).toBe("exec-other-456");
    });
  });
});