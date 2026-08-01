import { Effect, Context, Layer } from "effect";
import { invoke } from "./invoke.api";
import type { CompactionEntry } from "@codeman-frontend/shared/lib/types";
import type { AppError } from "@codeman-frontend/shared/lib/errors";

export class CompactionApi extends Context.Tag("CompactionApi")<
  CompactionApi,
  {
    readonly list: (conversationId: string) => Effect.Effect<CompactionEntry[], AppError>;
    readonly append: (entry: {
      conversationId?: string;
      summary: string;
      model: string;
      tokensBefore: number;
      kind: "auto" | "manual";
      firstKeptMessageId: string;
    }) => Effect.Effect<CompactionEntry, AppError>;
  }
>() {}

export const CompactionApiLive = Layer.succeed(CompactionApi, {
  list: (conversationId) =>
    invoke<CompactionEntry[]>("compactionList", { conversationId }),
  append: (entry) =>
    invoke<CompactionEntry>("compactionAppend", entry),
});
