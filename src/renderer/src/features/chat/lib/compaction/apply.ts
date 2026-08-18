import type { Message, MessagePart } from "@codeman-frontend/shared/lib/types";

export interface ApplyCompactionInput {
  readonly messages: readonly Message[];
  readonly summary: string;
  readonly tailStartId: string;
}

export function applyCompactionToContext(input: ApplyCompactionInput): readonly MessagePart[] {
  const { messages, summary, tailStartId } = input;
  if (messages.length === 0) return [];
  const idx = messages.findIndex((m) => m.id === tailStartId);
  if (idx === -1) return messages.flatMap((m) => m.parts ?? []);

  const summaryPart: MessagePart = {
    kind: "text",
    content: `[Previous conversation summary]\n\n${summary}`,
    synthetic: true,
  } as MessagePart;

  const tailParts: MessagePart[] = [];
  for (let i = idx; i < messages.length; i++) {
    const parts = messages[i]!.parts ?? [];
    for (const p of parts) {
      if (p.kind === "compaction") continue;
      tailParts.push(p);
    }
  }

  return [summaryPart, ...tailParts];
}
