import { describe, it, expect } from "vitest";
import { Schema } from "effect";
import {
  ConversationIdSchema,
  ToolCallIdSchema,
  DraftFieldSchema,
  ModelIdFieldSchema,
  WorkspaceIdFieldSchema,
  HomeFormSchema,
  ChatViewFormSchema,
} from "@codeman-frontend/features/chat/lib/schemas";

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
    
    
    const conv = ConversationIdSchema.make("c1");
    const tc = ToolCallIdSchema.make("t1");
    expect(conv).not.toBe(tc);
  });

  it("accepts arbitrary non-empty strings", () => {
    expect(ConversationIdSchema.make("uuid-with-dashes-1234")).toBe("uuid-with-dashes-1234");
    expect(ToolCallIdSchema.make("anthropic-tooluse-abc-def")).toBe("anthropic-tooluse-abc-def");
  });
});



describe("chat form schemas (ADR-0029 PR 1)", () => {
  describe("field-level schemas (strict, no \"\" sentinel)", () => {
    it("DraftFieldSchema 接受非空串", () => {
      expect(Schema.decodeUnknownSync(DraftFieldSchema)("hello")).toBe("hello");
    });

    it("DraftFieldSchema 拒绝空串", () => {
      expect(() => Schema.decodeUnknownSync(DraftFieldSchema)("")).toThrow();
    });

    it("ModelIdFieldSchema 接受空串 (model 可选, \"auto\" fallback)", () => {
      expect(Schema.decodeUnknownSync(ModelIdFieldSchema)("")).toBe("");
    });

    it("WorkspaceIdFieldSchema 拒绝空串", () => {
      expect(() => Schema.decodeUnknownSync(WorkspaceIdFieldSchema)("")).toThrow();
    });
  });

  describe("HomeFormSchema (3-field form-level, modelId 可选)", () => {
    it("接受 valid 三元组", () => {
      const valid = { draft: "hello", modelId: "MiniMax-M2.5", workspaceId: "ws-1" };
      expect(Schema.decodeUnknownSync(HomeFormSchema)(valid)).toEqual(valid);
    });

    it("接受空 modelId (无 model 配置时用 \"auto\" 默认)", () => {
      const valid = { draft: "hello", modelId: "", workspaceId: "ws-1" };
      expect(Schema.decodeUnknownSync(HomeFormSchema)(valid)).toEqual(valid);
    });

    it("拒绝空 workspaceId (sentinel 提交时拦截)", () => {
      const invalid = { draft: "hello", modelId: "MiniMax-M2.5", workspaceId: "" };
      expect(() => Schema.decodeUnknownSync(HomeFormSchema)(invalid)).toThrow();
    });

    it("拒绝空 draft", () => {
      const invalid = { draft: "", modelId: "MiniMax-M2.5", workspaceId: "ws-1" };
      expect(() => Schema.decodeUnknownSync(HomeFormSchema)(invalid)).toThrow();
    });
  });

  describe("ChatViewFormSchema (2-field form-level, modelId 可选)", () => {
    it("接受 valid 二元组", () => {
      const valid = { draft: "hello", modelId: "MiniMax-M2.5" };
      expect(Schema.decodeUnknownSync(ChatViewFormSchema)(valid)).toEqual(valid);
    });

    it("接受空 modelId", () => {
      const valid = { draft: "hello", modelId: "" };
      expect(Schema.decodeUnknownSync(ChatViewFormSchema)(valid)).toEqual(valid);
    });

    it("拒绝空 draft", () => {
      const invalid = { draft: "", modelId: "MiniMax-M2.5" };
      expect(() => Schema.decodeUnknownSync(ChatViewFormSchema)(invalid)).toThrow();
    });
  });
});
