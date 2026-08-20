import { describe, expect, it, beforeEach } from "vitest";
import { delegateStreamsStore } from "./delegate-streams.store";
import type { SubAgentId } from "@codeman-frontend/shared/lib/sub-agent-schema";
import type { AgentEvent } from "@earendil-works/pi-agent-core";

function makeMessageUpdateEvent(content: string): AgentEvent {
  return {
    type: "message_update",
    message: {
      id: "msg-1",
      role: "assistant",
      content: [{ type: "text" as const, text: content }],
      createdAt: Date.now(),
    },
  } as unknown as AgentEvent;
}

describe("delegateStreamsStore", () => {
  beforeEach(() => {
    delegateStreamsStore.actions._resetForTest();
  });

  describe("recordStart", () => {
    it("creates entry with status running", () => {
      const toolCallId = "tc-1";
      const agentId = "sa-1" as SubAgentId;
      const agentName = "Researcher";
      delegateStreamsStore.actions.recordStart(toolCallId, agentId, agentName);

      const entry = delegateStreamsStore.state.byToolCall[toolCallId];
      expect(entry).toBeDefined();
      expect(entry!.status).toBe("running");
      expect(entry!.agentId).toBe(agentId);
      expect(entry!.agentName).toBe(agentName);
      expect(entry!.events).toEqual([]);
    });
  });

  describe("appendEvent", () => {
    it("appends event to entry events array", () => {
      const toolCallId = "tc-1";
      const agentId = "sa-1" as SubAgentId;
      delegateStreamsStore.actions.recordStart(toolCallId, agentId, "Researcher");

      const evt = makeMessageUpdateEvent("Hello world");
      delegateStreamsStore.actions.appendEvent(toolCallId, evt);

      const entry = delegateStreamsStore.state.byToolCall[toolCallId];
      expect(entry!.events).toHaveLength(1);
      expect(entry!.events[0]).toStrictEqual(evt);
    });

    it("does nothing if entry does not exist", () => {
      const evt = makeMessageUpdateEvent("Hello");
      delegateStreamsStore.actions.appendEvent("nonexistent", evt);
      expect(Object.keys(delegateStreamsStore.state.byToolCall)).toHaveLength(0);
    });
  });

  describe("recordComplete", () => {
    it("sets status to completed and records finalText and usage", () => {
      const toolCallId = "tc-1";
      const agentId = "sa-1" as SubAgentId;
      const usage = { inputTokens: 100, outputTokens: 200 };
      delegateStreamsStore.actions.recordStart(toolCallId, agentId, "Researcher");

      delegateStreamsStore.actions.recordComplete(toolCallId, "Done!", usage);

      const entry = delegateStreamsStore.state.byToolCall[toolCallId];
      expect(entry!.status).toBe("completed");
      expect(entry!.finalText).toBe("Done!");
      expect(entry!.usage).toEqual(usage);
      expect(entry!.completedAt).toBeDefined();
    });
  });

  describe("recordError", () => {
    it("sets status to error and records error message", () => {
      const toolCallId = "tc-1";
      const agentId = "sa-1" as SubAgentId;
      delegateStreamsStore.actions.recordStart(toolCallId, agentId, "Researcher");

      delegateStreamsStore.actions.recordError(toolCallId, "Something went wrong");

      const entry = delegateStreamsStore.state.byToolCall[toolCallId];
      expect(entry!.status).toBe("error");
      expect(entry!.error).toBe("Something went wrong");
    });
  });

  describe("cleanup", () => {
    it("removes entry from store", () => {
      const toolCallId = "tc-1";
      const agentId = "sa-1" as SubAgentId;
      delegateStreamsStore.actions.recordStart(toolCallId, agentId, "Researcher");

      delegateStreamsStore.actions.cleanup(toolCallId);

      expect(delegateStreamsStore.state.byToolCall[toolCallId]).toBeUndefined();
    });
  });

  describe("LRU eviction", () => {
    it("removes oldest completed entry when exceeding 50 entries", () => {
      for (let i = 0; i < 50; i++) {
        const toolCallId = `tc-${i}`;
        const agentId = `sa-${i}` as SubAgentId;
        delegateStreamsStore.actions.recordStart(toolCallId, agentId, `Agent ${i}`);
        delegateStreamsStore.actions.recordComplete(toolCallId, `Result ${i}`, { inputTokens: 10, outputTokens: 20 });
      }

      expect(Object.keys(delegateStreamsStore.state.byToolCall)).toHaveLength(49);

      delegateStreamsStore.actions.recordStart("tc-50", "sa-50" as SubAgentId, "Agent 50");

      expect(delegateStreamsStore.state.byToolCall["tc-0"]).toBeUndefined();
      expect(delegateStreamsStore.state.byToolCall["tc-1"]).toBeDefined();

      expect(delegateStreamsStore.state.byToolCall["tc-50"]).toBeDefined();
      expect(delegateStreamsStore.state.byToolCall["tc-50"]!.status).toBe("running");

      expect(Object.keys(delegateStreamsStore.state.byToolCall)).toHaveLength(50);
    });

    it("does not count running entries in LRU limit", () => {
      for (let i = 0; i < 50; i++) {
        const toolCallId = `tc-running-${i}`;
        const agentId = `sa-${i}` as SubAgentId;
        delegateStreamsStore.actions.recordStart(toolCallId, agentId, `Agent ${i}`);
      }

      expect(Object.keys(delegateStreamsStore.state.byToolCall)).toHaveLength(50);

      delegateStreamsStore.actions.recordStart("tc-running-50", "sa-50" as SubAgentId, "Agent 50");

      expect(Object.keys(delegateStreamsStore.state.byToolCall)).toHaveLength(51);
    });
  });
});
