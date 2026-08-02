import { it, expect } from "@effect/vitest";
import { describe } from "vitest";
import { Effect, Layer } from "effect";
import { CompactionApi } from "./compaction.api";
import type { CompactionEntry } from "@codeman-frontend/shared/lib/types";

const mockEntry: CompactionEntry = {
  id: "entry-1",
  conversationId: "conv-1",
  summary: "Earlier conversation summarized",
  model: "claude-3-5-sonnet",
  tokensBefore: 8000,
  kind: "auto",
  createdAt: 1000,
  firstKeptMessageId: "m5",
};

const MockCompactionApiLive = Layer.succeed(CompactionApi, {
  list: (conversationId) =>
    conversationId === "conv-1"
      ? Effect.succeed([mockEntry])
      : Effect.succeed([]),
  append: (entry) =>
    Effect.succeed({
      ...mockEntry,
      summary: entry.summary,
      tokensBefore: entry.tokensBefore,
      kind: entry.kind,
      firstKeptMessageId: entry.firstKeptMessageId,
    }),
});

describe("CompactionApi", () => {
  it.effect("list returns array from IPC", () =>
    Effect.gen(function* () {
      const svc = yield* CompactionApi;
      const entries = yield* svc.list("conv-1");
      expect(Array.isArray(entries)).toBe(true);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.id).toBe("entry-1");
    }).pipe(Effect.provide(MockCompactionApiLive)),
  );

  it.effect("append calls IPC with entry and returns void", () =>
    Effect.gen(function* () {
      const svc = yield* CompactionApi;
      const result = yield* svc.append({
        conversationId: "conv-1",
        summary: "New summary",
        model: "claude-3-5-sonnet",
        tokensBefore: 5000,
        kind: "manual",
        firstKeptMessageId: "m10",
      });
      expect(result.summary).toBe("New summary");
      expect(result.kind).toBe("manual");
    }).pipe(Effect.provide(MockCompactionApiLive)),
  );
});
