import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { agentSessionEventToRuntimeEvent } from "./types.js";

const mockWebContents = { send: vi.fn() };

describe("event-bridge", () => {
  beforeEach(() => {
    mockWebContents.send.mockClear();
  });

  describe("agentSessionEventToRuntimeEvent", () => {
    it("maps text_delta from message_update to token", () => {
      const event: AgentSessionEvent = {
        type: "message_update",
        message: {} as any,
        assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "hello", partial: {} as any },
      };
      const result = agentSessionEventToRuntimeEvent(event);
      expect(result).toEqual({ type: "token", content: "hello" });
    });

    it("maps tool_execution_start to tool_call", () => {
      const event: AgentSessionEvent = {
        type: "tool_execution_start",
        toolCallId: "call1",
        toolName: "read",
        args: { file: "test.txt" },
      };
      const result = agentSessionEventToRuntimeEvent(event);
      expect(result).toEqual({ type: "tool_call", name: "read", input: { file: "test.txt" } });
    });

    it("maps tool_execution_end to tool_result", () => {
      const event: AgentSessionEvent = {
        type: "tool_execution_end",
        toolCallId: "call1",
        toolName: "read",
        result: { content: "file content" },
        isError: false,
      };
      const result = agentSessionEventToRuntimeEvent(event);
      expect(result).toEqual({ type: "tool_result", name: "read", result: { content: "file content" } });
    });

    it("maps agent_settled to done", () => {
      const event: AgentSessionEvent = { type: "agent_settled" };
      const result = agentSessionEventToRuntimeEvent(event);
      expect(result).toEqual({ type: "done" });
    });

    it("maps agent_end to done", () => {
      const event: AgentSessionEvent = {
        type: "agent_end",
        messages: [],
        willRetry: false,
      };
      const result = agentSessionEventToRuntimeEvent(event);
      expect(result).toEqual({ type: "done" });
    });

    it("returns null for unmapped event types", () => {
      const event: AgentSessionEvent = {
        type: "turn_start",
      };
      const result = agentSessionEventToRuntimeEvent(event);
      expect(result).toBeNull();
    });

    it("returns null for message_update with non-text_delta event", () => {
      const event: AgentSessionEvent = {
        type: "message_update",
        message: {} as any,
        assistantMessageEvent: { type: "content_block_delta", delta: { type: "thinking", text: "..." } } as any,
      };
      const result = agentSessionEventToRuntimeEvent(event);
      expect(result).toBeNull();
    });
  });
});
