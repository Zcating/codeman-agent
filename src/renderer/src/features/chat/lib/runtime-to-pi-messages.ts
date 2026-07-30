import type {
  Message as DbMessage,
  ToolCall as DbToolCall,
  ToolResult,
} from "@codeman-frontend/shared/lib/types";
import type {
  AssistantMessage,
  Message as PiMessage,
  ProviderId,
  TextContent,
  ThinkingContent,
  ToolCall as PiToolCall,
  ToolResultMessage,
  Usage,
} from "@earendil-works/pi-ai";

interface ModelIdentity {
  readonly api: string;
  readonly provider: ProviderId;
}

export function toPiMessages(
  messages: DbMessage[],
  model: ModelIdentity,
): PiMessage[] {
  const result: PiMessage[] = [];
  let lastAssistantToolCalls: DbToolCall[] = [];

  for (const m of messages) {
    switch (m.role) {
      case "user":
        result.push({
          role: "user",
          content: m.content,
          timestamp: m.createdAt,
        });
        break;

      case "assistant":
        result.push(mapAssistant(m, model));
        if (m.toolResults && m.toolResults.length > 0) {
          for (const tr of m.toolResults) {
            result.push(mapToolResult(m, tr, m.toolCalls ?? []));
          }
        }
        lastAssistantToolCalls = m.toolCalls ?? [];
        break;

case "tool":
                if (!m.toolResults) {
                    continue;
                }
                for (const tr of m.toolResults) {
                    result.push(mapToolResult(m, tr, lastAssistantToolCalls));
                }
                break;

      case "system":
        continue;
    }
  }

  return result;
}

function mapAssistant(m: DbMessage, model: ModelIdentity): AssistantMessage {
  const content: (TextContent | ThinkingContent | PiToolCall)[] = [];
  content.push({ type: "text", text: m.content });
  if (m.thinking) {
    content.push({ type: "thinking", thinking: m.thinking });
  }
  for (const tc of m.toolCalls ?? []) {
    content.push({
      type: "toolCall",
      id: tc.id,
      name: tc.name,
      arguments: tc.args,
    });
  }

  return {
    role: "assistant",
    content,
    api: model.api as AssistantMessage["api"],
    provider: model.provider,
    model: m.model ?? "unknown",
    usage: synthesizeUsage(m),
    stopReason: "stop",
    timestamp: m.createdAt,
  };
}

function mapToolResult(
  m: DbMessage,
  tr: ToolResult,
  lastAssistantToolCalls: DbToolCall[],
): ToolResultMessage {
  const toolName =
    lastAssistantToolCalls.find((tc) => tc.id === tr.toolCallId)?.name ?? "";

  let content: TextContent[];
  if (tr.error !== null) {
    content = [{ type: "text", text: `Error: ${tr.error}` }];
  } else {
    const text =
      typeof tr.result === "string" ? tr.result : JSON.stringify(tr.result);
    content = [{ type: "text", text }];
  }

  return {
    role: "toolResult",
    toolCallId: tr.toolCallId,
    toolName,
    content,
    isError: tr.error !== null,
    timestamp: m.createdAt,
  };
}

function synthesizeUsage(m: DbMessage): Usage {
  const input = m.inputTokens ?? 0;
  const output = m.outputTokens ?? 0;
  return {
    input,
    output,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: input + output,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}