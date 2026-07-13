import type {
  Message as DbMessage,
  ToolCall as DbToolCall,
  ToolResult,
} from "../../../shared/lib/types";
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

/**
 * API identity used to synthesize required fields on `AssistantMessage`.
 * Both come from the runtime's `model` config (per-run, not closure).
 */
interface ModelIdentity {
  readonly api: string;
  readonly provider: ProviderId;
}

/**
 * Bridge from app DB `Message[]` (snake_case, flat) to pi-ai `Message[]`
 * (camelCase, Content[] blocks).
 *
 * Mapping decisions (ADR-0019 D2 + pi-ai version drift):
 * - UserMessage: `content` is always string (our DB doesn't support image blocks).
 * - AssistantMessage: `content[]` assembled from `content` (TextContent) +
 *   `thinking` (ThinkingContent, if non-null) + `toolCalls[]` (ToolCall blocks).
 *   `usage` synthesized from `inputTokens` / `outputTokens` → `input` / `output` /
 *   `totalTokens` (pi-ai's Usage schema uses input/output, not inputTokens/outputTokens);
 *   cache + cost = 0 (we don't store them). `stopReason` always "stop" (history only).
 *   `model` defaults to "unknown" when null. `api` / `provider` from caller.
 * - ToolResultMessage: one DB `toolResults[]` entry → one `ToolResultMessage`.
 *   `toolName` resolved by walking back to the most recent assistant's
 *   `toolCalls[]` (best-effort lookup); falls back to "" if orphan.
 * - System messages: skipped (system prompt lives in `Context.systemPrompt`,
 *   not in messages).
 *
 * Replaces the 2-hop `as unknown as PiMessage[]` cast at runtime.ts:281.
 */
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
        // System prompt lives in Context.systemPrompt, not messages.
        continue;
    }
  }

  return result;
}

function mapAssistant(m: DbMessage, model: ModelIdentity): AssistantMessage {
  const content: (TextContent | ThinkingContent | PiToolCall)[] = [];
  // Always emit text block (even if empty) — preserves original shape 1:1.
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