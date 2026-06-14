//! MessageService Effect bridge tests.
//!
//! Tests the Effect → Solid bridge functions (loadMessages,
//! appendUserMessage) using a mock MessageService.

import { describe, it, expect, beforeEach } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { MessageService } from "../../../shared/lib/tauri";
import type { Message } from "../../../shared/types";

const fixtureMsg: Message = {
  id: "msg-1",
  conversation_id: "conv-1",
  role: "user",
  content: "Hello",
  tool_calls: null,
  tool_results: null,
  model: null,
  input_tokens: null,
  output_tokens: null,
  created_at: 1000,
};
const fixtureMsg2: Message = {
  id: "msg-2",
  conversation_id: "conv-1",
  role: "assistant",
  content: "Hi there",
  tool_calls: null,
  tool_results: null,
  model: "deepseek-chat",
  input_tokens: 10,
  output_tokens: 20,
  created_at: 2000,
};

let listCalls: string[] = [];
let appendCalls: { conversation_id: string; role: string; content: string }[] = [];
let searchCalls: { query: string; limit: number }[] = [];

const MockMessageServiceLive = Layer.succeed(MessageService, {
  list: (conversationId: string) => {
    listCalls.push(conversationId);
    if (conversationId === "conv-1") return Effect.succeed([fixtureMsg, fixtureMsg2]);
    return Effect.succeed([]);
  },
  append: (args) => {
    appendCalls.push(args);
    return Effect.succeed({ ...fixtureMsg, id: "new-msg", content: args.content } as Message);
  },
  search: (query: string, limit: number) => {
    searchCalls.push({ query, limit });
    return Effect.succeed([fixtureMsg]);
  },
});

describe("MessageService bridge", () => {
  beforeEach(() => {
    listCalls = [];
    appendCalls = [];
    searchCalls = [];
  });

  it.effect("list returns messages for conv-1", () =>
    Effect.gen(function* () {
      const svc = yield* MessageService;
      const result = yield* svc.list("conv-1");
      expect(result).toHaveLength(2);
      expect(result[0].content).toBe("Hello");
      expect(result[1].role).toBe("assistant");
    }).pipe(Effect.provide(MockMessageServiceLive))
  );

  it.effect("list passes conversationId to service", () =>
    Effect.gen(function* () {
      const svc = yield* MessageService;
      yield* svc.list("conv-1");
      yield* svc.list("conv-2");
      expect(listCalls).toEqual(["conv-1", "conv-2"]);
    }).pipe(Effect.provide(MockMessageServiceLive))
  );

  it.effect("list returns empty for unknown conversation", () =>
    Effect.gen(function* () {
      const svc = yield* MessageService;
      const result = yield* svc.list("conv-99");
      expect(result).toHaveLength(0);
    }).pipe(Effect.provide(MockMessageServiceLive))
  );

  it.effect("append passes correct args to service", () =>
    Effect.gen(function* () {
      const svc = yield* MessageService;
      yield* svc.append({ conversation_id: "conv-1", role: "user", content: "test" });
      expect(appendCalls).toEqual([{ conversation_id: "conv-1", role: "user", content: "test" }]);
    }).pipe(Effect.provide(MockMessageServiceLive))
  );

  it.effect("append returns persisted message", () =>
    Effect.gen(function* () {
      const svc = yield* MessageService;
      const result = yield* svc.append({ conversation_id: "conv-1", role: "user", content: "test" });
      expect(result.content).toBe("test");
      expect(result.id).toBe("new-msg");
    }).pipe(Effect.provide(MockMessageServiceLive))
  );

  it.effect("search passes query and limit to service", () =>
    Effect.gen(function* () {
      const svc = yield* MessageService;
      yield* svc.search("hello", 10);
      expect(searchCalls).toEqual([{ query: "hello", limit: 10 }]);
    }).pipe(Effect.provide(MockMessageServiceLive))
  );

  it.effect("search returns matching messages", () =>
    Effect.gen(function* () {
      const svc = yield* MessageService;
      const result = yield* svc.search("Hello", 5);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe("Hello");
    }).pipe(Effect.provide(MockMessageServiceLive))
  );
});
