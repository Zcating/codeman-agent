import { onMount, type JSX } from "solid-js";
import { Effect } from "effect";
import { ChatSidebar } from "@codeman-frontend/features/chat/components/chat-sidebar";
import { loadWorkspaces, loadConversations } from "@codeman-frontend/features/chat/stores/chat.store";

export function ChatLayout(): JSX.Element {
  onMount(() => {
    Effect.runPromiseExit(loadWorkspaces());
    Effect.runPromiseExit(loadConversations());
  });

  return <ChatSidebar />;
}