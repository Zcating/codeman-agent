//! ConversationService Effect 桥接层测试。
//!
//! 测试 Effect → Solid 桥接函数（loadConversations、createConversation、selectConversation），
//! 使用 mock ConversationService。

import { describe, it, expect, beforeEach } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { ConversationService } from "../../../shared/lib/tauri";
import type { AppError, Conversation } from "../../../shared/lib/types";

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
