//! Tests for invoke.api.ts — invoke<T> error mapping + success path.
//!
//! 3-case coverage (V3.2 typed invoke):
//! Case 1: JSON error message → decodeAppError还原 (handles {kind} or {_tag})
//! Case 2: plain Error message → Unknown wrapper fallback
//! Case 3: success path → returns resolved value
//!
//! Removed (V3.2): "unknown IPC command" case — `T extends keyof CodemanApi`
//! makes that compile-time impossible; the runtime `getApi()[channel]` path
//! can still hit an undefined method (which produces a TypeError → Unknown),
//! but that scenario is now covered by Case 2's plain-error path.

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
  // Case 1: IPC error message with JSON → decodeAppError还原
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

  // Case 2: Plain error message (no JSON) → Unknown wrapper
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

  // Case 3: success path → returns resolved value
  it.effect("successful invoke returns resolved value", () =>
    Effect.gen(function* () {
      mockState.resolved = "file content here";

      const result = yield* invoke<string>("readFile", { workspaceId: "main", path: "/tmp/x.txt" });

      expect(result).toBe("file content here");
    }),
  );
});
