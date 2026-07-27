//! Tests for FileApi — migrated from ipc.test.ts lines 206-215.

import { it, expect } from "@effect/vitest";
import { describe } from "vitest";
import { Effect } from "effect";
import { FileApi, FileApiLive } from "@codeman-frontend/shared/apis/file.api";

describe("FileApi", () => {
  it.effect("readFile is wired to read_file IPC", () =>
    Effect.gen(function* () {
      const svc = yield* FileApi;
      const result = yield* svc.readFile("main", "/tmp/x.txt");
      // mockState.resolved is undefined by default, so result is undefined
      expect(result).toBeUndefined();
    }).pipe(Effect.provide(FileApiLive)),
  );
});
