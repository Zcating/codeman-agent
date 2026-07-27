// conversation Service IPC 测试，搬迁自 shared/lib/ipc.test.ts
import { it, expect } from "@effect/vitest";
import { describe } from "vitest";
import { Effect } from "effect";
import { mockState } from "@codeman-frontend/__mocks__/ipc-mock";
import {
  ConversationService,
  ConversationServiceLive,
} from "./conversation.api";

describe("ConversationService", () => {
  it.effect("list returns array from IPC", () =>
    Effect.gen(function* () {
      const svc = yield* ConversationService;
      const convos = yield* svc.list(false);
      expect(Array.isArray(convos)).toBe(true);
    }).pipe(Effect.provide(ConversationServiceLive)),
  );

  it.effect("rename forwards to window.codeman.renameConversation with correct args", () =>
    Effect.gen(function* () {
      const svc = yield* ConversationService;
      mockState.invokeCalls = [];
      yield* svc.rename("conv-123", "New Title");
      const renameCall = mockState.invokeCalls.find((c) => c.name === "renameConversation");
      expect(renameCall).toBeDefined();
      expect(renameCall?.args).toEqual({ id: "conv-123", title: "New Title" });
    }).pipe(Effect.provide(ConversationServiceLive)),
  );
});
