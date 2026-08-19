import { describe, it, expect } from "vitest";
import { extractToolErrorText } from "@codeman-frontend/core/llm/runtime-tool-error";

describe("extractToolErrorText", () => {
    it("returns text from AgentToolResult with single text block", () => {
        const result = {
            content: [{ type: "text", text: "boom" }],
            details: {},
        };
        expect(extractToolErrorText(result)).toBe("boom");
    });

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

    it("falls back to String when AgentToolResult has no text block", () => {
        const result = {
            content: [{ type: "image", data: "abc", mimeType: "image/png" }],
            details: {},
        };
        expect(extractToolErrorText(result)).toBe("[object Object]");
    });

    it("falls back to String when AgentToolResult has empty content", () => {
        const result = { content: [], details: {} };
        expect(extractToolErrorText(result)).toBe("[object Object]");
    });

    it("returns Error.message for Error instances", () => {
        expect(extractToolErrorText(new Error("network failure"))).toBe(
            "network failure"
        );
    });

    it("returns the string as-is for plain strings", () => {
        expect(extractToolErrorText("plain text")).toBe("plain text");
    });

    it("returns 'undefined' for undefined", () => {
        expect(extractToolErrorText(undefined)).toBe("undefined");
    });

    it("returns 'null' for null", () => {
        expect(extractToolErrorText(null)).toBe("null");
    });

    it("returns '[object Object]' for plain objects without content", () => {
        expect(extractToolErrorText({ foo: "bar" })).toBe("[object Object]");
    });
});
