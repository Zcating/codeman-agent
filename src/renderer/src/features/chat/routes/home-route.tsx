//! HomeRoute — Home route component (V2.2).
//!
//! Renders the HomeAgentForm for creating new conversations.
//! Reloads workspaces on mount so the store reflects any workspaces
//! created via IPC (e.g. e2e test setup) that bypassed the store.

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
