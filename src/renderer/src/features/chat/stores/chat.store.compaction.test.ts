import { describe, it, expect } from "vitest";
import { createRoot } from "solid-js";
import {
  store,
  setupConvState,
  compactNow,
  type ConversationState,
} from "@codeman-frontend/features/chat/stores/chat.store";
import type { Conversation, Message } from "@codeman-frontend/shared/lib/types";
import type { RuntimeEvent } from "@codeman-frontend/features/chat/lib/runtime";
import type { CompactionEntry } from "@codeman-frontend/shared/lib/types";


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
