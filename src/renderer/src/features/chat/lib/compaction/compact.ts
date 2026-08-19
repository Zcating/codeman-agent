import type { Message, MessagePart } from "@codeman-frontend/shared/lib/types";
import { selectTail, type SelectInput } from "./select";
import { buildPrompt, type BuildPromptInput } from "./build-prompt";
import { applyCompactionToContext } from "./apply";
import { estimateMessageTokens } from "./estimate";

export interface CompactOpts {
  readonly conversationId: string;
  readonly model: string;
  readonly messages: readonly Message[];
  readonly budget: number;
  readonly tailTurns: number;
  readonly previousSummary: string | null;
  readonly auto: boolean;
  readonly contextWindow: number;
  readonly reserveTokens: number;
}

export interface CompactResult {
  readonly summary: string;
  readonly tailStartId: string;
  readonly prunedCount: number;
  readonly freedTokens: number;
  readonly contextParts: readonly MessagePart[];
}

export interface CompactError {
  readonly reason: "threshold_not_met" | "no_provider" | "persist" | "stale_tail";
}

export interface DoCompactDeps {
  readonly callSummarize: (prompt: string) => Promise<{ ok: true; summary: string } | { ok: false; reason: string }>;
  readonly callSummarizeStream?: (prompt: string, onChunk: (chunk: string) => void) => Promise<{ ok: true; summary: string } | { ok: false; reason: string }>;
  readonly writeSuccessPair: (args: {
    conversationId: string;
    summary: string;
    tailStartId: string;
    model: string;
    tokensBefore: number;
    kind: "auto" | "manual";
  }) => Promise<void>;
  readonly writeStreamingSummary?: (args: { conversationId: string; delta: string; morph: boolean }) => void;
}

function findLastSummary(messages: readonly Message[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    if (msg.summary && msg.role === "assistant") {
      const parts = msg.parts ?? [];
      const summaryPart = parts.find((p) => p.kind === "text");
      if (summaryPart && summaryPart.kind === "text") {
        return summaryPart.content;
      }
    }
  }
  return null;
}

export async function doCompact(
  convId: string,
  opts: CompactOpts,
  deps: DoCompactDeps,
): Promise<CompactResult | CompactError> {
  const { messages, budget, tailTurns, auto, contextWindow, reserveTokens } = opts;

  if (auto) {
    const threshold = contextWindow - reserveTokens;
    const totalTokens = messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
    if (totalTokens < threshold) {
      return { reason: "threshold_not_met" };
    }
  }

  const selectInput: SelectInput = { messages, budget, tailTurns };
  const { tailStartId, freedTokens } = selectTail(selectInput);

  if (!tailStartId) {
    return { reason: "stale_tail" };
  }

  const previousSummary = findLastSummary(messages) ?? opts.previousSummary;

  const messagesToSummarize = messages.filter((m) => {
    const idx = messages.findIndex((msg) => msg.id === m.id);
    const tailIdx = messages.findIndex((msg) => msg.id === tailStartId);
    return idx >= tailIdx;
  });

  const buildPromptInput: BuildPromptInput = { previousSummary, messages: messagesToSummarize };
  const prompt = buildPrompt(buildPromptInput);

  let summarizeResult: { ok: true; summary: string } | { ok: false; reason: string };
  if (deps.callSummarizeStream && deps.writeStreamingSummary) {
    summarizeResult = await deps.callSummarizeStream(prompt, (delta) => {
      deps.writeStreamingSummary!({ conversationId: convId, delta, morph: true });
    });
  } else {
    summarizeResult = await deps.callSummarize(prompt);
  }
  if (!summarizeResult.ok) {
    return { reason: summarizeResult.reason as CompactError["reason"] };
  }

  const tokensBefore = messagesToSummarize.reduce((sum, m) => sum + estimateMessageTokens(m), 0);

  await deps.writeSuccessPair({
    conversationId: convId,
    summary: summarizeResult.summary,
    tailStartId,
    model: opts.model,
    tokensBefore,
    kind: auto ? "auto" : "manual",
  });

  const contextParts = applyCompactionToContext({ messages, summary: summarizeResult.summary, tailStartId });

  return {
    summary: summarizeResult.summary,
    tailStartId,
    prunedCount: 0,
    freedTokens,
    contextParts,
  };
}
