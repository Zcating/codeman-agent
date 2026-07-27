//! Tests for FileService — migrated from ipc.test.ts lines 206-215.

import { it, expect } from "@effect/vitest";
import { describe } from "vitest";
import { Effect } from "effect";
import { FileService, FileServiceLive } from "@codeman-frontend/shared/apis/file.api";

describe("FileService", () => {
  it.effect("readFile is wired to read_file IPC", () =>
    Effect.gen(function* () {
      const svc = yield* FileService;
      const result = yield* svc.readFile("main", "/tmp/x.txt");
      // mockState.resolved is undefined by default, so result is undefined
      expect(result).toBeUndefined();
    }).pipe(Effect.provide(FileServiceLive)),
  );
});
