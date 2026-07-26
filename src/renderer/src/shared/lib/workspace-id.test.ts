import { describe, it, expect } from "vitest";
import { WorkspaceIdSchema, type WorkspaceId } from "@codeman-frontend/shared/lib/workspace-id";

describe("WorkspaceIdSchema (ADR-0025 PR 4)", () => {
  it("make() returns a branded WorkspaceId string", () => {
    const id = WorkspaceIdSchema.make("ws-abc-123");
    expect(typeof id).toBe("string");
    expect(id).toBe("ws-abc-123");
  });

  it("schema is brand-distinct from plain string (type-level)", () => {
    // Compile-time check: WorkspaceId is assignable to string but plain string is NOT
    // assignable to WorkspaceId without make(). Runtime proxy: Schema.make enforces the brand.
    const id: WorkspaceId = WorkspaceIdSchema.make("ws-xyz");
    const s: string = id; // OK: branded is assignable to base
    expect(typeof s).toBe("string");
    // Reverse direction would be a compile error (not tested at runtime).
  });

  it("accepts arbitrary UUID-like strings (no format constraint)", () => {
    // Per ADR-0025 D6: WorkspaceId has no Refinement; backend generates UUIDs.
    expect(WorkspaceIdSchema.make("550e8400-e29b-41d4-a716-446655440000")).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(WorkspaceIdSchema.make("any-non-empty-string")).toBe("any-non-empty-string");
  });
});
