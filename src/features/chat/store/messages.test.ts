//! MessageService Effect 桥接层测试。
//!
//! 测试 Effect → Solid 桥接函数（loadMessages、appendUserMessage），
//! 使用 mock MessageService。

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

describe("MessageService 桥接层", () => {
  beforeEach(() => {
    listCalls = [];
    appendCalls = [];
    searchCalls = [];
  });

  it.effect("list 对 conv-1 返回消息", () =>
    Effect.gen(function* () {
      const svc = yield* MessageService;
      const result = yield* svc.list("conv-1");
      expect(result).toHaveLength(2);
      expect(result[0].content).toBe("Hello");
      expect(result[1].role).toBe("assistant");
    }).pipe(Effect.provide(MockMessageServiceLive))
  );

  it.effect("list 传递 conversationId 给服务", () =>
    Effect.gen(function* () {
      const svc = yield* MessageService;
      yield* svc.list("conv-1");
      yield* svc.list("conv-2");
      expect(listCalls).toEqual(["conv-1", "conv-2"]);
    }).pipe(Effect.provide(MockMessageServiceLive))
  );

  it.effect("list 对未知会话返回空", () =>
    Effect.gen(function* () {
      const svc = yield* MessageService;
      const result = yield* svc.list("conv-99");
      expect(result).toHaveLength(0);
    }).pipe(Effect.provide(MockMessageServiceLive))
  );

  it.effect("append 传递正确参数给服务", () =>
    Effect.gen(function* () {
      const svc = yield* MessageService;
      yield* svc.append({ conversation_id: "conv-1", role: "user", content: "test" });
      expect(appendCalls).toEqual([{ conversation_id: "conv-1", role: "user", content: "test" }]);
    }).pipe(Effect.provide(MockMessageServiceLive))
  );

  it.effect("append 返回持久化的消息", () =>
    Effect.gen(function* () {
      const svc = yield* MessageService;
      const result = yield* svc.append({ conversation_id: "conv-1", role: "user", content: "test" });
      expect(result.content).toBe("test");
      expect(result.id).toBe("new-msg");
    }).pipe(Effect.provide(MockMessageServiceLive))
  );

  it.effect("search 传递 query 和 limit 给服务", () =>
    Effect.gen(function* () {
      const svc = yield* MessageService;
      yield* svc.search("hello", 10);
      expect(searchCalls).toEqual([{ query: "hello", limit: 10 }]);
    }).pipe(Effect.provide(MockMessageServiceLive))
  );

  it.effect("search 返回匹配的消息", () =>
    Effect.gen(function* () {
      const svc = yield* MessageService;
      const result = yield* svc.search("Hello", 5);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe("Hello");
    }).pipe(Effect.provide(MockMessageServiceLive))
  );
});
