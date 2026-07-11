//! System prompt 配置读取 (ADR-0015).
//!
//! V1.7+ 后通过 appStore 直接读 Settings，不再走 Effect Service 层。
//! Settings JSON 内 `system_prompt.default` 与 `system_prompt.user_can_edit` 字段。

import { appStore } from "../../../shared/stores/app.store";
import type { Conversation } from "../../../shared/lib/types";

/** 读取全局默认系统提示词。 */
export function getDefaultSystemPrompt(): string {
  return appStore.state.value.systemPrompt.default;
}

/** 读取 userCanEdit 标志。 */
export function getUserCanEdit(): boolean {
  return appStore.state.value.systemPrompt.userCanEdit;
}

/** 更新全局默认系统提示词（写 appStore，由其 debounced flush 到后端）。 */
export function updateDefaultSystemPrompt(newDefault: string): void {
  const current = appStore.state.value.systemPrompt;
  appStore.set({
    systemPrompt: { ...current, default: newDefault },
  });
}

/**
 * 解析会话的系统提示词：
 * 1. Conversation 的 systemPrompt 覆盖（如已设置）
 * 2. Settings.systemPrompt.default（全局）
 * 3. 空字符串
 */
export function resolveSystemPromptForConversation(conversation: Conversation): string {
  if (conversation.systemPrompt) {
    return conversation.systemPrompt;
  }
  return appStore.state.value.systemPrompt.default;
}
