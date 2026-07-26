//! ChatLayout — Layout shell wrapping ChatSidebar + Outlet (Task 5 refactor).
//!
//! Per ADR-0030 D7: chat-sidebar.tsx owns all chat-domain logic. ChatLayout is
//! a thin shell that loads workspaces + conversations on mount and renders
//! `<ChatSidebar />` (which composes the universal CodemanSidebar with
//! chat-domain wrappers).

import { onMount, type JSX } from "solid-js";
import { Effect } from "effect";
import { ChatSidebar } from "@codeman-frontend/features/chat/components/chat-sidebar";
import { loadWorkspaces, loadConversations } from "@codeman-frontend/features/chat/stores/chat.store";

export function ChatLayout(): JSX.Element {
  // Load workspaces + conversations on mount (data fetch stays in layout)
  onMount(() => {
    Effect.runPromiseExit(loadWorkspaces());
    Effect.runPromiseExit(loadConversations());
  });

  return <ChatSidebar />;
}