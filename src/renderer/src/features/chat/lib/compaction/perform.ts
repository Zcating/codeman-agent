import { Effect } from "effect";
import type { PerformCompactionDeps, PerformCompactionCtx } from "./types";
import { CompactionFailed, CompactionCancelled } from "./errors";
import type { CompactionEntry } from "./types";

export function performCompaction(
  deps: PerformCompactionDeps,
  ctx: PerformCompactionCtx,
): Effect.Effect<CompactionEntry, CompactionFailed | CompactionCancelled> {
  return Effect.gen(function* () {
    // Check abort signal before starting
    if (ctx.signal?.aborted) {
      return yield* Effect.fail(new CompactionCancelled());
    }

    const rawSummary = yield* Effect.tryPromise({
      try: () =>
        deps.summarize({
          previousSummary: ctx.previousSummary,
          messagesToSummarize: ctx.messages,
        }),
      catch: () => new CompactionFailed({ reason: "summarize" }),
    });

    const sanitizedSummary = deps.sanitize(rawSummary);
    const tokensBefore = deps.estimateTokens(ctx.messages.join("\n"));

    const entry = yield* Effect.tryPromise({
      try: () =>
        deps.appendEntry({
          conversationId: ctx.conversationId,
          summary: sanitizedSummary,
          model: ctx.model,
          tokensBefore,
          kind: ctx.kind,
          firstKeptMessageId: ctx.firstKeptMessageId,
        }),
      catch: () => new CompactionFailed({ reason: "persist" }),
    });

    return entry;
  });
}
