import { describe, expect, it, beforeEach } from "vitest";
import { subAgentsStreamStore } from "./sub-agents-stream.store";
import type { SubAgentId } from "../lib/sub-agent.types";
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

describe("subAgentsStreamStore", () => {
  beforeEach(() => {
    subAgentsStreamStore.actions._resetForTest();
  });

  describe("recordStart", () => {
    it("creates entry with status running", () => {
      const toolCallId = "tc-1";
      const subAgentId = "sa-1" as SubAgentId;
      const subAgentName = "Researcher";
      subAgentsStreamStore.actions.recordStart(toolCallId, subAgentId, subAgentName);

      const entry = subAgentsStreamStore.state.byToolCall[toolCallId];
      expect(entry).toBeDefined();
      expect(entry!.status).toBe("running");
      expect(entry!.subAgentId).toBe(subAgentId);
      expect(entry!.subAgentName).toBe(subAgentName);
      expect(entry!.events).toEqual([]);
    });
  });

  describe("appendEvent", () => {
    it("appends event to entry events array", () => {
      const toolCallId = "tc-1";
      const subAgentId = "sa-1" as SubAgentId;
      subAgentsStreamStore.actions.recordStart(toolCallId, subAgentId, "Researcher");

      const evt = makeMessageUpdateEvent("Hello world");
      subAgentsStreamStore.actions.appendEvent(toolCallId, evt);

      const entry = subAgentsStreamStore.state.byToolCall[toolCallId];
      expect(entry!.events).toHaveLength(1);
      expect(entry!.events[0]).toStrictEqual(evt);
    });

    it("does nothing if entry does not exist", () => {
      const evt = makeMessageUpdateEvent("Hello");
      // Should not throw
      subAgentsStreamStore.actions.appendEvent("nonexistent", evt);
      expect(Object.keys(subAgentsStreamStore.state.byToolCall)).toHaveLength(0);
    });
  });

  describe("recordComplete", () => {
    it("sets status to completed and records finalText and usage", () => {
      const toolCallId = "tc-1";
      const subAgentId = "sa-1" as SubAgentId;
      const usage = { inputTokens: 100, outputTokens: 200 };
      subAgentsStreamStore.actions.recordStart(toolCallId, subAgentId, "Researcher");

      subAgentsStreamStore.actions.recordComplete(toolCallId, "Done!", usage);

      const entry = subAgentsStreamStore.state.byToolCall[toolCallId];
      expect(entry!.status).toBe("completed");
      expect(entry!.finalText).toBe("Done!");
      expect(entry!.usage).toEqual(usage);
      expect(entry!.completedAt).toBeDefined();
    });
  });

  describe("recordError", () => {
    it("sets status to error and records error message", () => {
      const toolCallId = "tc-1";
      const subAgentId = "sa-1" as SubAgentId;
      subAgentsStreamStore.actions.recordStart(toolCallId, subAgentId, "Researcher");

      subAgentsStreamStore.actions.recordError(toolCallId, "Something went wrong");

      const entry = subAgentsStreamStore.state.byToolCall[toolCallId];
      expect(entry!.status).toBe("error");
      expect(entry!.error).toBe("Something went wrong");
    });
  });

  describe("cleanup", () => {
    it("removes entry from store", () => {
      const toolCallId = "tc-1";
      const subAgentId = "sa-1" as SubAgentId;
      subAgentsStreamStore.actions.recordStart(toolCallId, subAgentId, "Researcher");

      subAgentsStreamStore.actions.cleanup(toolCallId);

      expect(subAgentsStreamStore.state.byToolCall[toolCallId]).toBeUndefined();
    });
  });

  describe("LRU eviction", () => {
    it("removes oldest completed entry when exceeding 50 entries", () => {
      // Create 50 completed entries (eviction happens when 50th completes)
      for (let i = 0; i < 50; i++) {
        const toolCallId = `tc-${i}`;
        const subAgentId = `sa-${i}` as SubAgentId;
        subAgentsStreamStore.actions.recordStart(toolCallId, subAgentId, `Agent ${i}`);
        subAgentsStreamStore.actions.recordComplete(toolCallId, `Result ${i}`, { inputTokens: 10, outputTokens: 20 });
      }

      // After 50 completed: tc-0 evicted on last completion, leaving 49 completed
      expect(Object.keys(subAgentsStreamStore.state.byToolCall)).toHaveLength(49);

      // Add one more running - no eviction (running entries don't count in LRU)
      subAgentsStreamStore.actions.recordStart("tc-50", "sa-50" as SubAgentId, "Agent 50");

      // tc-0 should be evicted (evicted on tc-49 completion), tc-1 through tc-49 remain
      expect(subAgentsStreamStore.state.byToolCall["tc-0"]).toBeUndefined();
      expect(subAgentsStreamStore.state.byToolCall["tc-1"]).toBeDefined();

      // The new running entry should exist
      expect(subAgentsStreamStore.state.byToolCall["tc-50"]).toBeDefined();
      expect(subAgentsStreamStore.state.byToolCall["tc-50"]!.status).toBe("running");

      // Total: 49 completed + 1 running = 50
      expect(Object.keys(subAgentsStreamStore.state.byToolCall)).toHaveLength(50);
    });

    it("does not count running entries in LRU limit", () => {
      // Create 50 running entries
      for (let i = 0; i < 50; i++) {
        const toolCallId = `tc-running-${i}`;
        const subAgentId = `sa-${i}` as SubAgentId;
        subAgentsStreamStore.actions.recordStart(toolCallId, subAgentId, `Agent ${i}`);
      }

      expect(Object.keys(subAgentsStreamStore.state.byToolCall)).toHaveLength(50);

      // Add one more running - should not evict since they're all running
      subAgentsStreamStore.actions.recordStart("tc-running-50", "sa-50" as SubAgentId, "Agent 50");

      // All 51 should still be present
      expect(Object.keys(subAgentsStreamStore.state.byToolCall)).toHaveLength(51);
    });
  });
});
