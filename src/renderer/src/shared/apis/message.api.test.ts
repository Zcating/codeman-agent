// message Service IPC 测试，搬迁自 shared/lib/ipc.test.ts
import { it, expect } from "@effect/vitest";
import { describe } from "vitest";
import { Effect } from "effect";
import { MessageService, MessageServiceLive } from "./message.api";

describe("MessageService", () => {
  it.effect("list returns array from IPC", () =>
    Effect.gen(function* () {
      const svc = yield* MessageService;
      const msgs = yield* svc.list("test-conv");
      expect(Array.isArray(msgs)).toBe(true);
    }).pipe(Effect.provide(MessageServiceLive)),
  );
});
