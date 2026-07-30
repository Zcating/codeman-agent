import { appStore } from "@codeman-frontend/shared/stores/app.store";
import type { Conversation } from "@codeman-frontend/shared/lib/types";

export function getDefaultSystemPrompt(): string {
  return appStore.state.value.systemPrompt.default;
}

export function getUserCanEdit(): boolean {
  return appStore.state.value.systemPrompt.userCanEdit;
}

export function updateDefaultSystemPrompt(newDefault: string): void {
  const current = appStore.state.value.systemPrompt;
  appStore.set({
    systemPrompt: { ...current, default: newDefault },
  });
}

export function resolveSystemPromptForConversation(conversation: Conversation): string {
  if (conversation.systemPrompt) {
    return conversation.systemPrompt;
  }
  return appStore.state.value.systemPrompt.default;
}
