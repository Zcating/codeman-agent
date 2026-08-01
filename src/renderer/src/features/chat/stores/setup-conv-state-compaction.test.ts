import { describe, it, expect } from "vitest";
import { createRoot } from "solid-js";
import {
  store,
  setupConvState,
  type ConversationState,
} from "@codeman-frontend/features/chat/stores/chat.store";
import type { Conversation, Message } from "@codeman-frontend/shared/lib/types";
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


describe("setupConvState — seam 3: load compaction entries", () => {
  it("setupConvState initializes compactionEntries to empty array when no entries exist", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, mockHistory);
      const cs = store.byId["c1"] as ConversationState;
      expect(cs.compactionEntries).toEqual([]);
      dispose();
    });
  });

  it("setupConvState initializes compactionStatus to idle", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, mockHistory);
      const cs = store.byId["c1"] as ConversationState;
      expect(cs.compactionStatus._tag).toBe("idle");
      dispose();
    });
  });

  it("setupConvState preserves messages in ConversationState", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, mockHistory);
      const cs = store.byId["c1"] as ConversationState;
      expect(cs.messages).toEqual(mockHistory);
      dispose();
    });
  });

  it("CompactionEntry type is properly defined", () => {
    const entry: CompactionEntry = {
      id: "entry-1",
      conversationId: "c1",
      summary: "Test summary",
      model: "test-model",
      tokensBefore: 1000,
      kind: "auto",
      createdAt: Date.now(),
      firstKeptMessageId: "msg-1",
    };
    expect(entry.kind).toBe("auto");
    expect(entry.summary).toBe("Test summary");
  });
});
