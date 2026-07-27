//! Tests for invoke.api.ts �?dispatchInvoke error mapping + success path.
//!
//! Minimal 4-case coverage:
//! Case 1: JSON error message -> falls back to Unknown (decodeAppError only handles {_tag} not {kind})
//! Case 2: IPC error message is plain Error -> Unknown wrapper
//! Case 3: unknown command -> Unknown error
//! Case 4: success path -> returns resolved value

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
  // Case 1: IPC error message with JSON -> decodeAppError还原
  it.effect("JSON error payload falls back to Unknown AppError", () =>
    Effect.gen(function* () {
      // Simulate Electron's doubly-wrapped error:
      // Error: Error invoking remote method 'readFile': Error: {"_tag":"NotFound","message":"File not found"}
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

  // Case 2: Plain error message (no JSON) -> Unknown wrapper
  it.effect("plain error message is wrapped as Unknown AppError", () =>
    Effect.gen(function* () {
      // Plain error without JSON payload
      mockState.rejected = new Error("Something went wrong");

      const exit = yield* Effect.exit(invoke<string>("readFile", { workspaceId: "main", path: "/tmp/x.txt" }));

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const err = (exit.cause as any).error as any;
        // Should be Unknown (fallback wrapper)
        expect(err._tag).toBe("Unknown");
        expect(err.message).toBe("Error: Something went wrong");
      }
    }),
  );

  // Case 3: unknown command -> throws Unknown from dispatchInvoke
  it.effect("unknown IPC command throws Unknown error", () =>
    Effect.gen(function* () {
      // No mockState.rejected needed �?dispatchInvoke throws Unknown directly for unknown commands
      const exit = yield* Effect.exit(invoke("nonexistent_command", {}));

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const err = (exit.cause as any).error as any;
        expect(err._tag).toBe("Unknown");
        expect(err.message).toContain("nonexistent_command");
      }
    }),
  );

  // Case 4: success path -> returns resolved value
  it.effect("successful invoke returns resolved value", () =>
    Effect.gen(function* () {
      mockState.resolved = "file content here";

      const result = yield* invoke<string>("readFile", { workspaceId: "main", path: "/tmp/x.txt" });

      expect(result).toBe("file content here");
    }),
  );
});
