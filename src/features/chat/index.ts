//! Chat feature 公共 API。
//!
//! **Chat feature 的 barrel 导出。** Components、runtime、stores 和 types
//! 都可从这单一入口点访问。内部实现细节（如 Effect Context tags）**不**导出。

export { ChatView } from "./components/chat-view";
export { Sidebar } from "./components/sidebar";
export { MessageBubble } from "./components/message-bubble";
export { ToolCallCard } from "./components/tool-call-card";

export {
  AgentRuntime,
  AgentRuntimeLive,
  RuntimeLayer,
  type RuntimeEvent,
  type RuntimeError,
} from "./lib/runtime";

export * as chatStore from "./stores/conversations";
export * as messageStore from "./stores/messages";

export type { Message, Conversation, Role, ToolCall, ToolResult } from "../../shared/lib/types";
