import type { Message } from "@codeman-frontend/shared/lib/types";
import { estimateMessageTokens } from "./estimate";

export interface SelectInput {
  readonly messages: readonly Message[];
  readonly budget: number;
  readonly tailTurns: number;
}

export interface SelectOutput {
  readonly tailStartId: string;
  readonly freedTokens: number;
}

function isCompactionPart(msg: Message): boolean {
  const parts = msg.parts ?? [];
  return parts.some((p) => p.kind === "compaction");
}

function findTurnStart(messages: readonly Message[], fromIdx: number, tailTurns: number): string {
  let turnCount = 0;
  let idx = fromIdx;

  while (idx > 0 && turnCount < tailTurns) {
    const currentMsg = messages[idx]!;
    const prevMsg = messages[idx - 1];

    if (prevMsg && prevMsg.role !== currentMsg.role) {
      if (currentMsg.role === "user" && isCompactionPart(currentMsg)) {
        idx--;
        continue;
      }
      turnCount++;
    }
    idx--;
  }

  return messages[idx]?.id ?? messages[0]!.id;
}

export function selectTail(input: SelectInput): SelectOutput {
  const { messages, budget, tailTurns } = input;
  if (messages.length === 0) {
    return { tailStartId: "", freedTokens: 0 };
  }

  let totalTokens = 0;
  let tailStartIdx = messages.length;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    const tokens = estimateMessageTokens(msg);
    totalTokens += tokens;

    if (totalTokens > budget) {
      tailStartIdx = i + 1;
      break;
    }
  }

  if (tailStartIdx === messages.length) {
    return { tailStartId: messages[0]!.id, freedTokens: 0 };
  }

  const turnStartIdx = Math.max(0, tailStartIdx - 1);
  const tailStartId = findTurnStart(messages, turnStartIdx, tailTurns);

  const freedTokens = totalTokens - (messages.slice(tailStartIdx).reduce((sum, m) => sum + estimateMessageTokens(m), 0));

  return { tailStartId, freedTokens };
}
