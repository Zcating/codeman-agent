import type { Message } from "@codeman-frontend/shared/lib/types";

export interface BuildPromptInput {
  readonly previousSummary: string | null;
  readonly messages: readonly Message[];
}

function formatMessage(m: Message): string {
  const parts = m.parts ?? [];
  const content = parts.map((p) => {
    if (p.kind === "text") return p.content;
    if (p.kind === "reasoning") return `[reasoning] ${p.content}`;
    if (p.kind === "tool") return `[tool: ${p.name}]`;
    if (p.kind === "compaction") return `[compaction summary]`;
    return "";
  }).filter(Boolean).join("\n") || m.content;

  return `${m.role}: ${content}`;
}

export function buildPrompt(input: BuildPromptInput): string {
  const { previousSummary, messages } = input;

  const lines: string[] = [];

  if (previousSummary) {
    lines.push("## Previous Summary");
    lines.push(previousSummary);
    lines.push("");
  }

  lines.push("## Conversation to Summarize");
  for (const msg of messages) {
    lines.push(formatMessage(msg));
    lines.push("");
  }

  lines.push("## Task");
  lines.push("Summarize the conversation above into a concise summary that preserves key information, decisions, and context. The summary will be used to continue the conversation later.");

  return lines.join("\n");
}
