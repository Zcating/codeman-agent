import { describe, it, expect, vi } from "vitest";
import { Effect } from "effect";
import { chatSidebarActions } from "@codeman-frontend/features/chat/lib/chat-sidebar-actions";

vi.mock("../stores/chat.store", () => ({
  renameConversation: vi.fn((_convId: string, _newTitle: string) =>
    Effect.succeed(undefined),
  ),
}));

describe("chatSidebarActions", () => {
  it("renameConversation calls underlying Effect with correct args", async () => {
    const { renameConversation } = await import("@codeman-frontend/features/chat/stores/chat.store");

    await chatSidebarActions.renameConversation("c-1", "new title");

    expect(renameConversation).toHaveBeenCalledWith("c-1", "new title");
  });
});
