//! System prompt Effect service.
//!
//! Effect signature:
//!   SystemPromptService exposes 4 methods; each returns
//!   Effect<A, AppError, never>.
//!
//! System prompt resolution order (per S1):
//!   1. Conversation's system_prompt override (if set)
//!   2. Settings.system_prompt.default (global)
//!   3. Empty string (or some hardcoded fallback)

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