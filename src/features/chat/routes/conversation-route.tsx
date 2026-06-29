//! ConversationRoute — Conversation route component (V2.2).
//!
 //! Renders ChatView with back button. convId comes from route params.

import type { JSX } from "solid-js";
import { useNavigate, useParams } from "@tanstack/solid-router";
import { ArrowLeft } from "lucide-solid";
import { ChatView } from "../components/chat-view";

export function ConversationRoute(): JSX.Element {
  const navigate = useNavigate();
  const params = useParams({ from: "/chat/conversation/$convId" });
  const convId = (): string | undefined => params().convId;

  const handleBack = () => {
    navigate({ to: "/" });
  };

  return (
    <>
      <button
        type="button"
        onClick={handleBack}
        class="flex items-center gap-1 px-4 py-2 text-sm text-muted-foreground hover:text-foreground border-b border-border transition-colors"
        aria-label="返回首页"
        data-testid="back-to-home"
      >
        <ArrowLeft class="h-4 w-4" aria-hidden="true" />
        返回首页
      </button>
      <div class="flex-1 min-h-0 overflow-hidden flex flex-col">
        <ChatView convId={convId()} />
      </div>
    </>
  );
}
