//! Settings feature barrel。
//!
//! 重新导出：
//!   - ProviderCard UI 组件
//!   - System prompt 函数（ADR-0015）
//!   - Provider, Settings 类型

export { ProviderCard } from "@codeman-frontend/features/settings/components/provider-card";
export {
  getDefaultSystemPrompt,
  getUserCanEdit,
  updateDefaultSystemPrompt,
  resolveSystemPromptForConversation,
} from "@codeman-frontend/features/settings/lib/system-prompt";
export type { Provider, Settings } from "@codeman-frontend/shared/lib/types";
