import type { JSX } from "solid-js";
import { useParams } from "@tanstack/solid-router";
import { ChatView } from "@codeman-frontend/features/chat/components/chat-view";

export function ConversationRoute(): JSX.Element {
  const params = useParams({ from: "/chat/conversation/$convId" });
  const convId = (): string | undefined => params().convId;

  return (
    <div class="flex-1 h-screen overflow-hidden flex flex-col">
      <ChatView convId={convId()} />
    </div>
  );
}
