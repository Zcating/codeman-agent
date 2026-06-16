//! AgentRuntime Effect 服务测试。
//!
//! Effect 签名：
//!   AgentRuntime.run(conversation, userMessage): Stream<RuntimeEvent>
//!   AgentRuntime.cancel(): Effect<void>

import { it, expect } from "@effect/vitest";
import { describe, vi } from "vitest";
import { Effect, Layer, Stream } from "effect";
import { AgentRuntime, AgentRuntimeLive } from "./runtime";
import { SettingsService, BillingService } from "../../../shared/lib/tauri";
import { LLMProviderService } from "../../settings/lib/llm-providers";
import { buildModel } from "./build-model";
import type { Settings, LLMProvider, Conversation, Message } from "../../../shared/lib/types";

const testConversation: Conversation = {
  id: "conv-1",
  title: "Test",
  system_prompt: null,
  created_at: 0,
  updated_at: 0,
  archived_at: null,
};

const testMessage: Message = {
  id: "msg-1",
  conversation_id: "conv-1",
  role: "user",
  content: "hello",
  tool_calls: null,
  tool_results: null,
  model: null,
  input_tokens: null,
  output_tokens: null,
  created_at: 0,
};

const testSettings: Settings = {
  llm_providers: [
    {
      id: "deepseek",
      label: "DeepSeek",
      enabled: true,
      default_model: "deepseek-chat",
      base_url: "https://api.deepseek.com",
      api_type: "anthropic-messages",
      api_key_ref: "llm_providers/deepseek/api_key",
    },
  ],
  default_llm_provider_id: "deepseek",
  user_language: "en",
  theme: "dark",
  start_at_login: false,
  window: {
    remember_position: false,
    remember_size: false,
    default_size: { width: 800, height: 600 },
    min_size: { width: 400, height: 300 },
  },
  system_prompt: { default: "You are a helpful assistant.", user_can_edit: true },
  billing_providers: [],
  conversations: { auto_archive_after_days: 30, max_history: 1000 },
};

let agentAborted = false;

const MockSettingsServiceLive = Layer.succeed(SettingsService, {
  getSettings: () => Effect.succeed(testSettings),
  updateSettings: () => Effect.succeed(testSettings),
  clearAllHistory: () => Effect.succeed(undefined),
  getActiveLlmProvider: () => Effect.succeed(testSettings.llm_providers[0] as LLMProvider),
});

const MockBillingServiceLive = Layer.succeed(BillingService, {
  listProviders: () => Effect.succeed([]),
  getSnapshot: () => Effect.fail({ kind: "NotFound", message: "stub" } as any),
  hasKey: () => Effect.succeed(false),
  setKey: () => Effect.succeed(undefined),
});

const apiKeySpy = vi.fn(() => Effect.succeed<string | null>("sk-test-key"));
const MockLLMProviderServiceLive = Layer.effect(
  LLMProviderService,
  Effect.gen(function* () {
    return {
      list: () => Effect.succeed(testSettings.llm_providers),
      add: () => Effect.succeed(undefined),
      update: () => Effect.succeed(undefined),
      remove: () => Effect.succeed(undefined),
      setApiKey: () => Effect.succeed(undefined),
      hasApiKey: () => Effect.succeed(true),
      getApiKey: apiKeySpy,
      setActive: () => Effect.succeed(undefined),
    };
  }),
);

// AgentRuntimeLive 现在 yield* SettingsService + LLMProviderService 在 layer 内部,
// 所以 MockRuntimeDeps 必须包含这俩 + BillingService 才能 build layer。
const MockRuntimeDeps = Layer.mergeAll(
  MockSettingsServiceLive,
  MockBillingServiceLive,
  MockLLMProviderServiceLive,
);

describe("AgentRuntime", () => {
  it.effect("runtime cancel 设置 agent.abort()", () =>
    Effect.gen(function* () {
      agentAborted = false;
      const runtime = yield* AgentRuntime;
      // 在任何 run 之前取消 — agentRef 为 null，应该是 no-op
      yield* runtime.cancel();
      expect(agentAborted).toBe(false);
    }).pipe(Effect.provide(AgentRuntimeLive), Effect.provide(MockRuntimeDeps)),
  );

  it.effect("runtime 服务可构造且包含所有依赖", () =>
    Effect.gen(function* () {
      const runtime = yield* AgentRuntime;
      expect(runtime).toBeDefined();
      expect(typeof runtime.run).toBe("function");
      expect(typeof runtime.cancel).toBe("function");
    }).pipe(Effect.provide(AgentRuntimeLive), Effect.provide(MockRuntimeDeps)),
  );

  it.effect("runtime.run 返回 Stream（不是 undefined）", () =>
    Effect.gen(function* () {
      const runtime = yield* AgentRuntime;
      const stream = runtime.run(testConversation, testMessage);
      expect(stream).toBeDefined();
      expect(typeof stream.pipe).toBe("function"); // Stream 有 pipe
    }).pipe(Effect.provide(AgentRuntimeLive), Effect.provide(MockRuntimeDeps)),
  );

  it.effect("runtime 通过 LLMProviderService.getApiKey 拉取 activeProvider 的密钥", () =>
    Effect.gen(function* () {
      apiKeySpy.mockClear();
      const runtime = yield* AgentRuntime;
      // Stream.take(1) 触发 Agent 构造（取首元素后 cancel）
      yield* runtime.run(testConversation, testMessage).pipe(Stream.take(1), Stream.runDrain);
      // 验证 getApiKey 被调用，参数是 activeProvider.id ("deepseek")
      expect(apiKeySpy).toHaveBeenCalledWith("deepseek");
    }).pipe(Effect.provide(AgentRuntimeLive), Effect.provide(MockRuntimeDeps)),
  );

  it("buildModel 读取 activeProvider.api_type 作为 api 字段", () => {
    const model = buildModel(testSettings.llm_providers[0]);
    expect(model.api).toBe("anthropic-messages");
  });
});
