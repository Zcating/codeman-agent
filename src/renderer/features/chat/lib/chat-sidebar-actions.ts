//! chat-sidebar-actions — async wrappers for chat.store Effect functions.
//!
//! Per chat/AGENTS.md:69 "**UI 组件（`components/*.tsx`）禁止导入 `effect`**".
//! ChatSidebar is a UI component and previously called `Effect.runPromiseExit`
//! directly. This module is the seam: it imports `effect` (allowed — it's a
//! lib/, not a component) and exposes Promise-returning functions that the
//! UI can call without importing `effect`.
//!
//! Errors are swallowed (best-effort fire-and-forget); callers that need
//! success/failure should call the underlying chat.store Effect directly.

import { Effect } from "effect";
import {
  deleteConversation,
  renameWorkspace,
  removeWorkspace,
} from "../stores/chat.store";

async function runEffect<A, E>(
  effect: Effect.Effect<A, E, never>,
): Promise<A | undefined> {
  return Effect.runPromiseExit(effect).then((exit) =>
    exit._tag === "Success" ? exit.value : undefined,
  );
}

export const chatSidebarActions = {
  deleteConversation: async (convId: string): Promise<void> => {
    await runEffect(deleteConversation(convId));
  },

  renameWorkspace: async (
    wsId: string,
    newLabel: string,
  ): Promise<boolean> => {
    const exit = await Effect.runPromiseExit(renameWorkspace(wsId, newLabel));
    return exit._tag === "Success";
  },

  removeWorkspace: async (wsId: string): Promise<boolean> => {
    const exit = await Effect.runPromiseExit(removeWorkspace(wsId));
    return exit._tag === "Success";
  },
} as const;