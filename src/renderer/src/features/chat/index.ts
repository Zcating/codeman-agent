//! Chat feature 公共 API。
//!
//! **Chat feature 的 barrel 导出。** Components、runtime、stores 和 types
//! 都可从这单一入口点访问。内部实现细节（如 Effect Context tags）**不**导出。

export { ChatView } from "@codeman-frontend/features/chat/components/chat-view";
export { MessageBubble } from "@codeman-frontend/features/chat/components/message-bubble";
export { ToolCallCard } from "@codeman-frontend/features/chat/components/tool-call-card";

export {
  createAgentRuntime,
  type AgentRuntime,
  type RuntimeEvent,
  type ProviderConfig,
  type RunOptions,
} from "@codeman-frontend/features/chat/lib/runtime";

export * as chatStore from "@codeman-frontend/features/chat/stores/chat.store";

export type { Message, Conversation, Role, ToolCall, ToolResult } from "@codeman-frontend/shared/lib/types";
