//! Settings feature barrel.
//!
//! Re-exports:
//!   - ProviderCard UI component
//!   - LLMProviderService + LLMProviderServiceLive (Effect service)
//!   - SystemPromptService + SystemPromptServiceLive (Effect service)
//!   - LLMProvider, Settings types

export { ProviderCard } from "./components/provider-card";
export { LLMProviderService, LLMProviderServiceLive } from "./subsystems/llm_providers";
export { SystemPromptService, SystemPromptServiceLive } from "./subsystems/system-prompt";
export type { LLMProvider, Settings } from "../../shared/types";
