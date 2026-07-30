
import { it, expect } from "@effect/vitest";
import { describe } from "vitest";
import { Effect } from "effect";
import { mockState } from "@codeman-frontend/__mocks__/ipc-mock";
import {
  ConversationApi,
  ConversationApiLive,
} from "./conversation.api";

describe("ConversationApi", () => {
  it.effect("list returns array from IPC", () =>
    Effect.gen(function* () {
      const svc = yield* ConversationApi;
      const convos = yield* svc.list(false);
      expect(Array.isArray(convos)).toBe(true);
    }).pipe(Effect.provide(ConversationApiLive)),
  );

  it.effect("rename forwards to window.codeman.renameConversation with correct args", () =>
    Effect.gen(function* () {
      const svc = yield* ConversationApi;
      mockState.invokeCalls = [];
      yield* svc.rename("conv-123", "New Title");
      const renameCall = mockState.invokeCalls.find((c) => c.name === "renameConversation");
      expect(renameCall).toBeDefined();
      expect(renameCall?.args).toEqual({ id: "conv-123", title: "New Title" });
    }).pipe(Effect.provide(ConversationApiLive)),
  );
});
