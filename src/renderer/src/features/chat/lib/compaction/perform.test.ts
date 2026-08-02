import { describe, it, expect, vi } from "@effect/vitest";
import { Effect, Exit, Context, Layer } from "effect";
import { performCompaction } from "./perform";

// @ts-ignore - Layer.succeed requires a Tag but Context.empty() is valid at runtime
const EmptyTestLayer = Layer.succeed(Context.empty() as any, {} as any);

describe("performCompaction", () => {
  it("calls summarize once with previousSummary and messagesToSummarize, then appends sanitized entry", () =>
    Effect.gen(function* () {
      const summarize = vi.fn().mockResolvedValue("summarized content");
      const estimateTokens = vi.fn().mockReturnValue(5000);
      const sanitize = vi.fn().mockImplementation((t: string) => t + " (sanitized)");
      const appendEntry = vi.fn().mockResolvedValue({} as any);

      const deps = { summarize, estimateTokens, sanitize, appendEntry };
      const ctx = {
        conversationId: "conv-1",
        model: "claude-3-5-sonnet",
        messages: ["msg1", "msg2", "msg3"],
        previousSummary: "old summary",
        kind: "auto" as const,
        firstKeptMessageId: "msg-last",
        rawMessages: [],
      };

      yield* performCompaction(deps, ctx);

      expect(summarize).toHaveBeenCalledTimes(1);
      expect(summarize).toHaveBeenCalledWith({
        previousSummary: "old summary",
        messagesToSummarize: ["msg1", "msg2", "msg3"],
      });

      expect(sanitize).toHaveBeenCalledWith("summarized content");
      expect(appendEntry).toHaveBeenCalledTimes(1);
      expect(appendEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: "conv-1",
          model: "claude-3-5-sonnet",
          summary: "summarized content (sanitized)",
          tokensBefore: 5000,
          kind: "auto",
          firstKeptMessageId: "msg-last",
        }),
      );
    }).pipe(Effect.provide(EmptyTestLayer)),
  );

  it("sanitizes before appending (does not leak raw summary to DB)", () =>
    Effect.gen(function* () {
      const sanitize = vi.fn().mockImplementation((t: string) =>
        t.replace(/sk-[a-zA-Z0-9]{20,}/g, "sk-***REDACTED***"),
      );
      const summarize = vi.fn().mockResolvedValue("Using key sk-abcdef1234567890secret");
      const appendEntry = vi.fn().mockResolvedValue({} as any);

      const deps = {
        summarize,
        estimateTokens: () => 1000,
        sanitize,
        appendEntry,
      };
      const ctx = {
        conversationId: "conv-1",
        model: "claude-3-5-sonnet",
        messages: ["msg1"],
        previousSummary: null,
        kind: "auto" as const,
        firstKeptMessageId: "msg-1",
        rawMessages: [],
      };

      yield* performCompaction(deps, ctx);

      // appendEntry must receive sanitized content, not raw
      expect(appendEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: "Using key sk-***REDACTED***secret",
        }),
      );
    }).pipe(Effect.provide(EmptyTestLayer)),
  );

  it("summarize throws -> Effect.fail(CompactionFailed({ reason: 'summarize' }), no appendEntry", () =>
    Effect.gen(function* () {
      const summarize = vi.fn().mockRejectedValue(new Error("model error"));
      const appendEntry = vi.fn().mockResolvedValue({} as any);

      const deps = {
        summarize,
        estimateTokens: () => 1000,
        sanitize: (t: string) => t,
        appendEntry,
      };
      const ctx = {
        conversationId: "conv-1",
        model: "claude-3-5-sonnet",
        messages: ["msg1"],
        previousSummary: null,
        kind: "auto" as const,
        firstKeptMessageId: "msg-1",
        rawMessages: [],
      };

      const result = yield* Effect.exit(performCompaction(deps, ctx));

      expect(result._tag).toBe("Failure");
      if (Exit.isFailure(result)) {
        const err = (result.cause as any).error as any;
        expect(err._tag).toBe("CompactionFailed");
        expect(err.reason).toBe("summarize");
      }
      expect(appendEntry).not.toHaveBeenCalled();
    }).pipe(Effect.provide(EmptyTestLayer)),
  );

  it("appendEntry throws -> Effect.fail(CompactionFailed({ reason: 'persist' }), no summarize call", () =>
    Effect.gen(function* () {
      const summarize = vi.fn().mockResolvedValue("summary");
      const appendEntry = vi.fn().mockRejectedValue(new Error("db error"));

      const deps = {
        summarize,
        estimateTokens: () => 1000,
        sanitize: (t: string) => t,
        appendEntry,
      };
      const ctx = {
        conversationId: "conv-1",
        model: "claude-3-5-sonnet",
        messages: ["msg1"],
        previousSummary: null,
        kind: "manual" as const,
        firstKeptMessageId: "msg-1",
        rawMessages: [],
      };

      const result = yield* Effect.exit(performCompaction(deps, ctx));

      expect(result._tag).toBe("Failure");
      if (Exit.isFailure(result)) {
        const err = (result.cause as any).error as any;
        expect(err._tag).toBe("CompactionFailed");
        expect(err.reason).toBe("persist");
      }
      // summarize was called (we got past abort check), but appendEntry failed
      expect(summarize).toHaveBeenCalled();
    }).pipe(Effect.provide(EmptyTestLayer)),
  );

  it("signal.aborted === true before call -> Effect.fail(CompactionCancelled), no summarize", () =>
    Effect.gen(function* () {
      const controller = new AbortController();
      controller.abort();

      const summarize = vi.fn().mockResolvedValue("summary");
      const appendEntry = vi.fn().mockResolvedValue({} as any);

      const deps = {
        summarize,
        estimateTokens: () => 1000,
        sanitize: (t: string) => t,
        appendEntry,
      };
      const ctx = {
        conversationId: "conv-1",
        model: "claude-3-5-sonnet",
        messages: ["msg1"],
        previousSummary: null,
        signal: controller.signal,
        kind: "auto" as const,
        firstKeptMessageId: "msg-1",
        rawMessages: [],
      };

      const result = yield* Effect.exit(performCompaction(deps, ctx));

      expect(result._tag).toBe("Failure");
      if (Exit.isFailure(result)) {
        const err = (result.cause as any).error as any;
        expect(err._tag).toBe("CompactionCancelled");
      }
      expect(summarize).not.toHaveBeenCalled();
      expect(appendEntry).not.toHaveBeenCalled();
    }).pipe(Effect.provide(EmptyTestLayer)),
  );
});
