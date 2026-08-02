// request-parser.test.ts — extractLastUserText / extractFirstUserText / countAssistantMessages 的 unit 测试(拆自 src/main/mock-server.test.ts)
import { describe, it, expect } from "vitest";
import {
  extractLastUserText,
  extractFirstUserText,
  countAssistantMessages,
} from "./request-parser";

describe("extractLastUserText — 提取 user 末条", () => {
  it("T8: messages 末条是 user + string content → 返回 string", () => {
    const body = { messages: [{ role: "user", content: "hello" }] };
    expect(extractLastUserText(body)).toBe("hello");
  });

  it("T9: messages 末条是 assistant → 向前找 user", () => {
    const body = {
      messages: [
        { role: "user", content: "first" },
        { role: "assistant", content: "ok" },
        { role: "user", content: "second" },
      ],
    };
    expect(extractLastUserText(body)).toBe("second");
  });

  it("T10: 无 user 消息 → 返回空字符串", () => {
    expect(extractLastUserText({ messages: [{ role: "assistant", content: "x" }] })).toBe("");
    expect(extractLastUserText({ messages: [] })).toBe("");
    expect(extractLastUserText({})).toBe("");
  });

  it("T11: user content 是 array/对象 → JSON 字符串化", () => {
    const body = { messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }] };
    expect(extractLastUserText(body)).toBe(JSON.stringify([{ type: "text", text: "hi" }]));
  });
});

describe("extractFirstUserText — 提取 user 首条 (scripted multi-turn lookup)", () => {
  it("T11a: 单 user 消息 → 返回该消息 text", () => {
    const body = { messages: [{ role: "user", content: "hello" }] };
    expect(extractFirstUserText(body)).toBe("hello");
  });

  it("T11b: 多 user 消息 + 中间有 assistant/tool → 返回第一个 user", () => {
    const body = {
      messages: [
        { role: "user", content: "summarize this" },
        { role: "assistant", content: [{ type: "tool_use", name: "read_file", input: {} }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "x", content: "file data" }] },
        { role: "user", content: "and also this" },
      ],
    };
    expect(extractFirstUserText(body)).toBe("summarize this");
  });

  it("T11c: 无 user 消息 → 返回空字符串", () => {
    expect(extractFirstUserText({ messages: [{ role: "assistant", content: "x" }] })).toBe("");
    expect(extractFirstUserText({ messages: [] })).toBe("");
    expect(extractFirstUserText({})).toBe("");
  });

  it("T11d: 首条 user content 是 array → JSON 字符串化", () => {
    const body = {
      messages: [
        { role: "user", content: [{ type: "text", text: "initial" }] },
        { role: "user", content: [{ type: "text", text: "follow-up" }] },
      ],
    };
    expect(extractFirstUserText(body)).toBe(
      JSON.stringify([{ type: "text", text: "initial" }]),
    );
  });
});

describe("countAssistantMessages — assistant 消息计数 (turn index)", () => {
  it("T11e: 0 assistant → 0 (initial request)", () => {
    expect(countAssistantMessages({ messages: [{ role: "user", content: "x" }] })).toBe(0);
  });

  it("T11f: 1 assistant → 1 (follow-up after 1 turn)", () => {
    expect(
      countAssistantMessages({
        messages: [
          { role: "user", content: "x" },
          { role: "assistant", content: "y" },
          { role: "user", content: "z" },
        ],
      }),
    ).toBe(1);
  });

  it("T11g: 多个 assistant (含 tool_use) → 准确计数", () => {
    expect(
      countAssistantMessages({
        messages: [
          { role: "user", content: "x" },
          { role: "assistant", content: [{ type: "tool_use", name: "t" }] },
          { role: "user", content: [{ type: "tool_result" }] },
          { role: "assistant", content: "summary" },
        ],
      }),
    ).toBe(2);
  });

  it("T11h: 无 messages → 0", () => {
    expect(countAssistantMessages({})).toBe(0);
    expect(countAssistantMessages({ messages: [] })).toBe(0);
    expect(countAssistantMessages(null)).toBe(0);
  });
});
