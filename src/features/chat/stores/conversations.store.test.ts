//! ConversationService Effect 桥接层测试。
//!
//! 测试 Effect → Solid 桥接函数（loadConversations、createConversation、selectConversation），
//! 使用 mock ConversationService。

import { describe, it, expect, beforeEach } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { ConversationService } from "../../../shared/lib/tauri";
import { AgentRuntime } from "../lib/runtime";
import type { AppError, Conversation, Message } from "../../../shared/lib/types";
import {
  shouldSkipNewConversation,
  startNewConversation,
  selectConversation,
  archiveConversationEffect,
  deleteConversationEffect,
} from "./conversations.store";
import { clearMessages } from "./messages.store";
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
    if (id === fixtureA.id) {
      return Effect.succeed(fixtureA);
    }
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

// ─────────────────────────────────────────────────────────────────────
// TDD for ADR-0014 D7: archiveConversationEffect / deleteConversationEffect
// 必须先 AgentRuntime.cancel(convId) + destroy(convId),再调 ConversationService。
//
// 触发条件: 用户在 conversation streaming 期间点删除。
// 旧实现只调 svc.delete,Agent 实例泄漏(SSE 连接 + EventSource 不会被 GC)。
// 修复: store 入口在删 DB 之前 cancel + destroy,语义干净。
//
// 测试策略: 调 production effect program (archiveConversationEffect / deleteConversationEffect),
// mock AgentRuntime + ConversationService 记录调用顺序,断言 cancel → destroy → svc.X。
// ─────────────────────────────────────────────────────────────────────

describe("archiveConversationEffect / deleteConversationEffect cancel-before-delete (ADR-0014 D7)", () => {
  // call order tracker — 每次 push 描述字符串
  let callOrder: string[] = [];

  // Mock AgentRuntime: 记录 cancel / destroy 调用顺序与参数
  const MockAgentRuntimeLive = Layer.succeed(AgentRuntime, {
    run: ((_conv: Conversation, _msg: Message) => {
      throw new Error("run not expected in D7 tests");
    }) as any,
    cancel: (convId: string) => {
      callOrder.push(`cancel(${convId})`);
      return Effect.succeed(undefined);
    },
    destroy: (convId: string) => {
      callOrder.push(`destroy(${convId})`);
      return Effect.succeed(undefined);
    },
  });

  // Mock ConversationService: 记录 archive / delete 调用顺序与参数
  const MockConversationServiceForD7 = Layer.succeed(ConversationService, {
    list: () => Effect.succeed([fixtureA, fixtureB]),
    get: (id) =>
      id === fixtureA.id
        ? Effect.succeed(fixtureA)
        : Effect.fail({ kind: "NotFound" as const, message: `not found: ${id}` } as AppError),
    create: (title, _systemPrompt) => Effect.succeed({ ...fixtureA, id: "new-conv", title }),
    archive: (id) => {
      callOrder.push(`svc.archive(${id})`);
      return Effect.succeed(undefined);
    },
    delete: (id) => {
      callOrder.push(`svc.delete(${id})`);
      return Effect.succeed(undefined);
    },
  });

  const MockD7Layer = Layer.merge(MockAgentRuntimeLive, MockConversationServiceForD7);

  beforeEach(() => {
    callOrder = [];
    // 重置 IPC mock state 防止上一个测试残留污染
    mockState.calls = [];
    mockState.resolved = undefined;
    mockState.rejected = undefined;
  });

  it("archiveConversationEffect 调用顺序: cancel → destroy → svc.archive", async () => {
    // Action: 调 production effect program
    await Effect.runPromiseExit(
      archiveConversationEffect("conv-b").pipe(Effect.provide(MockD7Layer)),
    );

    // Assert: 顺序严格。cancel 必须先于 svc.archive,destroy 必须先于 svc.archive
    // (delete 边界 = 用户 streaming 期间点删除,Agent 实例必须先清理再删 DB)
    expect(callOrder).toEqual(["cancel(conv-b)", "destroy(conv-b)", "svc.archive(conv-b)"]);
  });

  it("deleteConversationEffect 调用顺序: cancel → destroy → svc.delete", async () => {
    await Effect.runPromiseExit(
      deleteConversationEffect("conv-a").pipe(Effect.provide(MockD7Layer)),
    );

    expect(callOrder).toEqual(["cancel(conv-a)", "destroy(conv-a)", "svc.delete(conv-a)"]);
  });

  it("archive / delete 顺序不可调换: cancel 必须在 svc.archive 之前", async () => {
    // 额外断言: 验证 cancel 出现位置 < svc.archive 出现位置
    // (防止有人把顺序改成 svc.archive → cancel 这种"先删后清理"反模式)
    await Effect.runPromiseExit(
      archiveConversationEffect("conv-b").pipe(Effect.provide(MockD7Layer)),
    );

    const cancelIdx = callOrder.findIndex((s) => s.startsWith("cancel"));
    const archiveIdx = callOrder.findIndex((s) => s.startsWith("svc.archive"));
    expect(cancelIdx).toBeGreaterThanOrEqual(0);
    expect(archiveIdx).toBeGreaterThanOrEqual(0);
    expect(cancelIdx).toBeLessThan(archiveIdx);
  });
});
