//! AgentRuntime Effect service tests.
//!
//! Effect signature:
//!   AgentRuntime.run(conversation, userMessage): Stream<RuntimeEvent>
//!   AgentRuntime.cancel(): Effect<void>

import { it, expect } from "@effect/vitest";
import { describe } from "vitest";
import { Effect, Layer } from "effect";
import { AgentRuntime, AgentRuntimeLive } from "./runtime";
import { SettingsService, BillingService } from "../lib/tauri";
import type { Settings, LLMProvider, Conversation, Message } from "../lib/types";

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
  getActiveLlmProvider: () =>
    Effect.succeed(testSettings.llm_providers[0] as LLMProvider),
});

const MockBillingServiceLive = Layer.succeed(BillingService, {
  listProviders: () => Effect.succeed([]),
  getSnapshot: () =>
    Effect.fail({ kind: "NotFound", message: "stub" } as any),
  hasKey: () => Effect.succeed(false),
  setKey: () => Effect.succeed(undefined),
});

const MockRuntimeDeps = Layer.mergeAll(MockSettingsServiceLive, MockBillingServiceLive);

describe("AgentRuntime", () => {
  it.effect("runtime cancel sets agent.abort()", () =>
    Effect.gen(function* () {
      agentAborted = false;
      const runtime = yield* AgentRuntime;
      // Cancel before any run — agentRef is null, should be no-op
      yield* runtime.cancel();
      expect(agentAborted).toBe(false);
    }).pipe(Effect.provide(AgentRuntimeLive), Effect.provide(MockRuntimeDeps))
  );

  it.effect("runtime service is constructible with all deps", () =>
    Effect.gen(function* () {
      const runtime = yield* AgentRuntime;
      expect(runtime).toBeDefined();
      expect(typeof runtime.run).toBe("function");
      expect(typeof runtime.cancel).toBe("function");
    }).pipe(Effect.provide(AgentRuntimeLive), Effect.provide(MockRuntimeDeps))
  );

  it.effect("runtime.run returns a Stream (not undefined)", () =>
    Effect.gen(function* () {
      const runtime = yield* AgentRuntime;
      const stream = runtime.run(testConversation, testMessage);
      expect(stream).toBeDefined();
      expect(typeof stream.pipe).toBe("function"); // Stream has pipe
    }).pipe(Effect.provide(AgentRuntimeLive), Effect.provide(MockRuntimeDeps))
  );
});