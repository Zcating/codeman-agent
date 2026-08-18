import type { Message, MessagePart } from "@codeman-frontend/shared/lib/types";

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateMessageTokens(m: Message): number {
  const parts = m.parts ?? [];
  return estimateParts(parts);
}

export function estimateParts(parts: readonly MessagePart[]): number {
  let chars = 0;
  for (const p of parts) {
    if (p.kind === "text") {
      chars += p.content.length;
    } else if (p.kind === "reasoning") {
      chars += p.content.length;
    } else if (p.kind === "tool") {
      chars += JSON.stringify(p.state).length;
    }
  }
  return Math.ceil(chars / 4);
}
