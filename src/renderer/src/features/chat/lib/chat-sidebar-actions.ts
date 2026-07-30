





import { Effect } from "effect";
import {
  deleteConversation,
  renameConversation,
  renameWorkspace,
  removeWorkspace,
} from "@codeman-frontend/features/chat/stores/chat.store";

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

  renameConversation: async (convId: string, newTitle: string): Promise<void> => {
    await runEffect(renameConversation(convId, newTitle));
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