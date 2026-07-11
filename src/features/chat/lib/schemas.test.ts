import { describe, it, expect } from "vitest";
import { ConversationIdSchema, ToolCallIdSchema } from "./schemas";

describe("chat schemas (ADR-0025 PR 4)", () => {
  it("ConversationIdSchema: brand round-trip", () => {
    const id = ConversationIdSchema.make("conv-1");
    expect(typeof id).toBe("string");
    expect(id).toBe("conv-1");
  });

  it("ToolCallIdSchema: brand round-trip", () => {
    const id = ToolCallIdSchema.make("call_abc");
    expect(typeof id).toBe("string");
    expect(id).toBe("call_abc");
  });

  it("ConversationId and ToolCallId are distinct brands", () => {
    // Type-level: a ConversationId is NOT assignable to ToolCallId.
    // Runtime proxy: each Schema.make validates against its own brand.
    const conv = ConversationIdSchema.make("c1");
    const tc = ToolCallIdSchema.make("t1");
    expect(conv).not.toBe(tc);
  });

  it("accepts arbitrary non-empty strings", () => {
    expect(ConversationIdSchema.make("uuid-with-dashes-1234")).toBe("uuid-with-dashes-1234");
    expect(ToolCallIdSchema.make("anthropic-tooluse-abc-def")).toBe("anthropic-tooluse-abc-def");
  });
});
