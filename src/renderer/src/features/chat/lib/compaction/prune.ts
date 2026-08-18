import type { Message, MessagePart } from "@codeman-frontend/shared/lib/types";
import { estimateMessageTokens } from "./estimate";

export const PRUNE_MINIMUM = 20_000;
export const PRUNE_PROTECT = 40_000;
export const PRUNE_PROTECTED_TOOLS = ["skill"] as const;

export interface PruneResult {
  readonly messages: readonly Message[];
  readonly prunedCount: number;
  readonly freedTokens: number;
}

function countTailTurns(messages: readonly Message[], fromIdx: number): number {
  let turns = 0;
  for (let i = fromIdx; i < messages.length; i++) {
    if (i > 0 && messages[i]!.role !== messages[i - 1]!.role) {
      turns++;
    }
  }
  return turns;
}

function isProtectedTool(part: MessagePart): boolean {
  if (part.kind !== "tool") return false;
  return PRUNE_PROTECTED_TOOLS.includes(part.name as (typeof PRUNE_PROTECTED_TOOLS)[number]);
}

export function pruneOldToolOutputs(messages: readonly Message[]): PruneResult {
  if (messages.length === 0) {
    return { messages: [], prunedCount: 0, freedTokens: 0 };
  }

  const totalTokens = messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
  if (totalTokens < PRUNE_MINIMUM) {
    return { messages, prunedCount: 0, freedTokens: 0 };
  }

  let pruneEndIdx = messages.length;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    const msgTokens = estimateMessageTokens(msg);

    if (msgTokens > PRUNE_PROTECT) {
      break;
    }

    const turnsFromEnd = countTailTurns(messages, i);
    if (turnsFromEnd >= 2) {
      break;
    }

    pruneEndIdx = i;
  }

  const prunedCount = messages.length - pruneEndIdx;
  let freedTokens = 0;

  const result: Message[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (i < pruneEndIdx) {
      const msg = messages[i]!;
      if (msg.parts) {
        const keptParts = msg.parts.filter((p) => p.kind === "compaction" || isProtectedTool(p));
        if (keptParts.length > 0) {
          const prunedParts = msg.parts.filter((p) => p.kind !== "compaction" && !isProtectedTool(p));
          freedTokens += prunedParts.reduce((_sum, p) => {
            if (p.kind === "tool") return JSON.stringify(p.state).length;
            return 0;
          }, 0);
          result.push({ ...msg, parts: keptParts });
        } else {
          result.push(msg);
        }
      } else {
        result.push(msg);
      }
    } else {
      freedTokens += estimateMessageTokens(messages[i]!);
      result.push(messages[i]!);
    }
  }

  return {
    messages: result,
    prunedCount,
    freedTokens: Math.ceil(freedTokens / 4),
  };
}
