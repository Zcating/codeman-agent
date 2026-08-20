import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

export type RuntimeEvent =
  | { type: "token"; content: string }
  | { type: "tool_call"; name: string; input: unknown }
  | { type: "tool_result"; name: string; result: unknown }
  | { type: "done" }
  | { type: "error"; message: string };

export function isRuntimeEvent(event: unknown): event is RuntimeEvent {
  if (event === null || typeof event !== "object") { return false; }
  const e = event as Record<string, unknown>;
  return (
    e.type === "token" ||
    e.type === "tool_call" ||
    e.type === "tool_result" ||
    e.type === "done" ||
    e.type === "error"
  );
}

export function agentSessionEventToRuntimeEvent(event: AgentSessionEvent): RuntimeEvent | null {
  switch (event.type) {
    case "message_update": {
      const assistantEvent = event.assistantMessageEvent;
      if (assistantEvent.type === "text_delta") {
        return { type: "token", content: assistantEvent.delta };
      }
      return null;
    }
    case "tool_execution_start":
      return { type: "tool_call", name: event.toolName, input: event.args };
    case "tool_execution_end":
      return { type: "tool_result", name: event.toolName, result: event.result };
    case "agent_settled":
    case "agent_end":
      return { type: "done" };
    default:
      return null;
  }
}
