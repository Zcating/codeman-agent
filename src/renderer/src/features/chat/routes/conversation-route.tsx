//! ConversationRoute — Conversation route component (V2.2 + Q1 patch).
//!
//! Renders ChatView only. convId comes from route params.
//! Q1 (2026-07-04): removed the "← 返回首页" button. The CodemanSidebar
//! (always-show after V2.3) is the primary way to navigate back to Home.

import type { JSX } from "solid-js";
import { useParams } from "@tanstack/solid-router";
import { ChatView } from "../components/chat-view";

export function ConversationRoute(): JSX.Element {
  const params = useParams({ from: "/chat/conversation/$convId" });
  const convId = (): string | undefined => params().convId;

  return (
    <div class="flex-1 h-screen overflow-hidden flex flex-col">
      <ChatView convId={convId()} />
    </div>
  );
}
