//! Settings feature barrel。
//!
//! 重新导出：
//!   - ProviderCard UI 组件
//!   - LLMProviderService + LLMProviderServiceLive（Effect 服务）
//!   - SystemPromptService + SystemPromptServiceLive（Effect 服务）
//!   - LLMProvider, Settings 类型

export { ProviderCard } from "./components/provider-card";
export { LLMProviderService, LLMProviderServiceLive } from "./lib/llm-providers";
export { SystemPromptService, SystemPromptServiceLive } from "./lib/system-prompt";
export type { LLMProvider, Settings } from "../../shared/lib/types";
