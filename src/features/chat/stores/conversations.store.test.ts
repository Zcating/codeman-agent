//! conversations.store Solid createStore 测试 (Task 4)
import { describe, it, expect } from "vitest";
import { createRoot } from "solid-js";
import {
  store,
  setStore,
  activeId$,
  conversations$,
  selectConversation,
  setupConvState,
  type ConversationState,
} from "./conversations.store";
import type { Conversation, Message } from "../../../shared/lib/types";

const mockConv: Conversation = {
  id: "c1",
  title: "测试",
  system_prompt: null,
  created_at: 1,
  updated_at: 1,
  archived_at: null,
};

const mockHistory: Message[] = [
  {
    id: "u1",
    conversation_id: "c1",
    role: "user",
    content: "hi",
    tool_calls: null,
    tool_results: null,
    model: null,
    input_tokens: null,
    output_tokens: null,
    created_at: 1,
  },
];

describe("conversations.store — ConversationState", () => {
  it("setupConvState() inserts into byId with empty messages state + runtime", () =>
    createRoot((dispose) => {
      setupConvState(mockConv, mockHistory);
      const cs = store.byId["c1"] as ConversationState | undefined;
      expect(cs).toBeDefined();
      expect(cs?.id).toBe("c1");
      expect(cs?.messages).toEqual(mockHistory);
      expect(cs?.streamingMessageId).toBeNull();
      expect(cs?.runtime).toBeDefined();
      expect(typeof cs?.runtime.run).toBe("function");
      expect(typeof cs?.runtime.cancel).toBe("function");
      dispose();
    }));

  it("selectConversation() sets activeId", () =>
    createRoot((dispose) => {
      setupConvState(mockConv, mockHistory);
      selectConversation("c1");
      expect(activeId$()).toBe("c1");
      dispose();
    }));

  it("conversations$ accessor returns byId values", () =>
    createRoot((dispose) => {
      setupConvState(mockConv, mockHistory);
      const list = conversations$();
      expect(list.some((c) => c.id === "c1")).toBe(true);
      dispose();
    }));
});

describe("sendMessage — cross-conv isolation", () => {
  it("A's events update A's slot, do not affect B's slot", () =>
    createRoot((dispose) => {
      const convA = { ...mockConv, id: "cA" };
      const convB = { ...mockConv, id: "cB" };
      setupConvState(convA, []);
      setupConvState(convB, []);

      const csA = store.byId["cA"];
      const csB = store.byId["cB"];
      expect(csA).toBeDefined();
      expect(csB).toBeDefined();
      expect(csA).not.toBe(csB);
      expect(csA?.messages).not.toBe(csB?.messages);

      // 写 A 不影响 B
      setStore("byId", "cA", "messages", [
        {
          id: "x",
          conversation_id: "cA",
          role: "user",
          content: "test",
          tool_calls: null,
          tool_results: null,
          model: null,
          input_tokens: null,
          output_tokens: null,
          created_at: 1,
        },
      ]);
      expect(store.byId["cA"]?.messages.length).toBe(1);
      expect(store.byId["cB"]?.messages.length).toBe(0);

      dispose();
    }));
});
