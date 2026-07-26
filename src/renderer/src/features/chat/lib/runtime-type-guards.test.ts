import { describe, expect, it } from "vitest";
import {
    isAssistantMessage,
    isAssistantLikeMessage,
    isTextBlock,
    isThinkingBlock,
    isToolCallBlock,
    contentOf,
} from "@codeman-frontend/features/chat/lib/runtime-type-guards";

describe("isAssistantMessage", () => {
    it("accepts AssistantMessage with role === assistant", () => {
        const msg = { role: "assistant" as const, content: [] };
        expect(isAssistantMessage(msg)).toBe(true);
    });

    it("rejects UserMessage", () => {
        const msg = { role: "user" as const, content: [] };
        expect(isAssistantMessage(msg)).toBe(false);
    });

    it("rejects ToolResultMessage", () => {
        const msg = { role: "toolResult" as const, content: [] };
        expect(isAssistantMessage(msg)).toBe(false);
    });

    it("returns false for null", () => {
        expect(isAssistantMessage(null)).toBe(false);
    });

    it("returns false for undefined", () => {
        expect(isAssistantMessage(undefined)).toBe(false);
    });
});

describe("isAssistantLikeMessage", () => {
    it("accepts role === assistant", () => {
        const msg = { role: "assistant", content: [] };
        expect(isAssistantLikeMessage(msg)).toBe(true);
    });

    it("rejects role === user", () => {
        const msg = { role: "user", content: [] };
        expect(isAssistantLikeMessage(msg)).toBe(false);
    });

    it("rejects role === toolResult", () => {
        const msg = { role: "toolResult", content: [] };
        expect(isAssistantLikeMessage(msg)).toBe(false);
    });

    it("returns false for null", () => {
        expect(isAssistantLikeMessage(null)).toBe(false);
    });

    it("returns false for undefined", () => {
        expect(isAssistantLikeMessage(undefined)).toBe(false);
    });

    it("accepts bare content with thinking block (no role)", () => {
        const msg = { content: [{ type: "thinking", thinking: "hm" }] };
        expect(isAssistantLikeMessage(msg)).toBe(true);
    });

    it("accepts bare content with toolCall block (no role)", () => {
        const msg = { content: [{ type: "toolCall", id: "x", name: "y", arguments: {} }] };
        expect(isAssistantLikeMessage(msg)).toBe(true);
    });

    it("accepts bare content with text block (no role)", () => {
        const msg = { content: [{ type: "text", text: "hello" }] };
        expect(isAssistantLikeMessage(msg)).toBe(true);
    });

    it("rejects bare content with only unknown block types", () => {
        const msg = { content: [{ type: "image", url: "..." }] };
        expect(isAssistantLikeMessage(msg)).toBe(false);
    });
});

describe("isTextBlock", () => {
    it("accepts { type: 'text', text: '...' }", () => {
        const block = { type: "text" as const, text: "hello" };
        expect(isTextBlock(block)).toBe(true);
    });

    it("rejects { type: 'thinking' }", () => {
        const block = { type: "thinking" as const, thinking: "hm" };
        expect(isTextBlock(block)).toBe(false);
    });

    it("rejects null", () => {
        expect(isTextBlock(null)).toBe(false);
    });

    it("rejects undefined", () => {
        expect(isTextBlock(undefined)).toBe(false);
    });

    it("rejects string", () => {
        expect(isTextBlock("text")).toBe(false);
    });

    it("rejects number", () => {
        expect(isTextBlock(42)).toBe(false);
    });
});

describe("isThinkingBlock", () => {
    it("accepts { type: 'thinking', thinking: '...' }", () => {
        const block = { type: "thinking" as const, thinking: "hm" };
        expect(isThinkingBlock(block)).toBe(true);
    });

    it("rejects { type: 'text' }", () => {
        const block = { type: "text" as const, text: "hello" };
        expect(isThinkingBlock(block)).toBe(false);
    });

    it("rejects non-objects", () => {
        expect(isThinkingBlock(null)).toBe(false);
        expect(isThinkingBlock("string")).toBe(false);
        expect(isThinkingBlock(42)).toBe(false);
    });
});

describe("isToolCallBlock", () => {
    it("accepts { type: 'toolCall', id: 'x', name: 'y', arguments: {} }", () => {
        const block = { type: "toolCall" as const, id: "x", name: "y", arguments: {} };
        expect(isToolCallBlock(block)).toBe(true);
    });

    it("rejects { type: 'text' }", () => {
        const block = { type: "text" as const, text: "hello" };
        expect(isToolCallBlock(block)).toBe(false);
    });

    it("rejects toolCall without id", () => {
        const block = { type: "toolCall" as const, name: "y", arguments: {} };
        expect(isToolCallBlock(block)).toBe(false);
    });

    it("rejects toolCall with non-string id", () => {
        const block = { type: "toolCall" as const, id: 123, name: "y", arguments: {} };
        expect(isToolCallBlock(block)).toBe(false);
    });
});

describe("contentOf", () => {
    it("returns array when object has array content", () => {
        const blocks = [{ type: "text", text: "x" }];
        expect(contentOf({ content: blocks })).toBe(blocks);
    });

    it("returns empty array when object has empty array content", () => {
        expect(contentOf({ content: [] })).toEqual([]);
    });

    it("returns empty array when object has no content field", () => {
        expect(contentOf({})).toEqual([]);
    });

    it("returns empty array for null", () => {
        expect(contentOf(null)).toEqual([]);
    });

    it("returns empty array for undefined", () => {
        expect(contentOf(undefined)).toEqual([]);
    });

    it("returns empty array for string (non-object)", () => {
        expect(contentOf("hello")).toEqual([]);
    });

    it("returns empty array for number (non-object)", () => {
        expect(contentOf(42)).toEqual([]);
    });

    it("returns empty array for boolean (non-object)", () => {
        expect(contentOf(true)).toEqual([]);
    });

    it("returns empty array when content is a string (not array)", () => {
        // UserMessage.content can be string OR array — guard must only return array branch
        expect(contentOf({ content: "hello" })).toEqual([]);
    });

    it("returns empty array when content is an object (not array)", () => {
        expect(contentOf({ content: { foo: "bar" } })).toEqual([]);
    });

    it("returns empty array when content is null", () => {
        expect(contentOf({ content: null })).toEqual([]);
    });
});
