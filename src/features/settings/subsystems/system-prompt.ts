//! System prompt Effect 服务。
//!
//! Effect 签名：
//!   SystemPromptService 暴露 4 个方法；每个返回
//!   Effect<A, AppError, never>。
//!
//! System prompt 解析顺序（按 S1）：
//!   1. Conversation 的 system_prompt 覆盖（如已设置）
//!   2. Settings.system_prompt.default（全局）
//!   3. 空字符串（或某个硬编码回退值）

import { Effect, Context, Layer } from "effect";
import { SettingsService } from "../../../shared/lib/tauri";
import type { AppError, Conversation } from "../../../shared/types";

export class SystemPromptService extends Context.Tag("SystemPromptService")<
  SystemPromptService,
  {
    readonly getDefault: () => Effect.Effect<string, AppError>;
    readonly updateDefault: (newDefault: string) => Effect.Effect<void, AppError>;
    readonly getUserCanEdit: () => Effect.Effect<boolean, AppError>;
    readonly forConversation: (conversation: Conversation) => Effect.Effect<string, AppError>;
  }
>() {}

export const SystemPromptServiceLive = Layer.effect(
  SystemPromptService,
  Effect.gen(function* () {
    const svc = yield* SettingsService;

    return {
      getDefault: () =>
        Effect.gen(function* () {
          const settings = yield* svc.getSettings();
          return settings.system_prompt.default;
        }),

      updateDefault: (newDefault) =>
        Effect.gen(function* () {
          const current = yield* svc.getSettings();
          yield* svc.updateSettings({
            system_prompt: { ...current.system_prompt, default: newDefault },
          });
        }),

      getUserCanEdit: () =>
        Effect.gen(function* () {
          const settings = yield* svc.getSettings();
          return settings.system_prompt.user_can_edit;
        }),

      forConversation: (conversation) =>
        Effect.gen(function* () {
          if (conversation.system_prompt) return conversation.system_prompt;
          const settings = yield* svc.getSettings();
          return settings.system_prompt.default;
        }),
    };
  }),
);
