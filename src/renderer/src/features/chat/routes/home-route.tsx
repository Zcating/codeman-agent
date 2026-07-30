import { onMount, type JSX } from "solid-js";
import { Effect } from "effect";
import { HomeAgentForm } from "@codeman-frontend/features/chat/components/home";
import { loadWorkspaces } from "@codeman-frontend/features/chat/stores/chat.store";

export function HomeRoute(): JSX.Element {
  onMount(() => {
    void Effect.runPromiseExit(loadWorkspaces());
  });
  return <HomeAgentForm />;
}
