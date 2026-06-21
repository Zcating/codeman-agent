//! MessageService Effect 桥接层测试。
//!
//! 测试 Effect → Solid 桥接函数（loadMessages、appendUserMessage、persistAssistantMessage），
//! 使用 mock MessageService + IPC mockState。

import { describe, it, expect, beforeEach } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { MessageService } from "../../../shared/lib/tauri";
import { mockState } from "../../../__mocks__/@tauri-apps/api/core";
import type { Message } from "../../../shared/lib/types";
import {
  persistAssistantMessage,
  clearMessages,
  messages$,
  appendStreamingAssistantMessage,
} from "./messages";

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
let appendCalls: { conversationId: string; role: string; content: string }[] = [];
let searchCalls: { query: string; limit: number }[] = [];

const MockMessageServiceLive = Layer.succeed(MessageService, {
  list: (conversationId: string) => {
    listCalls.push(conversationId);
    if (conversationId === "conv-1") {
      return Effect.succeed([fixtureMsg, fixtureMsg2]);
    }
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
    }).pipe(Effect.provide(MockMessageServiceLive)),
  );

  it.effect("list 传递 conversationId 给服务", () =>
    Effect.gen(function* () {
      const svc = yield* MessageService;
      yield* svc.list("conv-1");
      yield* svc.list("conv-2");
      expect(listCalls).toEqual(["conv-1", "conv-2"]);
    }).pipe(Effect.provide(MockMessageServiceLive)),
  );

  it.effect("list 对未知会话返回空", () =>
    Effect.gen(function* () {
      const svc = yield* MessageService;
      const result = yield* svc.list("conv-99");
      expect(result).toHaveLength(0);
    }).pipe(Effect.provide(MockMessageServiceLive)),
  );

  it.effect("append 传递正确参数给服务", () =>
    Effect.gen(function* () {
      const svc = yield* MessageService;
      yield* svc.append({ conversationId: "conv-1", role: "user", content: "test" });
      expect(appendCalls).toEqual([{ conversationId: "conv-1", role: "user", content: "test" }]);
    }).pipe(Effect.provide(MockMessageServiceLive)),
  );

  it.effect("append 返回持久化的消息", () =>
    Effect.gen(function* () {
      const svc = yield* MessageService;
      const result = yield* svc.append({
        conversationId: "conv-1",
        role: "user",
        content: "test",
      });
      expect(result.content).toBe("test");
      expect(result.id).toBe("new-msg");
    }).pipe(Effect.provide(MockMessageServiceLive)),
  );

  it.effect("search 传递 query 和 limit 给服务", () =>
    Effect.gen(function* () {
      const svc = yield* MessageService;
      yield* svc.search("hello", 10);
      expect(searchCalls).toEqual([{ query: "hello", limit: 10 }]);
    }).pipe(Effect.provide(MockMessageServiceLive)),
  );

  it.effect("search 返回匹配的消息", () =>
    Effect.gen(function* () {
      const svc = yield* MessageService;
      const result = yield* svc.search("Hello", 5);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe("Hello");
    }).pipe(Effect.provide(MockMessageServiceLive)),
  );
});

// ─────────────────────────────────────────────────────────────────────
// TDD for "切换对话后 AI 输出消失" 修复
//
// 根因：assistant 消息从未落库 — `finalizeAssistantMessage` 只更新 signal
// (in-memory)，切换对话后 signal 被覆盖，重载时 DB 无记录，UI 显示空白。
//
// 修复：新增 `persistAssistantMessage` 桥接函数，在流式 `done` 事件触发时
// 把最终 assistant 消息写进 DB。切换对话后再切回，DB 重载能恢复 AI 输出。
//
// 测试分两组（不混入既有 service-level 描述，IPC mock 单独管状态）：
// - 成功路径：append_message IPC 触发、args 正确、signal 替换为持久化版本
// - 失败路径：DB 失败时 signal 不被破坏（保留流式 stub 给用户）
// ─────────────────────────────────────────────────────────────────────

describe("persistAssistantMessage 桥接（流式 done → DB 持久化）", () => {
  // 流式 assistant 消息 stub：chat-view 在 done 事件里把它传给本函数。
  // id 是 stub 的 in-memory id，持久化后会被服务端 id 替换。
  const assistantStub: Message = {
    id: "stub-1",
    conversation_id: "conv-1",
    role: "assistant",
    content: "Hello world",
    tool_calls: null,
    tool_results: null,
    model: "minimax-chat",
    input_tokens: 10,
    output_tokens: 20,
    created_at: 5000,
  };

  // 服务端落库后返回的最终 message（id / created_at 跟 stub 不同）。
  const persistedMsg: Message = {
    ...assistantStub,
    id: "server-msg-id-1",
    created_at: 6000,
  };

  beforeEach(() => {
    // IPC mock 状态重置 — 避免上一个测试残留污染本测试的 calls / callArgs。
    mockState.calls = [];
    mockState.callArgs = [];
    mockState.rejected = undefined;
    mockState.resolved = undefined;
    // signal 重置 — messages.ts 模块级 single global 会被前一个测试污染。
    clearMessages();
  });

  it("调 IPC append_message 把 assistant 消息落库", async () => {
    mockState.resolved = persistedMsg;

    await persistAssistantMessage(assistantStub);

    // 触发了 DB 写入 — 这是修复的核心行为。
    expect(mockState.calls).toContain("append_message");
  });

  it("传给 IPC 的 args 包含 assistant 消息的关键字段", async () => {
    mockState.resolved = persistedMsg;

    await persistAssistantMessage(assistantStub);

    // 桥接层必须把 message 字段正确映射到 IPC args,否则后端存错。
    // 重点:tool_calls / tool_results 是 JSON 字符串(per tauri.ts append 契约),
    // null 字段不传(null 在 JSON 里是合法值,不是 undefined 的"无")。
    const appendCall = mockState.callArgs.find((c) => c.name === "append_message");
    expect(appendCall).toBeDefined();
    expect(appendCall?.args).toEqual({
      conversationId: "conv-1",
      role: "assistant",
      content: "Hello world",
      model: "minimax-chat",
      inputTokens: 10,
      outputTokens: 20,
    });
  });

  it("成功后用持久化版本替换 signal 中的 stub", async () => {
    mockState.resolved = persistedMsg;
    // 模拟"流式 stub 已在 signal 中"的场景:appendStreamingAssistantMessage 往
    // signal 推一条同 id 的 stub,然后 persistAssistantMessage 用持久化版本替换。
    appendStreamingAssistantMessage("stub-1", "conv-1");
    expect(messages$()).toHaveLength(1);
    expect(messages$()[0].id).toBe("stub-1");
    expect(messages$()[0].content).toBe(""); // stub 初始 content 为空

    await persistAssistantMessage(assistantStub);

    // 持久化版本替换 stub:same id 找到并替换;id 仍是 "stub-1"(因为我们用同 id
    // 触发 map 命中),但 content 应反映持久化返回的 assistantStub.content。
    // 实际更深层的语义是:持久化 message 的 id 是服务端 id,跟 stub 不同。
    // 这里我们传 assistantStub(id="stub-1"),返回的 persistedMsg 是另一个对象
    // 引用,但 update 走 m.id === message.id → 命中 stub,替换为 persistedMsg。
    expect(messages$()).toHaveLength(1);
    // 替换后,该位置的消息是 persistedMsg(id="server-msg-id-1")
    expect(messages$()[0].id).toBe("server-msg-id-1");
    expect(messages$()[0].content).toBe("Hello world");
    expect(messages$()[0].model).toBe("minimax-chat");
  });

  it("失败时 signal 不被破坏（保留流式 stub）", async () => {
    // 模拟流式 stub 已在 signal 中的场景
    appendStreamingAssistantMessage("stub-1", "conv-1");
    const beforeFailure = messages$();
    expect(beforeFailure).toHaveLength(1);
    expect(beforeFailure[0].id).toBe("stub-1");

    // 模拟 DB 写入失败
    mockState.rejected = new Error("DB write failed");

    await persistAssistantMessage(assistantStub);

    // signal 必须保持不变 — 用户仍能看到流式 stub,而不是消失或被错误替换。
    expect(messages$()).toEqual(beforeFailure);
    expect(messages$()).toHaveLength(1);
    expect(messages$()[0].id).toBe("stub-1");
  });
});
