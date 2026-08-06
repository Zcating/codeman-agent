import { onMount, type JSX } from "solid-js";
import { Effect } from "effect";
import { HomeAgentForm } from "@codeman-frontend/features/chat/components/home";
import { loadWorkspaces } from "@codeman-frontend/features/chat/stores/chat.store";
import { ScrollArea } from "@codeman-frontend/shared/components/ui/scrollarea";

export function HomeRoute(): JSX.Element {
  onMount(() => {
    void Effect.runPromiseExit(loadWorkspaces());
  });
  return (
    <ScrollArea class="flex-1 min-h-0" data-scroll-region="true">
      <HomeAgentForm />
    </ScrollArea>
  );
}
