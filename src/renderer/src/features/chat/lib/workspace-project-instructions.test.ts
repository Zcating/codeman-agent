import { it, expect } from "@effect/vitest";
import { describe } from "vitest";
import { Effect, Layer } from "effect";
import { FileApi } from "@codeman-frontend/shared/apis/file.api";
import { NotFound } from "@codeman-frontend/shared/lib/errors";
import {
  loadProjectInstructions,
  truncateProjectInstructions,
} from "@codeman-frontend/features/chat/lib/workspace-project-instructions";

const createMockFileApi = (overrides: Partial<{
  readFile: (workspaceId: string, path: string) => Effect.Effect<string, NotFound>;
}>) =>
  Layer.succeed(FileApi, {
    readFile: overrides.readFile ?? (() => Effect.succeed("")),
    writeFile: () => Effect.succeed(undefined),
    editFile: () => Effect.succeed(undefined),
    searchFiles: () => Effect.succeed([]),
    deleteFile: () => Effect.succeed(undefined),
  });

const SMALL_CONTENT = "This is a small AGENTS.md content.";
const LARGE_CONTENT = "A".repeat(35_000); // > 32_000 chars

describe("workspace-project-instructions", () => {
  describe("truncateProjectInstructions", () => {
    it("within boundary returns original unchanged", () => {
      const content = "Small content here.";
      expect(truncateProjectInstructions(content)).toBe(content);
    });

    it("at boundary returns original unchanged", () => {
      const content = "A".repeat(32_000);
      expect(truncateProjectInstructions(content)).toBe(content);
    });

    it("over boundary truncates and appends suffix", () => {
      const content = "A".repeat(35_000);
      const result = truncateProjectInstructions(content);
      expect(result.length).toBe(32_000 + "\n\n[truncated]".length);
      expect(result.endsWith("\n\n[truncated]")).toBe(true);
    });

    it("respects custom maxChars", () => {
      const content = "ABCDEF";
      const result = truncateProjectInstructions(content, 3);
      expect(result).toBe("ABC\n\n[truncated]");
    });
  });

  describe("loadProjectInstructions", () => {
    const workspaceId = "test-workspace";

    it.effect("file exists and ≤32KB returns full content", () => {
      const MockFileApi = createMockFileApi({
        readFile: () => Effect.succeed(SMALL_CONTENT),
      });
      return Effect.gen(function* () {
        const result = yield* loadProjectInstructions(workspaceId);
        expect(result).toBe(SMALL_CONTENT);
      }).pipe(Effect.provide(MockFileApi));
    });

    it.effect("file not found (NotFound) returns null", () => {
      const MockFileApi = createMockFileApi({
        readFile: () =>
          Effect.fail(new NotFound({ message: "AGENTS.md not found" })),
      });
      return Effect.gen(function* () {
        const result = yield* loadProjectInstructions(workspaceId);
        expect(result).toBeNull();
      }).pipe(Effect.provide(MockFileApi));
    });

    it.effect("content >32KB is truncated with suffix", () => {
      const MockFileApi = createMockFileApi({
        readFile: () => Effect.succeed(LARGE_CONTENT),
      });
      return Effect.gen(function* () {
        const result = yield* loadProjectInstructions(workspaceId);
        expect(result).not.toBeNull();
        expect(result!.length).toBe(32_000 + "\n\n[truncated]".length);
        expect(result!.endsWith("\n\n[truncated]")).toBe(true);
      }).pipe(Effect.provide(MockFileApi));
    });

    it.effect("other errors return null (silent skip)", () => {
      const MockFileApi = createMockFileApi({
        readFile: () =>
          Effect.fail(new NotFound({ message: "some error" })),
      });
      return Effect.gen(function* () {
        const result = yield* loadProjectInstructions(workspaceId);
        expect(result).toBeNull();
      }).pipe(Effect.provide(MockFileApi));
    });
  });
});
