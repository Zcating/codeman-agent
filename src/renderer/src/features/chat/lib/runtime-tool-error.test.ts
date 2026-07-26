import { describe, it, expect } from "vitest";
import { extractToolErrorText } from "@codeman-frontend/features/chat/lib/runtime-tool-error";

describe("extractToolErrorText", () => {
    // AgentToolResult with text content
    it("returns text from AgentToolResult with single text block", () => {
        const result = {
            content: [{ type: "text", text: "boom" }],
            details: {},
        };
        expect(extractToolErrorText(result)).toBe("boom");
    });

    // AgentToolResult with multiple text blocks — concatenated
    it("concatenates multiple text blocks in AgentToolResult", () => {
        const result = {
            content: [
                { type: "text", text: "line 1" },
                { type: "text", text: "line 2" },
            ],
            details: {},
        };
        expect(extractToolErrorText(result)).toBe("line 1line 2");
    });

    // AgentToolResult with only image block — falls back to String(result)
    it("falls back to String when AgentToolResult has no text block", () => {
        const result = {
            content: [{ type: "image", data: "abc", mimeType: "image/png" }],
            details: {},
        };
        expect(extractToolErrorText(result)).toBe("[object Object]");
    });

    // AgentToolResult with empty content — falls back to String(result)
    it("falls back to String when AgentToolResult has empty content", () => {
        const result = { content: [], details: {} };
        expect(extractToolErrorText(result)).toBe("[object Object]");
    });

    // Error instance
    it("returns Error.message for Error instances", () => {
        expect(extractToolErrorText(new Error("network failure"))).toBe(
            "network failure"
        );
    });

    // Plain string — falls through to String()
    it("returns the string as-is for plain strings", () => {
        expect(extractToolErrorText("plain text")).toBe("plain text");
    });

    // undefined
    it("returns 'undefined' for undefined", () => {
        expect(extractToolErrorText(undefined)).toBe("undefined");
    });

    // null
    it("returns 'null' for null", () => {
        expect(extractToolErrorText(null)).toBe("null");
    });

    // Plain object without content field
    it("returns '[object Object]' for plain objects without content", () => {
        expect(extractToolErrorText({ foo: "bar" })).toBe("[object Object]");
    });
});
