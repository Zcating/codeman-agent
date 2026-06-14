//! Chat feature public API.
//!
//! **Barrel exports for the chat feature.** Components, runtime, stores, and types
//! are all reachable from this single entry point. Internal implementation details
//! (e.g. the Effect Context tags) are NOT exported.

export { ChatView } from "./components/chat-view";
export { Sidebar } from "./components/sidebar";
export { MessageBubble } from "./components/message-bubble";
export { ToolCallCard } from "./components/tool-call-card";

export {
  AgentRuntime,
  AgentRuntimeLive,
  RuntimeLayer,
  RuntimeDeps,
  type RuntimeEvent,
  type RuntimeError,
} from "./runtime";

export * as chatStore from "./store/conversations";
export * as messageStore from "./store/messages";

export type { Message, Conversation, Role, ToolCall, ToolResult } from "../../shared/types";
