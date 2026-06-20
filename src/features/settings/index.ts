//! Settings feature barrel。
//!
//! 重新导出：
//!   - ProviderCard UI 组件
//!   - System prompt 函数（ADR-0015）
//!   - Provider, Settings 类型

export { ProviderCard } from "./components/provider-card";
export {
  getDefaultSystemPrompt,
  getUserCanEdit,
  updateDefaultSystemPrompt,
  resolveSystemPromptForConversation,
} from "./lib/system-prompt";
export type { Provider, Settings } from "../../shared/lib/types";
