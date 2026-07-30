











import { it, expect, beforeEach } from "@effect/vitest";
import { describe } from "vitest";
import { Effect, Exit } from "effect";
import { mockState } from "@codeman-frontend/__mocks__/ipc-mock";
import { invoke } from "@codeman-frontend/shared/apis/invoke.api";

beforeEach(() => {
  mockState.rejected = undefined;
  mockState.resolved = undefined;
  mockState.calls = [];
});

describe("invoke dispatch error mapping", () => {
  
  it.effect("JSON error payload falls back to Unknown AppError", () =>
    Effect.gen(function* () {
      
      
      mockState.rejected = new Error(
        "Error invoking remote method 'readFile': Error: {\"_tag\":\"NotFound\",\"message\":\"File not found\"}",
      );

      const exit = yield* Effect.exit(invoke<string>("readFile", { workspaceId: "main", path: "/tmp/x.txt" }));

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const err = (exit.cause as any).error as any;
        expect(err._tag).toBe("NotFound");
        expect(err.message).toBe("File not found");
      }
    }),
  );

  
  it.effect("plain error message is wrapped as Unknown AppError", () =>
    Effect.gen(function* () {
      
      mockState.rejected = new Error("Something went wrong");

      const exit = yield* Effect.exit(invoke<string>("readFile", { workspaceId: "main", path: "/tmp/x.txt" }));

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const err = (exit.cause as any).error as any;
        
        expect(err._tag).toBe("Unknown");
        expect(err.message).toBe("Error: Something went wrong");
      }
    }),
  );

  
  it.effect("successful invoke returns resolved value", () =>
    Effect.gen(function* () {
      mockState.resolved = "file content here";

      const result = yield* invoke<string>("readFile", { workspaceId: "main", path: "/tmp/x.txt" });

      expect(result).toBe("file content here");
    }),
  );
});
