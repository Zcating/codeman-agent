import { it, expect } from "@effect/vitest";
import { describe } from "vitest";
import { Effect } from "effect";
import { MessageApi, MessageApiLive } from "./message.api";

describe("MessageApi", () => {
  it.effect("list returns array from IPC", () =>
    Effect.gen(function* () {
      const svc = yield* MessageApi;
      const msgs = yield* svc.list("test-conv");
      expect(Array.isArray(msgs)).toBe(true);
    }).pipe(Effect.provide(MessageApiLive)),
  );
});
