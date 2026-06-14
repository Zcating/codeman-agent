//! SystemPromptService Effect 服务测试。
//!
//! Effect 签名：
//!   SystemPromptService.getDefault(): Effect<string, AppError>
//!   SystemPromptService.updateDefault(newDefault): Effect<void, AppError>
//!   SystemPromptService.getUserCanEdit(): Effect<boolean, AppError>
//!   SystemPromptService.forConversation(conversation): Effect<string, AppError>

import { it, expect, beforeEach } from "@effect/vitest";
import { describe } from "vitest";
import { Effect, Layer } from "effect";
import { SystemPromptService, SystemPromptServiceLive } from "./system-prompt";
import { SettingsService } from "../../../shared/lib/tauri";
import type { Settings, Conversation } from "../../../shared/types";

const mockImpl: {
  resolved: unknown;
  rejected: Error | undefined;
  currentSettings: Settings;
} = {
  resolved: undefined,
  rejected: undefined,
  currentSettings: null as unknown as Settings,
};

const baseSettings: Settings = {
  llm_providers: [],
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

let settingsState = { ...baseSettings };

const MockSettingsServiceLive = Layer.succeed(SettingsService, {
  getSettings: () => Effect.succeed({ ...settingsState }),
  updateSettings: (patch: unknown) => {
    settingsState = { ...settingsState, ...(patch as Partial<Settings>) };
    return Effect.succeed({ ...settingsState });
  },
  clearAllHistory: () => Effect.succeed(undefined),
  getActiveLlmProvider: () => Effect.succeed(null),
});

const convWithPrompt: Conversation = {
  id: "conv-custom",
  title: "Custom",
  system_prompt: "Use Chinese.",
  created_at: 0,
  updated_at: 0,
  archived_at: null,
};
const convWithoutPrompt: Conversation = {
  id: "conv-plain",
  title: "Plain",
  system_prompt: null,
  created_at: 0,
  updated_at: 0,
  archived_at: null,
};

describe("SystemPromptService", () => {
  beforeEach(() => {
    settingsState = { ...baseSettings };
    mockImpl.currentSettings = { ...baseSettings };
    mockImpl.resolved = undefined;
    mockImpl.rejected = undefined;
  });

  it.effect("getDefault 返回 system_prompt.default", () =>
    Effect.gen(function* () {
      const svc = yield* SystemPromptService;
      const result = yield* svc.getDefault();
      expect(result).toBe("You are a helpful assistant.");
    }).pipe(Effect.provide(SystemPromptServiceLive), Effect.provide(MockSettingsServiceLive)),
  );

  it.effect("updateDefault 修改默认系统提示词", () =>
    Effect.gen(function* () {
      const svc = yield* SystemPromptService;
      yield* svc.updateDefault("You are a pirate.");
      const result = yield* svc.getDefault();
      expect(result).toBe("You are a pirate.");
    }).pipe(Effect.provide(SystemPromptServiceLive), Effect.provide(MockSettingsServiceLive)),
  );

  it.effect("getUserCanEdit 返回 user_can_edit 标志", () =>
    Effect.gen(function* () {
      const svc = yield* SystemPromptService;
      const result = yield* svc.getUserCanEdit();
      expect(result).toBe(true);
    }).pipe(Effect.provide(SystemPromptServiceLive), Effect.provide(MockSettingsServiceLive)),
  );

  it.effect("forConversation 在设置覆盖时返回会话覆盖", () =>
    Effect.gen(function* () {
      const svc = yield* SystemPromptService;
      const result = yield* svc.forConversation(convWithPrompt);
      expect(result).toBe("Use Chinese.");
    }).pipe(Effect.provide(SystemPromptServiceLive), Effect.provide(MockSettingsServiceLive)),
  );

  it.effect("forConversation 在无覆盖时回退到 settings 默认值", () =>
    Effect.gen(function* () {
      const svc = yield* SystemPromptService;
      const result = yield* svc.forConversation(convWithoutPrompt);
      expect(result).toBe("You are a helpful assistant.");
    }).pipe(Effect.provide(SystemPromptServiceLive), Effect.provide(MockSettingsServiceLive)),
  );
});
