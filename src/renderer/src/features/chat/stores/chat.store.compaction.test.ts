import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "solid-js";
import { Effect, Layer, Context } from "effect";
import {
  store,
  setStore,
  setupConvState,
  compactNow,
  type ConversationState,
} from "@codeman-frontend/features/chat/stores/chat.store";
import type { Conversation, Message } from "@codeman-frontend/shared/lib/types";
import type { RuntimeEvent } from "@codeman-frontend/features/chat/lib/runtime";
import type { CompactionEntry } from "@codeman-frontend/shared/lib/types";

// @ts-ignore - Layer.succeed requires a Tag but Context.empty() is valid at runtime
const EmptyTestLayer = Layer.succeed(Context.empty() as any, {} as any);

// Shared mock fn instance — hoisted by vi.hoisted so it's ready before vi.mock factory runs
const mockPerformCompaction = vi.hoisted(() => vi.fn());

// Mock entries returned by CompactionApi.list via invoke
const mockCompactEntries: CompactionEntry[] = [
  {
    id: "entry-1",
    conversationId: "c1",
    summary: "Summary 1",
    model: "test-model",
    tokensBefore: 500,
    kind: "auto",
    createdAt: 10,
    firstKeptMessageId: "u1",
  },
  {
    id: "entry-2",
    conversationId: "c1",
    summary: "Summary 2",
    model: "test-model",
    tokensBefore: 1000,
    kind: "manual",
    createdAt: 20,
    firstKeptMessageId: "u2",
  },
];

vi.mock("@codeman-frontend/features/chat/lib/compaction", () => ({
  performCompaction: mockPerformCompaction,
  shouldTriggerAutoCompaction: vi.fn().mockReturnValue(false),
  CompactionFailed: class MockCompactionFailed {
    readonly _tag = "CompactionFailed";
    constructor(spec: { reason: string }) {
      this.reason = spec.reason;
    }
    readonly reason: string;
  },
  CompactionCancelled: class MockCompactionCancelled {
    readonly _tag = "CompactionCancelled";
  },
}));

// Mock invoke to return compaction entries so async loading works in tests
// invoke returns Effect<R, AppError>, so we use Effect.succeed to wrap the mock data
vi.mock("@codeman-frontend/shared/apis/invoke.api", async () => {
  const { Effect } = await import("effect");
  return {
    invoke: vi.fn().mockImplementation((method: string, args: { conversationId?: string }) => {
      if (method === "compactionList" && args?.conversationId === "c1") {
        return Effect.succeed(mockCompactEntries);
      }
      if (method === "compactionList") {
        return Effect.succeed([]);
      }
      return Effect.succeed({} as any);
    }),
  };
});


const mockConv: Conversation = {
  id: "c1",
  title: "测试",
  systemPrompt: null,
  workspaceId: "",
  createdAt: 1,
  updatedAt: 1,
  archivedAt: null,
};

const mockHistory: Message[] = [
  {
    id: "u1",
    conversationId: "c1",
    role: "user",
    content: "hi",
    thinking: null,
    toolCalls: null,
    toolResults: null,
    model: null,
    inputTokens: null,
    outputTokens: null,
    createdAt: 1,
  },
];


describe("compactNow — seam 1: manual entry point", () => {
  beforeEach(() => {
    mockPerformCompaction.mockClear();
  });

  afterEach(() => {
    mockPerformCompaction.mockReset();
  });

  it("compactNow is exported from chat.store", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, mockHistory);
      expect(typeof compactNow).toBe("function");
      dispose();
    });
  });

  it("ConversationState has compactionEntries field after setup", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, mockHistory);
      const cs = store.byId["c1"] as ConversationState;
      expect(cs).toBeDefined();
      expect(Array.isArray(cs.compactionEntries)).toBe(true);
      dispose();
    });
  });

  it("ConversationState has compactionStatus field after setup", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, mockHistory);
      const cs = store.byId["c1"] as ConversationState;
      expect(cs).toBeDefined();
      expect(cs.compactionStatus).toBeDefined();
      expect(cs.compactionStatus._tag).toBe("idle");
      dispose();
    });
  });

  it("compactNow with empty messages throws CompactionFailed(empty_context), performCompaction not called", async () => {
    await createRoot(async (dispose) => {
      // Directly set store state with EMPTY messages, bypassing IPC-dependent setupConvState
      setStore("byId", "c-empty", {
        id: "c-empty",
        title: "empty",
        systemPrompt: null,
        workspaceId: "",
        createdAt: 1,
        updatedAt: 1,
        archivedAt: null,
        messages: [], // EMPTY — triggers the guard
        streamingMessageId: null,
        isAgentActive: false,
        lastError: null,
        compactionEntries: [],
        compactionStatus: { _tag: "idle" },
        runtime: null as any,
      });

      // Follow the same pattern as perform.test.ts: use Effect.gen + Effect.exit
      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          return yield* Effect.exit(compactNow("c-empty"));
        }).pipe(Effect.provide(EmptyTestLayer)),
      );

      expect(result._tag).toBe("Success");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inner = (result as any).value;
      expect(inner._tag).toBe("Failure");
      // Thrown errors become Die cause (not Fail cause).
      // Die cause structure: { _tag: "Die", defect: CompactionFailed }
      const cause1: any = (inner as any).cause;
      const err = cause1?.defect;
      expect(err._tag).toBe("CompactionFailed");
      expect(err.reason).toBe("empty_context");

      // performCompaction must NOT have been called (guard throws before it)
      expect(mockPerformCompaction).not.toHaveBeenCalled();

      dispose();
    });
  });
});


describe("sendMessage auto-trigger — seam 2: auto-trigger on send", () => {
  it("ConversationState has compactionEntries array (initialized empty on setup)", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, mockHistory);
      const cs = store.byId["c1"] as ConversationState;
      expect(cs.compactionEntries).toEqual([]);
      dispose();
    });
  });

  it("compactionStatus is idle after setup", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, mockHistory);
      const cs = store.byId["c1"] as ConversationState;
      expect(cs.compactionStatus._tag).toBe("idle");
      dispose();
    });
  });
});


describe("RuntimeEvent bridging — seam 5: compactionStarted/Completed/Failed", () => {
  it("RuntimeEvent.compactionStarted is a valid discriminated union variant", () => {
    const evt: RuntimeEvent = { type: "compactionStarted" };
    expect(evt.type).toBe("compactionStarted");
  });

  it("RuntimeEvent.compactionCompleted carries entry field", () => {
    const entry: CompactionEntry = {
      id: "comp-1",
      conversationId: "c1",
      summary: "Test summary",
      model: "test-model",
      tokensBefore: 1000,
      kind: "auto",
      createdAt: Date.now(),
      firstKeptMessageId: "u1",
    };
    const evt: RuntimeEvent = { type: "compactionCompleted", entry };
    expect(evt.type).toBe("compactionCompleted");
    expect(evt.entry).toEqual(entry);
  });

  it("RuntimeEvent.compactionFailed carries reason field", () => {
    const evt: RuntimeEvent = { type: "compactionFailed", reason: "summarize" };
    expect(evt.type).toBe("compactionFailed");
    expect(evt.reason).toBe("summarize");
  });
});


describe("setupConvState async compaction loading — F8 regression", () => {
  it("compactionEntries starts empty synchronously (async load dispatched)", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, mockHistory);
      // Synchronously: entries should be empty (async loading dispatched but not yet complete)
      const cs = store.byId["c1"] as ConversationState;
      expect(cs.compactionEntries).toEqual([]);
      // compactionStatus should be idle (not "loading")
      expect(cs.compactionStatus._tag).toBe("idle");
      dispose();
    });
  });
});
