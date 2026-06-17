//! ConversationService Effect 桥接层测试。
//!
//! 测试 Effect → Solid 桥接函数（loadConversations、createConversation、selectConversation），
//! 使用 mock ConversationService。

import { describe, it, expect, beforeEach } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { ConversationService } from "../../../shared/lib/tauri";
import type { AppError, Conversation, Message } from "../../../shared/lib/types";
import {
  shouldSkipNewConversation,
  startNewConversation,
  selectConversation,
} from "./conversations";
import { clearMessages } from "./messages";
import { mockState } from "../../../__mocks__/@tauri-apps/api/core";

// 测试 fixture
const fixtureA: Conversation = {
  id: "conv-a",
  title: "Conversation A",
  system_prompt: null,
  created_at: 1000,
  updated_at: 1000,
  archived_at: null,
};
const fixtureB: Conversation = {
  id: "conv-b",
  title: "Conversation B",
  system_prompt: "custom prompt",
  created_at: 2000,
  updated_at: 2000,
  archived_at: null,
};

// Mutable state 用于跟踪调用
let listCalls: boolean[] = [];
let getCalls: string[] = [];
let createCalls: { title: string; systemPrompt?: string }[] = [];
let archiveCalls: string[] = [];
let deleteCalls: string[] = [];

const MockConversationServiceLive = Layer.succeed(ConversationService, {
  list: (includeArchived: boolean) => {
    listCalls.push(includeArchived);
    return Effect.succeed([fixtureA, fixtureB]);
  },
  get: (id: string) => {
    getCalls.push(id);
    if (id === fixtureA.id) return Effect.succeed(fixtureA);
    return Effect.fail({ kind: "NotFound" as const, message: `not found: ${id}` } as AppError);
  },
  create: (title: string, systemPrompt?: string) => {
    createCalls.push({ title, systemPrompt });
    return Effect.succeed({ ...fixtureA, id: "new-conv", title });
  },
  archive: (id: string) => {
    archiveCalls.push(id);
    return Effect.succeed(undefined);
  },
  delete: (id: string) => {
    deleteCalls.push(id);
    return Effect.succeed(undefined);
  },
});

describe("ConversationService 桥接层", () => {
  beforeEach(() => {
    listCalls = [];
    getCalls = [];
    createCalls = [];
    archiveCalls = [];
    deleteCalls = [];
  });

  it.effect("list 返回会话数组", () =>
    Effect.gen(function* () {
      const svc = yield* ConversationService;
      const result = yield* svc.list(false);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("conv-a");
      expect(result[1].id).toBe("conv-b");
    }).pipe(Effect.provide(MockConversationServiceLive)),
  );

  it.effect("list 传递 includeArchived 标志", () =>
    Effect.gen(function* () {
      const svc = yield* ConversationService;
      yield* svc.list(true);
      expect(listCalls).toContain(true);
      yield* svc.list(false);
      expect(listCalls).toContain(false);
    }).pipe(Effect.provide(MockConversationServiceLive)),
  );

  it.effect("get 对已知 id 返回 fixture", () =>
    Effect.gen(function* () {
      const svc = yield* ConversationService;
      const result = yield* svc.get(fixtureA.id);
      expect(result.id).toBe("conv-a");
    }).pipe(Effect.provide(MockConversationServiceLive)),
  );

  it.effect("get 对未知 id 失败", () =>
    Effect.gen(function* () {
      const svc = yield* ConversationService;
      const result = yield* Effect.exit(svc.get("unknown-id"));
      expect(result._tag).toBe("Failure");
    }).pipe(Effect.provide(MockConversationServiceLive)),
  );

  it.effect("create 传递 title 和 systemPrompt 给服务", () =>
    Effect.gen(function* () {
      const svc = yield* ConversationService;
      yield* svc.create("New Chat", "custom system prompt");
      expect(createCalls).toEqual([{ title: "New Chat", systemPrompt: "custom system prompt" }]);
    }).pipe(Effect.provide(MockConversationServiceLive)),
  );

  it.effect("archive 用正确 id 调用服务", () =>
    Effect.gen(function* () {
      const svc = yield* ConversationService;
      yield* svc.archive("conv-b");
      expect(archiveCalls).toEqual(["conv-b"]);
    }).pipe(Effect.provide(MockConversationServiceLive)),
  );

  it.effect("delete 用正确 id 调用服务", () =>
    Effect.gen(function* () {
      const svc = yield* ConversationService;
      yield* svc.delete("conv-a");
      expect(deleteCalls).toEqual(["conv-a"]);
    }).pipe(Effect.provide(MockConversationServiceLive)),
  );
});

// ─────────────────────────────────────────────────────────────────────
// TDD for "新对话: 当前活跃会话为空则不新增" 守卫
//
// 这个守卫从 sidebar 组件提到 conversations store ——
// UI 不再做这个判断,直接调 startNewConversation。
//
// 测试分两层:
// 1. shouldSkipNewConversation 纯函数 (4 组合,table-driven)
// 2. startNewConversation 桥接函数 (集成测试,验 IPC 没被调用)
// ─────────────────────────────────────────────────────────────────────

/** 最小 Message 构造 — 守卫只读 length,完整字段不必要。 */
const msg = (id: string): Message => ({
  id,
  conversation_id: "conv-x",
  role: "user",
  content: "x",
  tool_calls: null,
  tool_results: null,
  model: null,
  input_tokens: null,
  output_tokens: null,
  created_at: 0,
});

describe("shouldSkipNewConversation 守卫（纯函数）", () => {
  it.each([
    // [activeId, messages.length, expected, scenario]
    [null, 0, false, "无 active + 无 messages → 不跳过,要创建"],
    [null, 1, false, "无 active + 有 messages → 不跳过,要创建"],
    ["conv-1", 0, true, "有 active + 无 messages → 跳过,已在空白画布"],
    ["conv-1", 1, false, "有 active + 有 messages → 不跳过,要开新画布"],
  ] as const)("%s (active=%s, msgs=%i) → %s", (activeId, msgCount, expected, _label) => {
    const messages = Array.from({ length: msgCount }, (_, i) => msg(`m${i}`));
    expect(shouldSkipNewConversation(activeId, messages)).toBe(expected);
  });
});

describe("startNewConversation 桥接（空画布守卫集成）", () => {
  beforeEach(() => {
    // Reset IPC mock state — 这样 mockState.calls 不会带前一个测试的调用
    mockState.calls = [];
    // 默认给 create_conversation 提供一个合理的 Conversation 返回,
    // 避免 bridge 走"创建"分支时 mock 报 "Unknown IPC command"。
    mockState.resolved = {
      ...fixtureA,
      id: "new-conv-from-test",
      title: "新会话",
    };
  });

  it("active 会话为空 → 跳过,不调 create_conversation IPC", async () => {
    // Setup: 模拟"刚点完新对话"的场景 ——
    // activeId 已设,messages 为空(没发任何消息)
    selectConversation("conv-empty");
    clearMessages();

    // Action
    await startNewConversation("新会话");

    // Assert: 守卫拦截,create_conversation IPC 一次都没调
    expect(mockState.calls).not.toContain("create_conversation");
  });
});
