import { it, expect } from "@effect/vitest";
import { describe } from "vitest";
import { Effect, Layer } from "effect";
import { WorkspaceService } from "./workspace-service";

const TestLayer = Layer.succeed(WorkspaceService, {
  list: () => Effect.succeed([]),
  add: (_l, _r) => Effect.succeed({ id: "test", label: "Test", root_path: "/tmp", created_at: Date.now() }),
  rename: () => Effect.void,
  remove: () => Effect.void,
  pickPath: () => Effect.succeed("/tmp/test"),
});

describe("WorkspaceService", () => {
  it.effect("list returns workspaces", () =>
    Effect.gen(function* () {
      const svc = yield* WorkspaceService;
      const result = yield* svc.list();
      expect(Array.isArray(result)).toBe(true);
    }).pipe(Effect.provide(TestLayer)));

  it.effect("add returns workspace", () =>
    Effect.gen(function* () {
      const svc = yield* WorkspaceService;
      const ws = yield* svc.add("Test", "/tmp");
      expect(ws.id).toBe("test");
    }).pipe(Effect.provide(TestLayer)));

  it.effect("remove succeeds", () =>
    Effect.gen(function* () {
      const svc = yield* WorkspaceService;
      yield* svc.remove("test-id");
    }).pipe(Effect.provide(TestLayer)));
});
