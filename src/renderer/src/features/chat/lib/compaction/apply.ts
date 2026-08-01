import { Effect } from "effect";
import type { CompactionEntry } from "./types";
import type { Message } from "@codeman-frontend/shared/lib/types";
import { CompactionFailed } from "./errors";

export function applyCompactionToContext(params: {
  entries: CompactionEntry[];
  agentMessages: Message[];
}): Effect.Effect<Message[], CompactionFailed> {
  const { entries, agentMessages } = params;

  if (entries.length === 0) {
    return Effect.succeed([...agentMessages]);
  }

  // Sort entries by createdAt ASC and take the last one (latest)
  const sorted = [...entries].sort((a, b) => a.createdAt - b.createdAt);
  const latest = sorted[sorted.length - 1]!;

  // Build synthetic summary message
  const summaryMsg: Message = {
    id: `compaction-${latest.id}`,
    conversationId: latest.conversationId,
    role: "system",
    content: latest.summary,
    thinking: null,
    toolCalls: null,
    toolResults: null,
    model: latest.model,
    inputTokens: null,
    outputTokens: null,
    createdAt: latest.createdAt,
  };

  // Find index of firstKeptMessageId
  const keptIdx = agentMessages.findIndex(
    (m) => m.id === latest.firstKeptMessageId,
  );

  if (keptIdx === -1) {
    return Effect.fail(new CompactionFailed({ reason: "stale_entry" }));
  }

  return Effect.succeed([summaryMsg, ...agentMessages.slice(keptIdx)]);
}
