//! Effect → Solid 会话桥接层 (V2 ADR-0019: 吸收 messages.store + agent.store)。
//!
//! 唯一响应式源: Solid `createStore<{ activeId, byId: Record<ConvId, ConversationState> }>`。
//! ConversationState = DB fields + messages + streamingMessageId + runtime。
//! UI 读 store.byId[activeId()].messages,Solid proxy 按路径细粒度反应式。
//!
//! Task 4 范围: ConversationState 类型 + createStore + setupConvState + accessors。
//! 后续 Task 5/6/7 加 sendMessage / cancel / archive / delete / loadConversations / createConversation。

import { createStore } from "solid-js/store";
import { createSignal, type Accessor } from "solid-js";
import type { Conversation, Message } from "../../../shared/lib/types";
import { createAgentRuntime, type AgentRuntime } from "../lib/runtime";

// ─── ConversationState 类型 (inline 在 conversations.store) ──────

export interface ConversationState {
  // DB-backed fields (mirror shared/lib/types.ts Conversation)
  id: string;
  title: string;
  system_prompt: string | null;
  created_at: number;
  updated_at: number;
  archived_at: number | null;
  // Per-conv reactive state
  messages: Message[];
  streamingMessageId: string | null;
  // Per-conv runtime (createAgentRuntime 工厂产物)
  runtime: AgentRuntime;
}

// ─── 单一响应式源: Solid createStore ──────────────────────────

const [store, setStore] = createStore<{
  activeId: string | null;
  byId: Record<string, ConversationState>;
}>({
  activeId: null,
  byId: {},
});

export { store };

// ─── Accessors (for UI components) ─────────────────────────────

const [activeId, setActiveIdSignal] = createSignal<string | null>(null);
export const activeId$: Accessor<string | null> = activeId;

const [conversations, setConversationsSignal] = createSignal<ConversationState[]>([]);
export const conversations$: Accessor<ConversationState[]> = conversations;

// ─── setupConvState: 初始化 ConvState ────────────────────────

export function setupConvState(conv: Conversation, history: Message[]): ConversationState {
  const runtime = createAgentRuntime();
  const cs: ConversationState = {
    id: conv.id,
    title: conv.title,
    system_prompt: conv.system_prompt,
    created_at: conv.created_at,
    updated_at: conv.updated_at,
    archived_at: conv.archived_at,
    messages: history,
    streamingMessageId: null,
    runtime,
  };
  setStore("byId", conv.id, cs);
  // 同步 conversations$ accessor
  setConversationsSignal(Object.values(store.byId));
  return cs;
}

// ─── selectConversation: 切换 active ──────────────────────────

export function selectConversation(id: string): void {
  setActiveIdSignal(id);
  setStore("activeId", id);
}
