import { createStore } from "solid-js/store";
import type { SubAgentId } from "@codeman-frontend/shared/lib/sub-agent-schema";
import type { AgentEvent } from "@earendil-works/pi-agent-core";

const MAX_LRU_SIZE = 50;

export interface SubAgentStreamEntry {
  toolCallId: string;
  subAgentId: SubAgentId;
  subAgentName: string;
  events: AgentEvent[];
  status: "running" | "completed" | "error";
  startedAt: number;
  completedAt?: number;
  finalText?: string;
  error?: string;
  usage?: { inputTokens: number; outputTokens: number };
}

interface StreamState {
  byToolCall: Record<string, SubAgentStreamEntry>;
}

const [state, setState] = createStore<StreamState>({ byToolCall: {} });

function evictOldestCompleted(): void {
  const entries = Object.values(state.byToolCall);
  const completedEntries = entries
    .filter((e) => e.status === "completed")
    .sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0));

  if (completedEntries.length >= MAX_LRU_SIZE) {
    const toEvict = completedEntries[0];
    if (toEvict) {
      setState((s) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [toEvict.toolCallId]: _removed, ...remaining } = s.byToolCall;
        return { byToolCall: remaining };
      });
    }
  }
}

export const subAgentsStreamStore = {
  state,

  actions: {
    recordStart(toolCallId: string, subAgentId: SubAgentId, subAgentName: string): void {
      setState((s) => ({
        byToolCall: {
          ...s.byToolCall,
          [toolCallId]: {
            toolCallId,
            subAgentId,
            subAgentName,
            events: [],
            status: "running",
            startedAt: Date.now(),
          },
        },
      }));
    },

    appendEvent(toolCallId: string, event: AgentEvent): void {
      if (!state.byToolCall[toolCallId]) {return;}
      setState((s) => ({
        byToolCall: {
          ...s.byToolCall,
          [toolCallId]: {
            ...s.byToolCall[toolCallId],
            events: [...s.byToolCall[toolCallId].events, event],
          },
        },
      }));
    },

    recordComplete(
      toolCallId: string,
      finalText: string,
      usage?: { inputTokens: number; outputTokens: number },
    ): void {
      if (!state.byToolCall[toolCallId]) {return;}
      setState((s) => ({
        byToolCall: {
          ...s.byToolCall,
          [toolCallId]: {
            ...s.byToolCall[toolCallId],
            status: "completed",
            finalText,
            usage,
            completedAt: Date.now(),
          },
        },
      }));
      evictOldestCompleted();
    },

    recordError(toolCallId: string, error: string): void {
      if (!state.byToolCall[toolCallId]) {return;}
      setState((s) => ({
        byToolCall: {
          ...s.byToolCall,
          [toolCallId]: {
            ...s.byToolCall[toolCallId],
            status: "error",
            error,
            completedAt: Date.now(),
          },
        },
      }));
      evictOldestCompleted();
    },

    cleanup(toolCallId: string): void {
      setState((s) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [toolCallId]: _removed, ...remaining } = s.byToolCall;
        return { byToolCall: remaining };
      });
    },

    _resetForTest(): void {
      setState({ byToolCall: {} });
    },
  },
};
