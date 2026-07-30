import { describe, it, expect } from "vitest";
import { toPiMessages } from "@codeman-frontend/features/chat/lib/runtime-to-pi-messages";
import type { Message } from "@codeman-frontend/shared/lib/types";
import type {
  AssistantMessage,
  ToolResultMessage,
  Usage,
} from "@earendil-works/pi-ai";

const MODEL = { api: "anthropic-messages", provider: "anthropic" } as const;

function userMsg(overrides: Partial<Message> = {}): Message {
  return {
    id: "u1",
    conversationId: "c1",
    role: "user",
    content: "hello",
    thinking: null,
    toolCalls: null,
    toolResults: null,
    model: null,
    inputTokens: null,
    outputTokens: null,
    createdAt: 1000,
    ...overrides,
  };
}

function assistantMsg(overrides: Partial<Message> = {}): Message {
  return {
    id: "a1",
    conversationId: "c1",
    role: "assistant",
    content: "hi there",
    thinking: null,
    toolCalls: null,
    toolResults: null,
    model: "claude-sonnet",
    inputTokens: 10,
    outputTokens: 20,
    createdAt: 2000,
    ...overrides,
  };
}

function toolMsg(overrides: Partial<Message> = {}): Message {
  return {
    id: "t1",
    conversationId: "c1",
    role: "tool",
    content: "",
    thinking: null,
    toolCalls: null,
    toolResults: [{ toolCallId: "tc1", result: "ok", error: null }],
    model: null,
    inputTokens: null,
    outputTokens: null,
    createdAt: 3000,
    ...overrides,
  };
}

describe("toPiMessages()", () => {
  it("empty input → empty output", () => {
    expect(toPiMessages([], MODEL)).toEqual([]);
  });

  it("user message → Pi UserMessage", () => {
    const result = toPiMessages([userMsg({ content: "hello" })], MODEL);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      role: "user",
      content: "hello",
      timestamp: 1000,
    });
  });

  it("assistant with text only → AssistantMessage with single TextContent block", () => {
    const result = toPiMessages(
      [assistantMsg({ content: "answer", thinking: null, toolCalls: null })],
      MODEL,
    );
    expect(result).toHaveLength(1);
    const msg = result[0] as AssistantMessage;
    expect(msg.role).toBe("assistant");
    expect(msg.api).toBe("anthropic-messages");
    expect(msg.provider).toBe("anthropic");
    expect(msg.model).toBe("claude-sonnet");
    expect(msg.timestamp).toBe(2000);
    expect(msg.stopReason).toBe("stop");
    expect(msg.content).toEqual([{ type: "text", text: "answer" }]);
  });

  it("assistant with text + thinking → AssistantMessage with TextContent + ThinkingContent", () => {
    const result = toPiMessages(
      [
        assistantMsg({
          content: "answer",
          thinking: "thinking aloud",
          toolCalls: null,
        }),
      ],
      MODEL,
    );
    const msg = result[0] as AssistantMessage;
    expect(msg.content).toEqual([
      { type: "text", text: "answer" },
      { type: "thinking", thinking: "thinking aloud" },
    ]);
  });

  it("assistant with text + toolCalls → AssistantMessage with TextContent + ToolCall blocks", () => {
    const result = toPiMessages(
      [
        assistantMsg({
          content: "",
          thinking: null,
          toolCalls: [
            { id: "tc1", name: "read_file", args: { path: "/a" } },
            { id: "tc2", name: "write_file", args: { path: "/b" } },
          ],
        }),
      ],
      MODEL,
    );
    const msg = result[0] as AssistantMessage;
    expect(msg.content).toEqual([
      { type: "text", text: "" },
      {
        type: "toolCall",
        id: "tc1",
        name: "read_file",
        arguments: { path: "/a" },
      },
      {
        type: "toolCall",
        id: "tc2",
        name: "write_file",
        arguments: { path: "/b" },
      },
    ]);
  });

  it("assistant with text + thinking + toolCalls → all 3 block types in order", () => {
    const result = toPiMessages(
      [
        assistantMsg({
          content: "result",
          thinking: "thought",
          toolCalls: [{ id: "tc1", name: "echo", args: {} }],
        }),
      ],
      MODEL,
    );
    const msg = result[0] as AssistantMessage;
    expect(msg.content).toEqual([
      { type: "text", text: "result" },
      { type: "thinking", thinking: "thought" },
      { type: "toolCall", id: "tc1", name: "echo", arguments: {} },
    ]);
  });

  it("assistant with model=null → AssistantMessage.model='unknown'", () => {
    const result = toPiMessages(
      [assistantMsg({ model: null })],
      MODEL,
    );
    const msg = result[0] as AssistantMessage;
    expect(msg.model).toBe("unknown");
  });

  it("assistant synthesizes Usage from inputTokens + outputTokens (cost/cache = 0)", () => {
    const result = toPiMessages(
      [assistantMsg({ inputTokens: 100, outputTokens: 50 })],
      MODEL,
    );
    const msg = result[0] as AssistantMessage;
    const usage: Usage = msg.usage;
    expect(usage.input).toBe(100);
    expect(usage.output).toBe(50);
    expect(usage.cacheRead).toBe(0);
    expect(usage.cacheWrite).toBe(0);
    expect(usage.cost).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    });
  });

  it("assistant with inputTokens=null → Usage.input=0", () => {
    const result = toPiMessages(
      [assistantMsg({ inputTokens: null, outputTokens: null })],
      MODEL,
    );
    const msg = result[0] as AssistantMessage;
    expect(msg.usage.input).toBe(0);
    expect(msg.usage.output).toBe(0);
  });

  it("tool message with 1 result → 1 ToolResultMessage", () => {
    const result = toPiMessages(
      [
        toolMsg({
          toolResults: [{ toolCallId: "tc1", result: "ok", error: null }],
        }),
      ],
      MODEL,
    );
    expect(result).toHaveLength(1);
    const msg = result[0] as ToolResultMessage;
    expect(msg.role).toBe("toolResult");
    expect(msg.toolCallId).toBe("tc1");
    expect(msg.isError).toBe(false);
    expect(msg.content).toEqual([{ type: "text", text: "ok" }]);
  });

  it("tool message with N results → N ToolResultMessages (1-to-many expansion)", () => {
    const result = toPiMessages(
      [
        toolMsg({
          toolResults: [
            { toolCallId: "tc1", result: "r1", error: null },
            { toolCallId: "tc2", result: "r2", error: null },
            { toolCallId: "tc3", result: "r3", error: null },
          ],
        }),
      ],
      MODEL,
    );
    expect(result).toHaveLength(3);
    expect(result.map((m) => (m as ToolResultMessage).toolCallId)).toEqual([
      "tc1",
      "tc2",
      "tc3",
    ]);
  });

  it("tool result with error → isError=true + 'Error: <msg>' content", () => {
    const result = toPiMessages(
      [
        toolMsg({
          toolResults: [
            { toolCallId: "tc1", result: null, error: "boom" },
          ],
        }),
      ],
      MODEL,
    );
    const msg = result[0] as ToolResultMessage;
    expect(msg.isError).toBe(true);
    expect(msg.content).toEqual([{ type: "text", text: "Error: boom" }]);
  });

  it("tool result with object result → JSON.stringify", () => {
    const result = toPiMessages(
      [
        toolMsg({
          toolResults: [
            {
              toolCallId: "tc1",
              result: { ok: true, count: 42 },
              error: null,
            },
          ],
        }),
      ],
      MODEL,
    );
    const msg = result[0] as ToolResultMessage;
    expect(msg.content).toEqual([
      { type: "text", text: '{"ok":true,"count":42}' },
    ]);
  });

  it("tool result without preceding assistant → toolName='' (fallback)", () => {
    const result = toPiMessages(
      [
        toolMsg({
          toolResults: [{ toolCallId: "orphan", result: "x", error: null }],
        }),
      ],
      MODEL,
    );
    const msg = result[0] as ToolResultMessage;
    expect(msg.toolName).toBe("");
  });

  it("tool result resolves toolName from preceding assistant's toolCalls by id", () => {
    const result = toPiMessages(
      [
        assistantMsg({
          content: "",
          thinking: null,
          toolCalls: [
            { id: "tc1", name: "read_file", args: { path: "/a" } },
            { id: "tc2", name: "write_file", args: {} },
          ],
        }),
        toolMsg({
          toolResults: [
            { toolCallId: "tc2", result: "ok", error: null },
          ],
        }),
      ],
      MODEL,
    );
    expect(result).toHaveLength(2);
    const msg = result[1] as ToolResultMessage;
    expect(msg.toolName).toBe("write_file");
  });

  it("system message → skipped (not emitted to pi messages)", () => {
    const result = toPiMessages(
      [
        userMsg({ content: "u" }),
        { ...assistantMsg({}), role: "system" } as Message,
        userMsg({ id: "u2", content: "u2" }),
      ],
      MODEL,
    );
    
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.role)).toEqual(["user", "user"]);
  });

  it("mixed sequence preserves order and applies all transformations", () => {
    const result = toPiMessages(
      [
        userMsg({ id: "u1", content: "what is 2+2?" }),
        assistantMsg({
          id: "a1",
          content: "",
          thinking: "math",
          toolCalls: [{ id: "tc1", name: "calc", args: { expr: "2+2" } }],
          inputTokens: 5,
          outputTokens: 3,
        }),
        toolMsg({
          id: "t1",
          toolResults: [{ toolCallId: "tc1", result: 4, error: null }],
        }),
        assistantMsg({
          id: "a2",
          content: "4",
          thinking: null,
          toolCalls: null,
          inputTokens: 10,
          outputTokens: 2,
        }),
      ],
      MODEL,
    );
    expect(result).toHaveLength(4);
    expect(result.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "toolResult",
      "assistant",
    ]);
    
    expect((result[2] as ToolResultMessage).toolName).toBe("calc");

        const finalAssistant = result[3] as AssistantMessage;
        expect(finalAssistant.content).toEqual([{ type: "text", text: "4" }]);
        expect(finalAssistant.usage.input).toBe(10);
    });

  it("tool message with toolResults=null → no ToolResultMessage emitted", () => {
    const result = toPiMessages(
      [toolMsg({ toolResults: null })],
      MODEL,
    );
    expect(result).toEqual([]);
  });
});

















describe("toPiMessages() — G32: assistant.toolResults (ADR-0028)", () => {
  it("assistant with toolResults:[{tc1}] → AssistantMessage + 1 ToolResultMessage", () => {
    const result = toPiMessages(
      [
        assistantMsg({
          id: "a1",
          content: "",
          toolCalls: [{ id: "tc1", name: "read_file", args: { path: "/a" } }],
          toolResults: [{ toolCallId: "tc1", result: "file content", error: null }],
        }),
      ],
      MODEL,
    );
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe("assistant");
    expect(result[1].role).toBe("toolResult");
    const trMsg = result[1] as ToolResultMessage;
    expect(trMsg.toolCallId).toBe("tc1");
    expect(trMsg.toolName).toBe("read_file"); 
    expect(trMsg.content).toEqual([{ type: "text", text: "file content" }]);
  });

  it("assistant with N toolResults → AssistantMessage + N ToolResultMessages", () => {
    const result = toPiMessages(
      [
        assistantMsg({
          id: "a1",
          content: "",
          toolCalls: [
            { id: "tc1", name: "read_file", args: {} },
            { id: "tc2", name: "write_file", args: {} },
          ],
          toolResults: [
            { toolCallId: "tc1", result: "r1", error: null },
            { toolCallId: "tc2", result: "r2", error: null },
          ],
        }),
      ],
      MODEL,
    );
    expect(result).toHaveLength(3);
    expect(result[0].role).toBe("assistant");
    expect(result[1].role).toBe("toolResult");
    expect(result[2].role).toBe("toolResult");
    expect((result[1] as ToolResultMessage).toolCallId).toBe("tc1");
    expect((result[2] as ToolResultMessage).toolCallId).toBe("tc2");
  });

  it("assistant with toolResults:null (legacy text-only) → no ToolResultMessage emitted", () => {
    const result = toPiMessages(
      [assistantMsg({ content: "just text", toolCalls: null, toolResults: null })],
      MODEL,
    );
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("assistant");
  });

  it("assistant with toolResults:[{tc1}] after user message → order preserved", () => {
    const result = toPiMessages(
      [
        userMsg({ id: "u1", content: "do something" }),
        assistantMsg({
          id: "a1",
          content: "",
          toolCalls: [{ id: "tc1", name: "read_file", args: { path: "/x" } }],
          toolResults: [{ toolCallId: "tc1", result: "x content", error: null }],
        }),
        userMsg({ id: "u2", content: "now summarize" }),
      ],
      MODEL,
    );
    expect(result.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "toolResult",
      "user",
    ]);
    
    
    
  });

  it("toolName lookup prefers own toolCalls over lastAssistantToolCalls (per-turn ownership)", () => {
    
    
    const result = toPiMessages(
      [
        assistantMsg({
          id: "a1",
          content: "",
          toolCalls: [{ id: "tc_OLD", name: "old_tool", args: {} }],
          toolResults: [{ toolCallId: "tc_OLD", result: "old", error: null }],
        }),
        assistantMsg({
          id: "a2",
          content: "",
          toolCalls: [{ id: "tc_NEW", name: "new_tool", args: {} }],
          toolResults: [{ toolCallId: "tc_NEW", result: "new", error: null }],
        }),
      ],
      MODEL,
    );
    expect(result).toHaveLength(4);
    expect((result[1] as ToolResultMessage).toolName).toBe("old_tool");
    expect((result[3] as ToolResultMessage).toolName).toBe("new_tool");
  });
});